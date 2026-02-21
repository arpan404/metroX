from __future__ import annotations

import json
import time
import asyncio
from datetime import datetime, timezone
from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import auth_dependency
from app.config import get_settings
from app.db import SessionLocal, get_db
from app.models import (
    AFKRunState,
    Adjudication,
    AttackCase,
    ConfigProfile,
    ConfigSnapshot,
    Detection,
    DetectionVote,
    EvaluationSession,
    Execution,
    ExecutionCost,
    OrchestrationProfile,
    ProviderCredential,
    SecretKey,
    SecretKeyEvent,
    SecretAccessAudit,
    RunCostAggregate,
    Run,
    RunEvent,
    ScoreCard,
)
from app.schemas import (
    AdjudicationCreate,
    AdjudicationOut,
    CompareOut,
    ConfigProfileCreate,
    ConfigProfileOut,
    DriftOut,
    FeatureOut,
    MitigationExperimentCreate,
    MitigationExperimentOut,
    OrchestrationProfileCreate,
    OrchestrationProfileOut,
    OrchestrationProfileUpdate,
    PricingProfileCreate,
    ProviderCredentialCreate,
    ProviderCredentialOut,
    ProviderCredentialRotate,
    ProviderValidateRequest,
    RiskCardOut,
    RunCreate,
    RunOut,
    RunReportOut,
    SecretKeyCreate,
    SecretKeyEventOut,
    SecretKeyOut,
    SecretAccessAuditOut,
    ScoreCardOut,
    SessionCreate,
    SessionOut,
)
from app.services.clustering import list_clusters
from app.services.compare import compare_runs
from app.services.costing import cost_timeseries, pricing_profile_payload, rebuild_run_cost_aggregate, upsert_pricing_profile
from app.services.drift import drift_payload
from app.services.features import feature_table_for_run
from app.services.mitigation import create_mitigation_experiment, mitigation_payload
from app.services.orchestration_profiles import (
    bound_orchestration_snapshot,
    validate_orchestration_config,
)
from app.services.orchestrator import RunOrchestrator
from app.services.advanced_analytics import calibration_payload, cooccurrence_payload, forecast_payload, inference_payload
from app.services.providers import provider_capabilities, validate_provider
from app.services.reporting import generate_markdown_report
from app.services.risk import risk_cards
from app.services.run_queue import RUN_QUEUE
from app.services.adapters import normalize_target_type
from app.services.security import (
    SecretCipher,
    activate_key,
    create_key,
    list_key_events,
    list_keys,
    reencrypt_credentials,
    retire_key,
)

router = APIRouter(prefix="/v1", dependencies=[Depends(auth_dependency)])


def _run_pipeline_background(run_id: str) -> None:
    db = SessionLocal()
    try:
        orchestrator = RunOrchestrator(db)
        orchestrator.execute_run(run_id)
    finally:
        db.close()


def _provider_key_ref(db: Session, provider_type: str, api_key: str) -> str:
    cipher = SecretCipher(db)
    existing = (
        db.query(ProviderCredential)
        .filter(ProviderCredential.name == f"default-{provider_type}")
        .one_or_none()
    )
    encrypted_secret, key_version = cipher.encrypt(api_key)
    if existing:
        existing.encrypted_secret = encrypted_secret
        existing.key_version = key_version
        db.commit()
        return existing.id

    row = ProviderCredential(
        name=f"default-{provider_type}",
        provider_type=provider_type,
        encrypted_secret=encrypted_secret,
        key_version=key_version,
        status="active",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row.id


def _audit_secret_access(
    db: Session,
    *,
    provider_credential_id: str,
    action: str,
    success: bool,
    actor: str = "api",
    error: str | None = None,
) -> None:
    db.add(
        SecretAccessAudit(
            provider_credential_id=provider_credential_id,
            action=action,
            actor=actor,
            success=success,
            error=error,
        )
    )
    db.commit()


def _read_provider_api_key(db: Session, payload: ProviderValidateRequest) -> str:
    key = str(payload.api_key or "").strip()
    if key:
        return key
    if not payload.credential_id:
        return ""
    row = db.query(ProviderCredential).filter(ProviderCredential.id == payload.credential_id).one_or_none()
    if not row:
        return ""
    try:
        key = SecretCipher(db).decrypt(row.encrypted_secret)
        _audit_secret_access(
            db,
            provider_credential_id=row.id,
            action="decrypt_for_validation",
            success=True,
        )
        return key
    except Exception as exc:
        _audit_secret_access(
            db,
            provider_credential_id=row.id,
            action="decrypt_for_validation",
            success=False,
            error=str(exc),
        )
        return ""


@router.get("/afk/capabilities")
def get_afk_capabilities() -> dict:
    return {
        "version": "v1",
        "interaction_mode_default": "headless",
        "supported_interaction_modes": ["headless", "external", "interactive"],
        "subagent_router_strategies": ["taxonomy", "difficulty", "provider_slice", "round_robin"],
        "policy_profiles": ["strict_readonly", "balanced_eval", "live_exploratory"],
        "memory": {"backend": "postgres", "resume_supported": True, "threading_supported": True},
        "high_impact_features": [
            {
                "id": "multi_agent_join_policy",
                "name": "Join Policy Controls",
                "why": "Trade off strictness vs resiliency during attacker fan-out.",
                "config_keys": ["benchmark_config.afk_orchestration.join_policy"],
                "values": ["all_required", "allow_optional_failures", "first_success", "quorum"],
            },
            {
                "id": "runtime_budget_failsafe",
                "name": "Fail-Safe Budgets",
                "why": "Bound runaway agent behavior and enforce predictable cost/latency.",
                "config_keys": [
                    "benchmark_config.afk_orchestration.fail_safe.max_total_cost_usd",
                    "benchmark_config.afk_orchestration.fail_safe.max_wall_time_s",
                    "benchmark_config.afk_orchestration.fail_safe.max_llm_calls",
                ],
            },
            {
                "id": "subagent_backpressure",
                "name": "Backpressure and Parallelism",
                "why": "Prevent queue blowups in deep attack suites and keep run stability.",
                "config_keys": [
                    "benchmark_config.afk_orchestration.max_concurrent_subagents",
                    "benchmark_config.afk_orchestration.runner.max_parallel_subagents_per_parent",
                    "benchmark_config.afk_orchestration.runner.subagent_queue_backpressure_limit",
                ],
            },
            {
                "id": "fallback_model_chain",
                "name": "Fallback Model Chains",
                "why": "Maintain run continuity under provider outage/degradation.",
                "config_keys": ["benchmark_config.afk_orchestration.fail_safe.fallback_model_chain"],
            },
            {
                "id": "policy_gated_tools",
                "name": "Policy-Gated Tooling",
                "why": "Constrain dangerous tool actions during attack execution and target evaluation.",
                "config_keys": ["target_config.extra.policy_profile", "target_config.extra.allowed_tools"],
            },
            {
                "id": "prompt_file_loading",
                "name": "Prompt File Loader",
                "why": "Version and audit role prompts via files instead of inline strings.",
                "config_keys": [
                    "benchmark_config.afk_orchestration.prompts_dir",
                    "benchmark_config.afk_orchestration.coordinator_instruction_file",
                    "benchmark_config.afk_orchestration.roles[].instruction_file",
                    "target_config.extra.prompts_dir",
                    "target_config.extra.instruction_file",
                ],
            },
        ],
        "recommended_profiles": {
            "ci_strict": {
                "join_policy": "all_required",
                "max_concurrent_subagents": 2,
                "fail_safe": {"max_total_cost_usd": 0.25, "max_wall_time_s": 25.0, "max_llm_calls": 8},
            },
            "nightly_deep": {
                "join_policy": {"type": "quorum", "min_success": 3},
                "max_concurrent_subagents": 5,
                "fail_safe": {"max_total_cost_usd": 3.0, "max_wall_time_s": 120.0, "max_llm_calls": 40},
            },
        },
    }


@router.get("/providers/capabilities")
def get_provider_capabilities() -> dict:
    return provider_capabilities()


@router.post("/providers/validate")
def validate_provider_config(payload: ProviderValidateRequest, db: Session = Depends(get_db)) -> dict:
    settings = get_settings()
    if payload.credential_id and settings.credential_rotation_enforced:
        row = db.query(ProviderCredential).filter(ProviderCredential.id == payload.credential_id).one_or_none()
        if not row:
            raise HTTPException(status_code=404, detail="Provider credential not found")
        rotated_at = row.last_rotated_at or row.created_at
        if row.status != "active":
            return {"valid": False, "provider_type": payload.provider_type, "error": "credential is not active"}
        if rotated_at and rotated_at < datetime.now(timezone.utc) - timedelta(days=settings.credential_rotation_max_age_days):
            return {
                "valid": False,
                "provider_type": payload.provider_type,
                "error": "credential rotation required",
            }
    api_key = _read_provider_api_key(db, payload)
    check_payload = payload.model_dump()
    check_payload["provider_type"] = str(payload.provider_type)
    check_payload["api_key"] = api_key
    result = validate_provider(check_payload)
    if result.get("valid") and api_key:
        try:
            result["api_key_ref"] = _provider_key_ref(db, str(payload.provider_type), api_key)
        except ValueError as exc:
            warnings = list(result.get("warnings") or [])
            warnings.append(str(exc))
            result["warnings"] = warnings
    if payload.credential_id:
        result["credential_id"] = payload.credential_id
        row = db.query(ProviderCredential).filter(ProviderCredential.id == payload.credential_id).one_or_none()
        if row and result.get("valid"):
            row.last_validated_at = datetime.now(timezone.utc)
            db.commit()
    return result


@router.post("/providers/credentials", response_model=ProviderCredentialOut)
def create_provider_credential(payload: ProviderCredentialCreate, db: Session = Depends(get_db)) -> ProviderCredentialOut:
    settings = get_settings()
    if len(payload.api_key or "") < settings.credential_min_key_length:
        raise HTTPException(status_code=400, detail=f"api_key must be at least {settings.credential_min_key_length} chars")
    try:
        encrypted_secret, key_version = SecretCipher(db).encrypt(payload.api_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    row = ProviderCredential(
        name=payload.name,
        provider_type=str(payload.provider_type),
        encrypted_secret=encrypted_secret,
        key_version=key_version,
        status=payload.status,
        last_rotated_at=datetime.now(timezone.utc),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    _audit_secret_access(
        db,
        provider_credential_id=row.id,
        action="create",
        success=True,
    )
    return ProviderCredentialOut.model_validate(row, from_attributes=True)


@router.get("/providers/credentials")
def list_provider_credentials(db: Session = Depends(get_db)) -> dict:
    rows = db.query(ProviderCredential).order_by(ProviderCredential.created_at.desc()).all()
    return {
        "credentials": [ProviderCredentialOut.model_validate(row, from_attributes=True).model_dump() for row in rows]
    }


@router.get("/providers/credentials/{credential_id}", response_model=ProviderCredentialOut)
def get_provider_credential(credential_id: str, db: Session = Depends(get_db)) -> ProviderCredentialOut:
    row = db.query(ProviderCredential).filter(ProviderCredential.id == credential_id).one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Provider credential not found")
    return ProviderCredentialOut.model_validate(row, from_attributes=True)


@router.post("/providers/credentials/{credential_id}/rotate", response_model=ProviderCredentialOut)
def rotate_provider_credential(
    credential_id: str,
    payload: ProviderCredentialRotate,
    db: Session = Depends(get_db),
) -> ProviderCredentialOut:
    settings = get_settings()
    row = db.query(ProviderCredential).filter(ProviderCredential.id == credential_id).one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Provider credential not found")
    if len(payload.api_key or "") < settings.credential_min_key_length:
        raise HTTPException(status_code=400, detail=f"api_key must be at least {settings.credential_min_key_length} chars")
    if payload.key_version and payload.key_version == row.key_version:
        raise HTTPException(status_code=400, detail="key_version must advance on rotation")

    try:
        encrypted_secret, active_version = SecretCipher(db).encrypt(payload.api_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    row.encrypted_secret = encrypted_secret
    if payload.key_version:
        row.key_version = payload.key_version
    else:
        row.key_version = active_version
    if payload.status:
        row.status = payload.status
    row.last_rotated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    _audit_secret_access(
        db,
        provider_credential_id=row.id,
        action="rotate",
        success=True,
    )
    return ProviderCredentialOut.model_validate(row, from_attributes=True)


@router.get("/providers/credentials/{credential_id}/audits")
def list_provider_credential_audits(credential_id: str, db: Session = Depends(get_db)) -> dict:
    row = db.query(ProviderCredential).filter(ProviderCredential.id == credential_id).one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Provider credential not found")
    audits = (
        db.query(SecretAccessAudit)
        .filter(SecretAccessAudit.provider_credential_id == credential_id)
        .order_by(SecretAccessAudit.created_at.desc())
        .limit(100)
        .all()
    )
    return {
        "credential_id": credential_id,
        "audits": [SecretAccessAuditOut.model_validate(item, from_attributes=True).model_dump() for item in audits],
    }


@router.post("/security/keys", response_model=SecretKeyOut)
def create_security_key(payload: SecretKeyCreate, db: Session = Depends(get_db)) -> SecretKeyOut:
    try:
        row = create_key(db, version=payload.version, key_material=payload.key_material, actor=payload.actor)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return SecretKeyOut.model_validate(row, from_attributes=True)


@router.get("/security/keys")
def get_security_keys(db: Session = Depends(get_db)) -> dict:
    rows = list_keys(db)
    return {"keys": [SecretKeyOut.model_validate(item, from_attributes=True).model_dump() for item in rows]}


@router.post("/security/keys/{key_id}/activate", response_model=SecretKeyOut)
def activate_security_key(key_id: str, actor: str = Query(default="api"), db: Session = Depends(get_db)) -> SecretKeyOut:
    try:
        row = activate_key(db, key_id=key_id, actor=actor)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return SecretKeyOut.model_validate(row, from_attributes=True)


@router.post("/security/keys/{key_id}/reencrypt-credentials")
def reencrypt_security_credentials(
    key_id: str,
    actor: str = Query(default="api"),
    db: Session = Depends(get_db),
) -> dict:
    try:
        result = reencrypt_credentials(db, key_id=key_id, actor=actor)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"key_id": key_id, **result}


@router.post("/security/keys/{key_id}/retire", response_model=SecretKeyOut)
def retire_security_key(key_id: str, actor: str = Query(default="api"), db: Session = Depends(get_db)) -> SecretKeyOut:
    try:
        row = retire_key(db, key_id=key_id, actor=actor)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return SecretKeyOut.model_validate(row, from_attributes=True)


@router.get("/security/keys/events")
def get_security_key_events(db: Session = Depends(get_db)) -> dict:
    rows = list_key_events(db)
    return {"events": [SecretKeyEventOut.model_validate(item, from_attributes=True).model_dump() for item in rows]}


@router.post("/orchestration-profiles", response_model=OrchestrationProfileOut)
def create_orchestration_profile(
    payload: OrchestrationProfileCreate,
    db: Session = Depends(get_db),
) -> OrchestrationProfileOut:
    try:
        validated_config = validate_orchestration_config(payload.config)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    row = OrchestrationProfile(
        name=payload.name,
        description=payload.description,
        version=payload.version,
        status=payload.status,
        config=validated_config,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return OrchestrationProfileOut.model_validate(row, from_attributes=True)


@router.get("/orchestration-profiles")
def list_orchestration_profiles(db: Session = Depends(get_db)) -> dict:
    rows = db.query(OrchestrationProfile).order_by(OrchestrationProfile.created_at.desc()).all()
    return {
        "profiles": [OrchestrationProfileOut.model_validate(item, from_attributes=True).model_dump() for item in rows]
    }


@router.get("/orchestration-profiles/{profile_id}", response_model=OrchestrationProfileOut)
def get_orchestration_profile(profile_id: str, db: Session = Depends(get_db)) -> OrchestrationProfileOut:
    row = db.query(OrchestrationProfile).filter(OrchestrationProfile.id == profile_id).one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Orchestration profile not found")
    return OrchestrationProfileOut.model_validate(row, from_attributes=True)


@router.patch("/orchestration-profiles/{profile_id}", response_model=OrchestrationProfileOut)
def update_orchestration_profile(
    profile_id: str,
    payload: OrchestrationProfileUpdate,
    db: Session = Depends(get_db),
) -> OrchestrationProfileOut:
    row = db.query(OrchestrationProfile).filter(OrchestrationProfile.id == profile_id).one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Orchestration profile not found")
    current_version = row.version
    if payload.description is not None:
        row.description = payload.description
    if payload.version is not None and payload.version == current_version:
        raise HTTPException(status_code=400, detail="version must advance when updating orchestration profile")
    if payload.version is not None:
        row.version = payload.version
    if payload.status is not None:
        row.status = payload.status
    if payload.config is not None:
        try:
            merged_config = {**(row.config or {}), **payload.config}
            row.config = validate_orchestration_config(merged_config)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    db.commit()
    db.refresh(row)
    return OrchestrationProfileOut.model_validate(row, from_attributes=True)


@router.post("/pricing-profiles")
def create_pricing_profile(payload: PricingProfileCreate, db: Session = Depends(get_db)) -> dict:
    row = upsert_pricing_profile(
        db,
        name=payload.name,
        currency=payload.currency,
        fallback_policy=payload.fallback_policy,
        models=payload.models,
        notes=payload.notes,
    )
    return pricing_profile_payload(db, row.id)


@router.get("/pricing-profiles/{profile_id}")
def get_pricing_profile(profile_id: str, db: Session = Depends(get_db)) -> dict:
    try:
        return pricing_profile_payload(db, profile_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/sessions", response_model=SessionOut)
def create_session(payload: SessionCreate, db: Session = Depends(get_db)) -> SessionOut:
    row = EvaluationSession(name=payload.name, description=payload.description, owner=payload.owner)
    db.add(row)
    db.commit()
    db.refresh(row)
    return SessionOut.model_validate(row, from_attributes=True)


@router.get("/sessions/{session_id}", response_model=SessionOut)
def get_session(session_id: str, db: Session = Depends(get_db)) -> SessionOut:
    row = db.query(EvaluationSession).filter(EvaluationSession.id == session_id).one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    return SessionOut.model_validate(row, from_attributes=True)


@router.post("/config-profiles", response_model=ConfigProfileOut)
def create_profile(payload: ConfigProfileCreate, db: Session = Depends(get_db)) -> ConfigProfileOut:
    session = db.query(EvaluationSession).filter(EvaluationSession.id == payload.session_id).one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    orchestration_cfg = payload.benchmark_config.afk_orchestration
    orchestration_meta: dict[str, str] | None = None
    if payload.orchestration_profile_id:
        orchestration_profile = (
            db.query(OrchestrationProfile)
            .filter(OrchestrationProfile.id == payload.orchestration_profile_id)
            .one_or_none()
        )
        if not orchestration_profile:
            raise HTTPException(status_code=404, detail="Orchestration profile not found")
        try:
            merged = {**(orchestration_profile.config or {}), **(orchestration_cfg or {})}
            orchestration_cfg = validate_orchestration_config(merged)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        orchestration_meta = bound_orchestration_snapshot(
            profile_id=orchestration_profile.id,
            profile_name=orchestration_profile.name,
            profile_version=orchestration_profile.version,
            config=orchestration_cfg,
        )
    else:
        try:
            orchestration_cfg = validate_orchestration_config(orchestration_cfg)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    normalized_target_type = normalize_target_type(payload.target_config.target_type)
    if payload.target_config.target_type != normalized_target_type:
        raise HTTPException(
            status_code=400,
            detail="Legacy target_type is not accepted on write. Use managed_llm_runtime or managed_agent_runtime.",
        )
    target_config = payload.target_config.model_dump()
    target_config["target_type"] = normalized_target_type

    row = ConfigProfile(
        session_id=payload.session_id,
        name=payload.name,
        strictness_mode=payload.scoring_config.strictness_mode,
        orchestration_profile_id=payload.orchestration_profile_id,
        target_config=target_config,
        benchmark_config={
            **payload.benchmark_config.model_dump(),
            "afk_orchestration": orchestration_cfg,
            "orchestration_profile_snapshot": orchestration_meta,
        },
        scoring_config=payload.scoring_config.model_dump(),
        runtime_config=payload.runtime_config.model_dump(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return ConfigProfileOut.model_validate(row, from_attributes=True)


@router.get("/config-profiles/{profile_id}", response_model=ConfigProfileOut)
def get_profile(profile_id: str, db: Session = Depends(get_db)) -> ConfigProfileOut:
    row = db.query(ConfigProfile).filter(ConfigProfile.id == profile_id).one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Config profile not found")
    if isinstance(row.target_config, dict):
        current = str(row.target_config.get("target_type", "")).strip()
        row.target_config = {**row.target_config, "target_type": normalize_target_type(current)}
    return ConfigProfileOut.model_validate(row, from_attributes=True)


@router.post("/runs", response_model=RunOut)
def create_run(
    payload: RunCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> RunOut:
    session = db.query(EvaluationSession).filter(EvaluationSession.id == payload.session_id).one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    profile = db.query(ConfigProfile).filter(ConfigProfile.id == payload.config_profile_id).one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Config profile not found")

    run = Run(
        session_id=payload.session_id,
        config_profile_id=payload.config_profile_id,
        baseline_run_id=payload.baseline_run_id,
        preset=payload.preset,
        mode=payload.mode,
        strictness=payload.strictness,
        status="queued",
        created_at=datetime.now(timezone.utc),
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    snapshot = ConfigSnapshot(
        config_profile_id=profile.id,
        run_id=run.id,
        snapshot={
            "target_config": profile.target_config,
            "benchmark_config": profile.benchmark_config,
            "scoring_config": profile.scoring_config,
            "runtime_config": profile.runtime_config,
            "strictness": run.strictness,
            "mode": run.mode,
            "preset": run.preset,
            "orchestration_profile_snapshot": (profile.benchmark_config or {}).get("orchestration_profile_snapshot"),
        },
    )
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)
    run.config_snapshot_id = snapshot.id
    db.commit()
    db.refresh(run)

    if payload.execute_now:
        settings = get_settings()
        if settings.run_queue_enabled:
            RUN_QUEUE.enqueue(run.id)
            log_event(
                db,
                run_id=run.id,
                event_type="queued",
                step=0,
                message="Run queued for worker execution",
            )
        else:
            background_tasks.add_task(_run_pipeline_background, run.id)

    return RunOut.model_validate(run, from_attributes=True)


@router.get("/queue/stats")
def queue_stats() -> dict:
    stats = RUN_QUEUE.stats()
    settings = get_settings()
    return {
        "pending": stats.pending,
        "dlq_pending": stats.dlq_pending,
        "workers": stats.workers,
        "live_workers": stats.live_workers,
        "started": stats.started,
        "backend": settings.run_queue_backend,
    }


@router.get("/runs/{run_id}", response_model=RunOut)
def get_run(run_id: str, db: Session = Depends(get_db)) -> RunOut:
    run = db.query(Run).filter(Run.id == run_id).one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return RunOut.model_validate(run, from_attributes=True)


@router.post("/runs/{run_id}/resume", response_model=RunOut)
def resume_run(run_id: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)) -> RunOut:
    run = db.query(Run).filter(Run.id == run_id).one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status == "completed":
        raise HTTPException(status_code=400, detail="Run already completed")

    run.status = "queued"
    db.commit()
    db.add(
        AFKRunState(
            run_id=run.id,
            thread_id=run.thread_id or f"run-{run.id}",
            state="resumed",
            step=0,
            checkpoint={"resume_requested_at": datetime.now(timezone.utc).isoformat()},
        )
    )
    db.commit()
    settings = get_settings()
    if settings.run_queue_enabled:
        RUN_QUEUE.enqueue(run.id)
        log_event(
            db,
            run_id=run.id,
            event_type="queued",
            step=0,
            message="Resumed run queued for worker execution",
        )
    else:
        background_tasks.add_task(_run_pipeline_background, run.id)
    db.refresh(run)
    return RunOut.model_validate(run, from_attributes=True)


@router.get("/runs/{run_id}/events")
def stream_run_events(run_id: str, db: Session = Depends(get_db)) -> StreamingResponse:
    run = db.query(Run).filter(Run.id == run_id).one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    def event_generator() -> str:
        last_id = 0
        terminal_states = {"completed", "failed", "interrupted"}
        stream_db = SessionLocal()
        try:
            while True:
                events = (
                    stream_db.query(RunEvent)
                    .filter(RunEvent.run_id == run_id, RunEvent.id > last_id)
                    .order_by(RunEvent.id.asc())
                    .all()
                )
                for event in events:
                    payload = {
                        "id": event.id,
                        "event_type": event.event_type,
                        "step": event.step,
                        "message": event.message,
                        "data": event.data,
                        "created_at": event.created_at.isoformat(),
                    }
                    last_id = event.id
                    yield f"data: {json.dumps(payload)}\n\n"

                current = stream_db.query(Run).filter(Run.id == run_id).one_or_none()
                if current and current.status in terminal_states:
                    yield "event: end\ndata: {}\n\n"
                    break
                time.sleep(1)
        finally:
            stream_db.close()

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.websocket("/runs/{run_id}/ws")
async def stream_run_events_ws(websocket: WebSocket, run_id: str) -> None:
    settings = get_settings()
    api_key = websocket.query_params.get("api_key")
    if api_key != settings.api_key:
        await websocket.close(code=4401)
        return
    await websocket.accept()
    last_id = 0
    terminal_states = {"completed", "failed", "interrupted"}
    stream_db = SessionLocal()
    try:
        while True:
            events = (
                stream_db.query(RunEvent)
                .filter(RunEvent.run_id == run_id, RunEvent.id > last_id)
                .order_by(RunEvent.id.asc())
                .all()
            )
            for event in events:
                payload = {
                    "id": event.id,
                    "event_type": event.event_type,
                    "step": event.step,
                    "message": event.message,
                    "data": event.data,
                    "created_at": event.created_at.isoformat(),
                }
                last_id = event.id
                await websocket.send_json(payload)

            current = stream_db.query(Run).filter(Run.id == run_id).one_or_none()
            if current and current.status in terminal_states:
                await websocket.send_json({"event_type": "end"})
                break
            await websocket.send_json({"event_type": "heartbeat"})
            await asyncio.sleep(1.0)
    except WebSocketDisconnect:
        return
    except Exception:
        return
    finally:
        stream_db.close()


@router.get("/runs/{run_id}/scorecard", response_model=ScoreCardOut)
def get_scorecard(run_id: str, db: Session = Depends(get_db)) -> ScoreCardOut:
    card = db.query(ScoreCard).filter(ScoreCard.run_id == run_id).one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="Scorecard not found")
    return ScoreCardOut(run_id=run_id, metrics=card.metrics, gates=card.gates, ci=card.ci)


@router.get("/runs/{run_id}/risk-cards", response_model=RiskCardOut)
def get_risk_cards(run_id: str, db: Session = Depends(get_db)) -> RiskCardOut:
    return RiskCardOut(run_id=run_id, risks=risk_cards(db, run_id))


@router.get("/runs/{run_id}/features", response_model=FeatureOut)
def get_features(run_id: str, db: Session = Depends(get_db)) -> FeatureOut:
    return FeatureOut(run_id=run_id, features=feature_table_for_run(db, run_id))


@router.get("/runs/{run_id}/detector-votes")
def get_detector_votes(run_id: str, db: Session = Depends(get_db)) -> dict:
    execution_ids = [row[0] for row in db.query(Execution.id).filter(Execution.run_id == run_id).all()]
    if not execution_ids:
        return {"run_id": run_id, "votes": []}
    rows = (
        db.query(DetectionVote)
        .filter(DetectionVote.execution_id.in_(execution_ids))
        .order_by(DetectionVote.created_at.desc())
        .all()
    )
    return {
        "run_id": run_id,
        "votes": [
            {
                "id": row.id,
                "execution_id": row.execution_id,
                "detector_name": row.detector_name,
                "failure_flags": row.failure_flags,
                "confidence": row.confidence,
                "evidence": row.evidence,
                "latency_ms": row.latency_ms,
                "created_at": row.created_at.isoformat(),
            }
            for row in rows
        ],
    }


@router.get("/runs/{run_id}/clusters")
def get_clusters(run_id: str, db: Session = Depends(get_db)) -> dict:
    return {"run_id": run_id, "clusters": list_clusters(db, run_id)}


@router.get("/runs/{run_id}/attack-summary")
def get_attack_summary(run_id: str, db: Session = Depends(get_db)) -> dict:
    run = db.query(Run).filter(Run.id == run_id).one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    execution_rows = (
        db.query(Execution.id, AttackCase.attack_type)
        .join(AttackCase, AttackCase.id == Execution.attack_case_id)
        .filter(Execution.run_id == run_id)
        .all()
    )
    if not execution_rows:
        return {"run_id": run_id, "attack_types": [], "detector_summary": {"avg_disagreement": 0.0, "avg_uncertainty": 0.0}}

    attack_type_by_execution = {execution_id: attack_type for execution_id, attack_type in execution_rows}
    detections = (
        db.query(Detection)
        .filter(Detection.execution_id.in_(list(attack_type_by_execution.keys())))
        .all()
    )

    summary: dict[str, dict] = {}
    for detection in detections:
        attack_type = attack_type_by_execution.get(detection.execution_id, "unknown")
        row = summary.setdefault(
            attack_type,
            {
                "attack_type": attack_type,
                "total": 0,
                "success": 0,
                "failure": 0,
                "success_rate": 0.0,
                "avg_confidence": 0.0,
                "severity_breakdown": {"critical": 0, "high": 0, "medium": 0, "low": 0},
            },
        )
        row["total"] += 1
        was_success = any(detection.failure_flags.values())
        if was_success:
            row["success"] += 1
        else:
            row["failure"] += 1
        row["avg_confidence"] += float(detection.confidence)
        sev = str(detection.severity or "low").lower()
        if sev not in row["severity_breakdown"]:
            sev = "low"
        row["severity_breakdown"][sev] += 1

    ordered = []
    for attack_type, row in sorted(summary.items(), key=lambda item: item[0]):
        total = max(int(row["total"]), 1)
        row["success_rate"] = float(row["success"]) / total
        row["avg_confidence"] = float(row["avg_confidence"]) / total
        ordered.append(row)

    avg_disagreement = float(sum(float(item.disagreement_score or 0.0) for item in detections) / max(len(detections), 1))
    avg_uncertainty = float(sum(float(item.uncertainty or 0.0) for item in detections) / max(len(detections), 1))
    return {
        "run_id": run_id,
        "attack_types": ordered,
        "detector_summary": {
            "avg_disagreement": avg_disagreement,
            "avg_uncertainty": avg_uncertainty,
            "count": len(detections),
        },
    }


@router.get("/runs/{run_id}/node-telemetry")
def get_node_telemetry(run_id: str, db: Session = Depends(get_db)) -> dict:
    run = db.query(Run).filter(Run.id == run_id).one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    executions = (
        db.query(Execution, AttackCase, Detection, ExecutionCost)
        .join(AttackCase, AttackCase.id == Execution.attack_case_id)
        .outerjoin(Detection, Detection.execution_id == Execution.id)
        .outerjoin(ExecutionCost, ExecutionCost.execution_id == Execution.id)
        .filter(Execution.run_id == run_id)
        .all()
    )
    by_attack: dict[str, dict] = {}
    for execution, attack_case, detection, cost in executions:
        attack = str(attack_case.attack_type or "unknown")
        row = by_attack.setdefault(
            attack,
            {
                "attack_type": attack,
                "total": 0,
                "success": 0,
                "failure": 0,
                "avg_latency_ms": 0.0,
                "cost_usd": 0.0,
                "policy_decisions": 0,
                "tool_events": 0,
            },
        )
        row["total"] += 1
        row["avg_latency_ms"] += float(execution.latency_ms or 0.0)
        row["cost_usd"] += float(cost.effective_cost_usd if cost else 0.0)
        flags = detection.failure_flags if detection else {}
        is_success = any(flags.values()) if isinstance(flags, dict) else False
        if is_success:
            row["success"] += 1
        else:
            row["failure"] += 1
        for event in execution.tool_events or []:
            row["tool_events"] += 1
            if str(event.get("event_type", "")).strip() == "policy_decision":
                row["policy_decisions"] += 1

    payload = []
    for attack, row in sorted(by_attack.items(), key=lambda item: item[0]):
        total = max(1, int(row["total"]))
        row["avg_latency_ms"] = float(row["avg_latency_ms"]) / total
        row["success_rate"] = float(row["success"]) / total
        payload.append(row)
    return {"run_id": run_id, "nodes": payload}


@router.get("/runs/{run_id}/execution-slices")
def get_execution_slices(run_id: str, db: Session = Depends(get_db)) -> dict:
    run = db.query(Run).filter(Run.id == run_id).one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    rows = (
        db.query(
            AttackCase.attack_type,
            Execution.provider_name,
            Execution.model_resolved,
            func.count(Execution.id),
            func.avg(Execution.latency_ms),
            func.sum(ExecutionCost.effective_cost_usd),
        )
        .join(AttackCase, AttackCase.id == Execution.attack_case_id)
        .outerjoin(ExecutionCost, ExecutionCost.execution_id == Execution.id)
        .filter(Execution.run_id == run_id)
        .group_by(AttackCase.attack_type, Execution.provider_name, Execution.model_resolved)
        .all()
    )
    return {
        "run_id": run_id,
        "slices": [
            {
                "attack_type": str(attack_type or "unknown"),
                "provider_name": str(provider_name or "unknown"),
                "model": str(model or "unknown"),
                "count": int(count or 0),
                "avg_latency_ms": float(avg_latency or 0.0),
                "effective_cost_usd": float(cost or 0.0),
            }
            for attack_type, provider_name, model, count, avg_latency, cost in rows
        ],
    }


@router.get("/runs/{run_id}/drift", response_model=DriftOut)
def get_drift(run_id: str, db: Session = Depends(get_db)) -> DriftOut:
    payload = drift_payload(db, run_id)
    return DriftOut.model_validate(payload)


@router.get("/runs/{run_id}/cost-summary")
def get_cost_summary(run_id: str, db: Session = Depends(get_db)) -> dict:
    run = db.query(Run).filter(Run.id == run_id).one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    payload = rebuild_run_cost_aggregate(db, run_id)
    payload["budget_usd"] = (run.summary_metrics or {}).get("budget_usd", None)
    payload["cost_gate"] = run.cost_gate_result or {}
    return payload


@router.get("/runs/{run_id}/cost-timeseries")
def get_cost_timeseries(run_id: str, db: Session = Depends(get_db)) -> dict:
    run = db.query(Run).filter(Run.id == run_id).one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return cost_timeseries(db, run_id)


@router.get("/runs/{run_id}/policy-events")
def get_policy_events(run_id: str, db: Session = Depends(get_db)) -> dict:
    run = db.query(Run).filter(Run.id == run_id).one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    rows = (
        db.query(RunEvent)
        .filter(RunEvent.run_id == run_id, RunEvent.event_type.in_(["policy_decision", "run_paused", "run_resumed"]))
        .order_by(RunEvent.id.asc())
        .all()
    )
    return {
        "run_id": run_id,
        "events": [
            {
                "id": row.id,
                "event_type": row.event_type,
                "step": row.step,
                "message": row.message,
                "data": row.data,
                "created_at": row.created_at.isoformat(),
            }
            for row in rows
        ],
    }


@router.get("/runs/{run_id}/telemetry")
def get_run_telemetry(run_id: str, db: Session = Depends(get_db)) -> dict:
    run = db.query(Run).filter(Run.id == run_id).one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    rows = (
        db.query(RunEvent.event_type, func.count(RunEvent.id))
        .filter(RunEvent.run_id == run_id)
        .group_by(RunEvent.event_type)
        .all()
    )
    execution_ids = [row[0] for row in db.query(Execution.id).filter(Execution.run_id == run_id).all()]
    detection_rows = (
        db.query(Detection).filter(Detection.execution_id.in_(execution_ids)).all() if execution_ids else []
    )
    avg_disagreement = float(
        sum(float(item.disagreement_score or 0.0) for item in detection_rows) / max(len(detection_rows), 1)
    )
    avg_uncertainty = float(
        sum(float(item.uncertainty or 0.0) for item in detection_rows) / max(len(detection_rows), 1)
    )
    return {
        "run_id": run_id,
        "status": run.status,
        "progress": {"completed": run.completed_attacks, "total": run.total_attacks},
        "event_counts": {event_type: int(count) for event_type, count in rows},
        "detector_summary": {
            "avg_disagreement": avg_disagreement,
            "avg_uncertainty": avg_uncertainty,
            "count": len(detection_rows),
        },
        "cost": {
            "spent_usd": float(run.budget_spent_usd or 0.0),
            "projected_final_usd": float(run.estimated_final_cost_usd or 0.0),
        },
    }


@router.get("/runs/{run_id}/calibration")
def get_calibration(run_id: str, db: Session = Depends(get_db)) -> dict:
    run = db.query(Run).filter(Run.id == run_id).one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return calibration_payload(db, run_id)


@router.get("/runs/{run_id}/inference")
def get_inference(run_id: str, db: Session = Depends(get_db)) -> dict:
    run = db.query(Run).filter(Run.id == run_id).one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return inference_payload(db, run_id)


@router.get("/runs/{run_id}/cooccurrence-graph")
def get_cooccurrence(run_id: str, db: Session = Depends(get_db)) -> dict:
    run = db.query(Run).filter(Run.id == run_id).one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return cooccurrence_payload(db, run_id)


@router.get("/runs/{run_id}/forecast")
def get_forecast(run_id: str, db: Session = Depends(get_db)) -> dict:
    run = db.query(Run).filter(Run.id == run_id).one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return forecast_payload(db, run_id)


@router.post("/adjudications", response_model=AdjudicationOut)
def create_adjudication(payload: AdjudicationCreate, db: Session = Depends(get_db)) -> AdjudicationOut:
    run = db.query(Run).filter(Run.id == payload.run_id).one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    execution = db.query(Execution).filter(Execution.id == payload.execution_id).one_or_none()
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")

    row = Adjudication(
        run_id=payload.run_id,
        execution_id=payload.execution_id,
        reviewer=payload.reviewer,
        decision=payload.decision,
        rationale=payload.rationale,
    )
    db.add(row)

    detection = db.query(Detection).filter(Detection.execution_id == payload.execution_id).one_or_none()
    if detection:
        flags = {key: False for key in detection.failure_flags.keys()}
        if payload.decision != "none":
            flags[payload.decision] = True
        detection.failure_flags = flags
        detection.confidence = max(detection.confidence, 0.95)

    db.commit()
    db.refresh(row)
    return AdjudicationOut.model_validate(row, from_attributes=True)


@router.post("/mitigation-experiments", response_model=MitigationExperimentOut)
def create_mitigation(payload: MitigationExperimentCreate, db: Session = Depends(get_db)) -> MitigationExperimentOut:
    experiment = create_mitigation_experiment(
        db,
        name=payload.name,
        baseline_run_id=payload.baseline_run_id,
        candidate_run_id=payload.candidate_run_id,
        config=payload.config,
    )
    details = mitigation_payload(db, experiment.id)
    return MitigationExperimentOut.model_validate(details)


@router.get("/mitigation-experiments/{experiment_id}", response_model=MitigationExperimentOut)
def get_mitigation(experiment_id: str, db: Session = Depends(get_db)) -> MitigationExperimentOut:
    try:
        details = mitigation_payload(db, experiment_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return MitigationExperimentOut.model_validate(details)


@router.get("/compare", response_model=CompareOut)
def compare(
    baseline_run_id: str = Query(...),
    candidate_run_id: str = Query(...),
    db: Session = Depends(get_db),
) -> CompareOut:
    try:
        comparison = compare_runs(db, baseline_run_id, candidate_run_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return CompareOut(
        baseline_run_id=comparison.baseline_run_id,
        candidate_run_id=comparison.candidate_run_id,
        summary=comparison.summary,
        tests=comparison.tests,
    )


@router.post("/reports/{run_id}/generate", response_model=RunReportOut)
def generate_report(run_id: str, db: Session = Depends(get_db)) -> RunReportOut:
    try:
        markdown, path = generate_markdown_report(db, run_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return RunReportOut(run_id=run_id, markdown=markdown, path=path)
