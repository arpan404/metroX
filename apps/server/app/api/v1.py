from __future__ import annotations

import json
import time
import asyncio
from pathlib import Path
from datetime import datetime, timezone
from datetime import timedelta
from typing import Any
from uuid import uuid4

import httpx
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
    BenchmarkSnapshot,
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
    AgentIndexAgentCreate,
    AgentIndexAgentOut,
    AgentIndexInvoke,
    AdjudicationCreate,
    AdjudicationOut,
    CompareOut,
    ConfigProfileCreate,
    ConfigProfileListOut,
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
    RunListOut,
    RunOut,
    RunReportOut,
    SecretKeyCreate,
    SecretKeyEventOut,
    SecretKeyOut,
    SecretAccessAuditOut,
    ScoreCardOut,
    SessionCreate,
    SessionListOut,
    SessionOut,
)
from app.stats.clustering import list_clusters
from app.pipeline.compare import compare_runs
from app.pipeline.costing import cost_timeseries, pricing_profile_payload, rebuild_run_cost_aggregate, upsert_pricing_profile
from app.stats.drift import drift_payload
from app.stats.features import feature_table_for_run
from app.pipeline.mitigation import create_mitigation_experiment, mitigation_payload
from app.agents.orchestration_profiles import (
    bound_orchestration_snapshot,
    validate_orchestration_config,
)
from app.pipeline.orchestrator import RunOrchestrator
from app.stats.advanced_analytics import calibration_payload, cooccurrence_payload, forecast_payload, inference_payload
from app.runtime.providers import provider_capabilities, validate_provider
from app.pipeline.reporting import generate_markdown_report
from app.stats.risk import risk_cards
from app.runtime.run_queue import RUN_QUEUE
from app.runtime.adapters import normalize_target_type
from app.utils.common import log_event
from app.security.service import (
    SecretCipher,
    activate_key,
    create_key,
    list_key_events,
    list_keys,
    reencrypt_credentials,
    retire_key,
)

_SENSITIVE_HEADER_NAMES = frozenset({
    "authorization", "x-api-key", "api-key", "x-auth-token",
    "proxy-authorization", "cookie", "set-cookie",
})
_DETECTOR_FAILURE_KEYS = (
    "hallucination",
    "jailbreak_success",
    "prompt_injection_success",
    "tool_misuse",
    "toxicity",
)


def _redact_target_config(target_config: dict) -> dict:
    """Return a copy of target_config with sensitive auth_headers values redacted."""
    redacted = dict(target_config)
    headers = redacted.get("auth_headers")
    if headers and isinstance(headers, dict):
        redacted["auth_headers"] = {
            k: "**REDACTED**" if k.lower() in _SENSITIVE_HEADER_NAMES else v
            for k, v in headers.items()
        }
    return redacted


router = APIRouter(prefix="/v1", dependencies=[Depends(auth_dependency)])
_AGENT_INDEX_REGISTRY: dict[str, dict[str, object]] = {}
_TEST_AGENTS_DIR = Path(__file__).resolve().parents[3] / "test-agents" / "agents"


def _coerce_agent_index_url(url: str) -> str:
    return str(url or "").strip().rstrip("/")


def _coerce_agent_url(url: str) -> str:
    return str(url or "").strip()


def _test_agent_chat_url(base_url: str, agent_id: str) -> str:
    normalized_base = str(base_url or "").strip().rstrip("/")
    normalized_agent = str(agent_id or "").strip().strip("/")
    if not normalized_base or not normalized_agent:
        return ""
    return f"{normalized_base}/agents/{normalized_agent}/chat"


def _display_agent_name(agent_id: str) -> str:
    return str(agent_id or "").strip().replace("-", " ").replace("_", " ").title()


def _read_runtime_test_agents(base_url: str, timeout_s: float) -> list[str]:
    endpoint = f"{str(base_url).rstrip('/')}/agents/"
    with httpx.Client(timeout=max(float(timeout_s), 1.0)) as client:
        response = client.get(endpoint)
        response.raise_for_status()
        payload = response.json()
    rows = payload.get("agents")
    if not isinstance(rows, list):
        return []
    out: list[str] = []
    for row in rows:
        if isinstance(row, str):
            candidate = row.strip()
        elif isinstance(row, dict):
            candidate = str(row.get("id") or row.get("name") or "").strip()
        else:
            candidate = ""
        if candidate:
            out.append(candidate)
    return sorted(set(out))


def _read_filesystem_test_agents() -> list[str]:
    if not _TEST_AGENTS_DIR.exists():
        return []
    out: list[str] = []
    for path in _TEST_AGENTS_DIR.iterdir():
        if path.is_file() and path.suffix == ".py" and not path.name.startswith("_"):
            out.append(path.stem.replace("_", "-"))
    return sorted(set(out))


def _agent_index_invoke_url(index_url: str) -> str:
    normalized = _coerce_agent_index_url(index_url)
    if not normalized:
        return ""
    if normalized.endswith("/invoke"):
        return normalized
    if normalized.endswith("/agents/default"):
        return f"{normalized}/invoke"
    if normalized.endswith("/agent-index"):
        return f"{normalized}/agents/default/invoke"
    return f"{normalized}/v1/agent-index/agents/default/invoke"


def _queue_priority_for_run(*, preset: str, mode: str, is_resume: bool = False) -> int:
    # Lower number => higher priority.
    if is_resume:
        return 0
    priority = {
        "quick": 1,
        "standard": 2,
        "deep": 3,
    }.get(str(preset or "").strip().lower(), 2)
    mode_value = str(mode or "").strip().lower()
    if mode_value == "live_nightly":
        priority = max(priority, 3)
    return priority


def _queue_run_payload(run: Run | None) -> dict[str, Any] | None:
    if not run:
        return None
    return {
        "id": run.id,
        "session_id": run.session_id,
        "config_profile_id": run.config_profile_id,
        "preset": run.preset,
        "mode": run.mode,
        "strictness": run.strictness,
        "status": run.status,
        "total_attacks": int(run.total_attacks or 0),
        "completed_attacks": int(run.completed_attacks or 0),
        "budget_spent_usd": float(run.budget_spent_usd or 0.0),
        "estimated_final_cost_usd": float(run.estimated_final_cost_usd or 0.0),
        "created_at": run.created_at.isoformat() if run.created_at else None,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "ended_at": run.ended_at.isoformat() if run.ended_at else None,
    }


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


@router.get("/test-agents/catalog")
def get_test_agents_catalog() -> dict:
    settings = get_settings()
    base_url = str(settings.test_agents_base_url or "http://127.0.0.1:8001").strip().rstrip("/")
    source = "runtime_api"
    try:
        agent_ids = _read_runtime_test_agents(base_url, timeout_s=float(settings.test_agents_timeout_s))
    except Exception:
        source = "filesystem_fallback"
        agent_ids = _read_filesystem_test_agents()

    agents = [
        {
            "id": agent_id,
            "name": _display_agent_name(agent_id),
            "chat_url": _test_agent_chat_url(base_url, agent_id),
        }
        for agent_id in agent_ids
    ]
    return {"base_url": base_url, "source": source, "agents": agents}


@router.get("/agent-index")
def get_agent_index() -> dict:
    agents = [
        {
            "id": agent_id,
            "name": str(row.get("name", "")),
            "model": str(row.get("model", "")),
            "status": str(row.get("status", "active")),
            "created_at": row.get("created_at").isoformat() if isinstance(row.get("created_at"), datetime) else None,
        }
        for agent_id, row in _AGENT_INDEX_REGISTRY.items()
    ]
    return {
        "index_version": "v1",
        "agents": agents,
        "count": len(agents),
        "invoke_path_template": "/v1/agent-index/agents/{agent_id}/invoke",
    }


@router.post("/agent-index/agents", response_model=AgentIndexAgentOut)
def create_agent_index_agent(payload: AgentIndexAgentCreate) -> AgentIndexAgentOut:
    agent_id = str(uuid4())
    _AGENT_INDEX_REGISTRY[agent_id] = {
        "id": agent_id,
        "name": payload.name,
        "model": payload.model,
        "instructions": payload.instructions,
        "instruction_file": payload.instruction_file,
        "prompts_dir": payload.prompts_dir,
        "context": payload.context,
        "status": payload.status,
        "created_at": datetime.now(timezone.utc),
    }
    row = _AGENT_INDEX_REGISTRY[agent_id]
    return AgentIndexAgentOut(
        id=agent_id,
        name=str(row["name"]),
        model=str(row["model"]),
        status=str(row["status"]),
        created_at=row["created_at"],  # type: ignore[arg-type]
    )


@router.get("/agent-index/agents")
def list_agent_index_agents() -> dict:
    rows = []
    for agent_id, row in _AGENT_INDEX_REGISTRY.items():
        rows.append(
            {
                "id": agent_id,
                "name": str(row.get("name", "")),
                "model": str(row.get("model", "")),
                "status": str(row.get("status", "active")),
                "created_at": row.get("created_at").isoformat() if isinstance(row.get("created_at"), datetime) else None,
            }
        )
    return {"agents": rows}


@router.delete("/agent-index/agents/{agent_id}")
def delete_agent_index_agent(agent_id: str) -> dict:
    row = _AGENT_INDEX_REGISTRY.pop(agent_id, None)
    if row is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return {"deleted": True, "agent_id": agent_id}


@router.post("/agent-index/agents/{agent_id}/invoke")
def invoke_agent_index_agent(agent_id: str, payload: AgentIndexInvoke) -> dict:
    if agent_id == "default":
        active = [row for row in _AGENT_INDEX_REGISTRY.values() if str(row.get("status", "active")) == "active"]
        if not active:
            raise HTTPException(status_code=404, detail="No active agents in index")
        row = active[0]
    else:
        row = _AGENT_INDEX_REGISTRY.get(agent_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Agent not found")

    start = time.perf_counter()
    message = str(payload.message or payload.prompt or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="message or prompt is required")

    try:
        from afk.agents import Agent  # type: ignore
        from afk.core import Runner  # type: ignore
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Agent runtime unavailable: {exc}") from exc

    agent_kwargs: dict[str, object] = {
        "name": str(row.get("name") or "indexed-agent"),
        "model": str(row.get("model") or "gpt-4.1-mini"),
    }
    prompts_dir = str(row.get("prompts_dir") or "").strip()
    instruction_file = str(row.get("instruction_file") or "").strip()
    instructions = str(row.get("instructions") or "").strip()
    if prompts_dir and instruction_file and (Path(prompts_dir) / instruction_file).exists():
        agent_kwargs["prompts_dir"] = prompts_dir
        agent_kwargs["instruction_file"] = instruction_file
    elif instructions:
        agent_kwargs["instructions"] = instructions
    else:
        agent_kwargs["instructions"] = "You are a safe financial agent. Follow policy and avoid unsafe behavior."

    context = row.get("context")
    if isinstance(context, dict) and context:
        agent_kwargs["context"] = context

    runner = Runner(telemetry=payload.telemetry or "null")
    agent = Agent(**agent_kwargs)
    try:
        result = runner.run_sync(agent, user_message=message, thread_id=payload.thread_id or f"idx-{agent_id}")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Agent invocation failed: {exc}") from exc

    usage = getattr(result, "usage", None)
    latency_ms = (time.perf_counter() - start) * 1000
    return {
        "response_text": str(getattr(result, "final_text", "") or ""),
        "retrieved_docs": [],
        "tool_events": [],
        "latency_ms": latency_ms,
        "token_usage": {
            "prompt_tokens": getattr(usage, "prompt_tokens", 0) if usage else 0,
            "completion_tokens": getattr(usage, "completion_tokens", 0) if usage else 0,
            "total_tokens": getattr(usage, "total_tokens", 0) if usage else 0,
            "total_cost_usd": getattr(usage, "total_cost_usd", 0.0) if usage else 0.0,
        },
        "provider_name": "agent_index",
        "model_resolved": str(row.get("model") or ""),
        "raw_payload": {
            "adapter": "agent_index",
            "agent_id": agent_id if agent_id != "default" else str(row.get("id") or ""),
            "thread_id": getattr(result, "thread_id", payload.thread_id),
            "run_id": getattr(result, "run_id", payload.run_id),
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


@router.delete("/providers/credentials/{credential_id}")
def delete_provider_credential(credential_id: str, db: Session = Depends(get_db)) -> dict:
    row = db.query(ProviderCredential).filter(ProviderCredential.id == credential_id).one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Provider credential not found")
    db.delete(row)
    db.commit()
    return {"deleted": True, "credential_id": credential_id}


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
        validated_config = validate_orchestration_config(payload.config.model_dump())
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
            merged_config = {**(row.config or {}), **payload.config.model_dump(exclude_unset=True)}
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


@router.get("/sessions", response_model=SessionListOut)
def list_sessions(
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    owner: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> SessionListOut:
    query = db.query(EvaluationSession)
    normalized_owner = str(owner or "").strip()
    if normalized_owner:
        query = query.filter(EvaluationSession.owner == normalized_owner)
    total = query.count()
    rows = (
        query.order_by(EvaluationSession.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return SessionListOut(
        sessions=[SessionOut.model_validate(row, from_attributes=True) for row in rows],
        total=total,
    )


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
    settings = get_settings()

    orchestration_cfg = payload.benchmark_config.afk_orchestration.model_dump()
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
    agent_id = str(payload.target_config.agent_id or "").strip()
    agent_name = str(payload.target_config.agent_name or "").strip()
    agent_description = str(payload.target_config.agent_description or "").strip()
    agent_url = _coerce_agent_url(str(payload.target_config.agent_url or ""))
    agent_index_url = _coerce_agent_index_url(str(payload.target_config.agent_index_url or ""))
    if agent_id and not agent_url:
        agent_url = _test_agent_chat_url(settings.test_agents_base_url, agent_id)
    if agent_url:
        normalized_target_type = "agent_http"
        target_config["agent_id"] = agent_id or None
        target_config["agent_url"] = agent_url
        target_config["endpoint"] = agent_url
        target_config["base_url"] = None
        target_config["api_key_ref"] = None
        target_config["agent_index_url"] = None
        extra = target_config.get("extra")
        if not isinstance(extra, dict):
            extra = {}
        if agent_id:
            extra["agent_id"] = agent_id
        extra["agent_url"] = agent_url
        if agent_name:
            target_config["agent_name"] = agent_name
            extra["agent_name"] = agent_name
        if agent_description:
            target_config["agent_description"] = agent_description
            extra["agent_description"] = agent_description
        target_config["extra"] = extra
    elif agent_index_url:
        normalized_target_type = "agent_http"
        if agent_id:
            target_config["agent_id"] = agent_id
        target_config["agent_index_url"] = agent_index_url
        target_config["endpoint"] = _agent_index_invoke_url(agent_index_url)
        target_config["base_url"] = None
        target_config["api_key_ref"] = None
        extra = target_config.get("extra")
        if not isinstance(extra, dict):
            extra = {}
        if agent_id:
            extra["agent_id"] = agent_id
        extra["agent_index_url"] = agent_index_url
        if agent_name:
            target_config["agent_name"] = agent_name
            extra["agent_name"] = agent_name
        if agent_description:
            target_config["agent_description"] = agent_description
            extra["agent_description"] = agent_description
        target_config["extra"] = extra
    elif agent_id or agent_name or agent_description:
        extra = target_config.get("extra")
        if not isinstance(extra, dict):
            extra = {}
        if agent_id:
            target_config["agent_id"] = agent_id
            extra["agent_id"] = agent_id
        if agent_name:
            target_config["agent_name"] = agent_name
            extra["agent_name"] = agent_name
        if agent_description:
            target_config["agent_description"] = agent_description
            extra["agent_description"] = agent_description
        target_config["extra"] = extra
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


@router.get("/config-profiles", response_model=ConfigProfileListOut)
def list_profiles(
    session_id: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> ConfigProfileListOut:
    query = db.query(ConfigProfile)
    normalized_session_id = str(session_id or "").strip()
    if normalized_session_id:
        query = query.filter(ConfigProfile.session_id == normalized_session_id)
    total = query.count()
    rows = (
        query.order_by(ConfigProfile.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    profiles: list[ConfigProfileOut] = []
    for row in rows:
        if isinstance(row.target_config, dict):
            current = str(row.target_config.get("target_type", "")).strip()
            row.target_config = {**row.target_config, "target_type": normalize_target_type(current)}
        profiles.append(ConfigProfileOut.model_validate(row, from_attributes=True))
    return ConfigProfileListOut(profiles=profiles, total=total)


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
            "target_config": _redact_target_config(profile.target_config or {}),
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
            priority = _queue_priority_for_run(preset=run.preset, mode=run.mode, is_resume=False)
            RUN_QUEUE.enqueue(run.id, priority=priority)
            log_event(
                db,
                run_id=run.id,
                event_type="queued",
                step=0,
                message=f"Run queued for worker execution (priority={priority})",
            )
        else:
            background_tasks.add_task(_run_pipeline_background, run.id)

    return RunOut.model_validate(run, from_attributes=True)


@router.get("/runs", response_model=RunListOut)
def list_runs(
    session_id: str | None = Query(default=None),
    config_profile_id: str | None = Query(default=None),
    status: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> RunListOut:
    base_query = db.query(Run)
    normalized_session_id = str(session_id or "").strip()
    normalized_profile_id = str(config_profile_id or "").strip()
    if normalized_session_id:
        base_query = base_query.filter(Run.session_id == normalized_session_id)
    if normalized_profile_id:
        base_query = base_query.filter(Run.config_profile_id == normalized_profile_id)

    status_counts_rows = (
        base_query.with_entities(Run.status, func.count(Run.id))
        .group_by(Run.status)
        .all()
    )
    status_counts = {str(run_status): int(count) for run_status, count in status_counts_rows}

    query = base_query
    raw_status = str(status or "").strip()
    if raw_status:
        status_values = [value.strip() for value in raw_status.split(",") if value.strip()]
        if len(status_values) == 1:
            query = query.filter(Run.status == status_values[0])
        elif status_values:
            query = query.filter(Run.status.in_(status_values))

    total = query.count()
    rows = (
        query.order_by(Run.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return RunListOut(
        runs=[RunOut.model_validate(row, from_attributes=True) for row in rows],
        total=total,
        status_counts=status_counts,
    )


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


@router.get("/queue/runs")
def queue_runs(
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
) -> dict:
    settings = get_settings()
    pending = RUN_QUEUE.list_pending(limit=limit)
    pending_run_ids = [str(row.get("run_id", "")).strip() for row in pending if str(row.get("run_id", "")).strip()]
    run_rows = (
        db.query(Run).filter(Run.id.in_(pending_run_ids)).all()
        if pending_run_ids
        else []
    )
    run_map = {row.id: row for row in run_rows}
    pending_payload = [
        {
            **row,
            "run": _queue_run_payload(run_map.get(str(row.get("run_id", "")))),
        }
        for row in pending
    ]

    running_rows = (
        db.query(Run)
        .filter(Run.status == "running")
        .order_by(Run.started_at.desc(), Run.created_at.desc())
        .limit(limit)
        .all()
    )
    completed_rows = (
        db.query(Run)
        .filter(Run.status.in_(["completed", "failed", "interrupted"]))
        .order_by(Run.ended_at.desc(), Run.created_at.desc())
        .limit(limit)
        .all()
    )

    return {
        "backend": settings.run_queue_backend,
        "pending": pending_payload,
        "running": [_queue_run_payload(row) for row in running_rows],
        "completed": [_queue_run_payload(row) for row in completed_rows],
    }


@router.post("/queue/runs/{run_id}/move-up")
def queue_move_up(run_id: str, db: Session = Depends(get_db)) -> dict:
    updated = RUN_QUEUE.move_up(run_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Run not found in queue")
    try:
        log_event(
            db,
            run_id=run_id,
            event_type="queue_reprioritized",
            step=0,
            message=f"Queue move-up applied (priority={updated.get('priority')})",
            data={"action": "move_up", **updated},
        )
    except Exception:
        db.rollback()
    return {"ok": True, "updated": updated}


@router.post("/queue/runs/{run_id}/priority")
def queue_set_priority(
    run_id: str,
    priority: int = Query(..., ge=0, le=9),
    db: Session = Depends(get_db),
) -> dict:
    updated = RUN_QUEUE.set_priority(run_id, priority)
    if not updated:
        raise HTTPException(status_code=404, detail="Run not found in queue")
    try:
        log_event(
            db,
            run_id=run_id,
            event_type="queue_reprioritized",
            step=0,
            message=f"Queue priority updated (priority={updated.get('priority')})",
            data={"action": "set_priority", **updated},
        )
    except Exception:
        db.rollback()
    return {"ok": True, "updated": updated}


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
        priority = _queue_priority_for_run(preset=run.preset, mode=run.mode, is_resume=True)
        RUN_QUEUE.enqueue(run.id, priority=priority)
        log_event(
            db,
            run_id=run.id,
            event_type="queued",
            step=0,
            message=f"Resumed run queued for worker execution (priority={priority})",
        )
    else:
        background_tasks.add_task(_run_pipeline_background, run.id)
    db.refresh(run)
    return RunOut.model_validate(run, from_attributes=True)


@router.post("/runs/{run_id}/stop", response_model=RunOut)
def stop_run(run_id: str, db: Session = Depends(get_db)) -> RunOut:
    run = db.query(Run).filter(Run.id == run_id).one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status in {"completed", "failed", "interrupted"}:
        return RunOut.model_validate(run, from_attributes=True)

    removed_from_queue = False
    if run.status == "queued":
        removed_from_queue = RUN_QUEUE.remove(run_id)

    run.status = "interrupted"
    run.ended_at = datetime.now(timezone.utc)
    db.commit()
    db.add(
        AFKRunState(
            run_id=run.id,
            thread_id=run.thread_id or f"run-{run.id}",
            state="interrupted",
            step=0,
            checkpoint={
                "stop_requested_at": datetime.now(timezone.utc).isoformat(),
                "removed_from_queue": removed_from_queue,
            },
        )
    )
    db.commit()
    log_event(
        db,
        run_id=run.id,
        event_type="run_stop_requested",
        step=0,
        message="Stop requested from queue center",
        data={"removed_from_queue": removed_from_queue},
    )
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
        poll_interval_s = 0.2
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
                time.sleep(poll_interval_s)
        finally:
            stream_db.close()

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/runs/{run_id}/events/recent")
def get_recent_run_events(
    run_id: str,
    limit: int = Query(default=200, ge=1, le=1000),
    db: Session = Depends(get_db),
) -> dict:
    run = db.query(Run).filter(Run.id == run_id).one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    rows = (
        db.query(RunEvent)
        .filter(RunEvent.run_id == run_id)
        .order_by(RunEvent.id.desc())
        .limit(limit)
        .all()
    )
    events = [
        {
            "id": event.id,
            "event_type": event.event_type,
            "step": event.step,
            "message": event.message,
            "data": event.data,
            "created_at": event.created_at.isoformat(),
        }
        for event in reversed(rows)
    ]
    return {"run_id": run_id, "events": events}


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
    poll_interval_s = 0.2
    heartbeat_interval_s = 1.0
    last_heartbeat_at = time.monotonic()
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
            now = time.monotonic()
            if now - last_heartbeat_at >= heartbeat_interval_s:
                await websocket.send_json({"event_type": "heartbeat"})
                last_heartbeat_at = now
            await asyncio.sleep(poll_interval_s)
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
def get_detector_votes(
    run_id: str,
    attack_type: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> dict:
    execution_query = (
        db.query(Execution.id, AttackCase.attack_type)
        .join(AttackCase, AttackCase.id == Execution.attack_case_id)
        .filter(Execution.run_id == run_id)
    )
    if attack_type:
        execution_query = execution_query.filter(AttackCase.attack_type == attack_type)
    execution_rows = execution_query.all()
    execution_ids = [row[0] for row in execution_rows]
    attack_type_by_execution = {execution_id: str(kind or "unknown") for execution_id, kind in execution_rows}
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
                "attack_type": attack_type_by_execution.get(row.execution_id, "unknown"),
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


@router.get("/runs/{run_id}/detector-votes-summary")
def get_detector_votes_summary(
    run_id: str,
    attack_type: str | None = Query(default=None),
    limit_raw: int = Query(default=100, ge=1, le=1000),
    db: Session = Depends(get_db),
) -> dict:
    run = db.query(Run).filter(Run.id == run_id).one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    execution_query = (
        db.query(Execution.id, AttackCase.attack_type)
        .join(AttackCase, AttackCase.id == Execution.attack_case_id)
        .filter(Execution.run_id == run_id)
    )
    if attack_type:
        execution_query = execution_query.filter(AttackCase.attack_type == attack_type)
    execution_rows = execution_query.all()
    execution_ids = [row[0] for row in execution_rows]
    attack_type_by_execution = {execution_id: str(kind or "unknown") for execution_id, kind in execution_rows}

    if not execution_ids:
        return {
            "run_id": run_id,
            "attack_type": attack_type,
            "totals": {
                "votes": 0,
                "executions": 0,
                "detectors": 0,
                "fail_votes": 0,
                "pass_votes": 0,
                "avg_confidence": 0.0,
                "avg_latency_ms": 0.0,
            },
            "detectors": [],
            "consensus": {
                "avg_disagreement": 0.0,
                "avg_uncertainty": 0.0,
            },
            "raw_sample": [],
        }

    vote_rows = (
        db.query(DetectionVote)
        .filter(DetectionVote.execution_id.in_(execution_ids))
        .order_by(DetectionVote.created_at.desc())
        .all()
    )
    detection_rows = (
        db.query(Detection)
        .filter(Detection.execution_id.in_(execution_ids))
        .all()
    )

    detector_buckets: dict[str, dict[str, Any]] = {}
    total_fail_votes = 0
    confidence_sum = 0.0
    latency_sum = 0.0

    for row in vote_rows:
        has_fail = any(bool(v) for v in (row.failure_flags or {}).values())
        if has_fail:
            total_fail_votes += 1
        confidence_sum += float(row.confidence or 0.0)
        latency_sum += float(row.latency_ms or 0.0)

        bucket = detector_buckets.setdefault(
            row.detector_name,
            {
                "detector_name": row.detector_name,
                "votes": 0,
                "fail_votes": 0,
                "pass_votes": 0,
                "confidence_sum": 0.0,
                "latency_sum": 0.0,
                "failure_key_hits": {key: 0 for key in _DETECTOR_FAILURE_KEYS},
            },
        )
        bucket["votes"] += 1
        bucket["confidence_sum"] += float(row.confidence or 0.0)
        bucket["latency_sum"] += float(row.latency_ms or 0.0)
        if has_fail:
            bucket["fail_votes"] += 1
        else:
            bucket["pass_votes"] += 1
        flags = row.failure_flags or {}
        for key in _DETECTOR_FAILURE_KEYS:
            if bool(flags.get(key)):
                bucket["failure_key_hits"][key] += 1

    total_votes = len(vote_rows)
    total_pass_votes = total_votes - total_fail_votes
    detectors_payload = []
    detector_votes_total = 0
    for detector_name in sorted(detector_buckets.keys()):
        bucket = detector_buckets[detector_name]
        votes_count = int(bucket["votes"])
        detector_votes_total += votes_count
        fail_votes = int(bucket["fail_votes"])
        pass_votes = int(bucket["pass_votes"])
        if fail_votes + pass_votes != votes_count:
            raise HTTPException(status_code=500, detail="Detector vote totals invariant failed")

        detectors_payload.append(
            {
                "detector_name": detector_name,
                "votes": votes_count,
                "fail_votes": fail_votes,
                "pass_votes": pass_votes,
                "fail_rate": float(fail_votes) / max(votes_count, 1),
                "avg_confidence": float(bucket["confidence_sum"]) / max(votes_count, 1),
                "avg_latency_ms": float(bucket["latency_sum"]) / max(votes_count, 1),
                "failure_key_rates": {
                    key: float(bucket["failure_key_hits"][key]) / max(votes_count, 1)
                    for key in _DETECTOR_FAILURE_KEYS
                },
            }
        )

    if detector_votes_total != total_votes:
        raise HTTPException(status_code=500, detail="Detector totals do not reconcile with vote count")

    detectors_payload.sort(key=lambda row: (-float(row["fail_rate"]), -int(row["votes"]), str(row["detector_name"])))

    consensus = {
        "avg_disagreement": float(
            sum(float(item.disagreement_score or 0.0) for item in detection_rows) / max(len(detection_rows), 1)
        ),
        "avg_uncertainty": float(
            sum(float(item.uncertainty or 0.0) for item in detection_rows) / max(len(detection_rows), 1)
        ),
    }

    raw_sample = []
    for row in vote_rows[:limit_raw]:
        raw_sample.append(
            {
                "id": row.id,
                "execution_id": row.execution_id,
                "attack_type": attack_type_by_execution.get(row.execution_id, "unknown"),
                "detector_name": row.detector_name,
                "failure_flags": row.failure_flags,
                "confidence": float(row.confidence or 0.0),
                "evidence": row.evidence,
                "latency_ms": float(row.latency_ms or 0.0),
                "created_at": row.created_at.isoformat(),
            }
        )

    return {
        "run_id": run_id,
        "attack_type": attack_type,
        "totals": {
            "votes": total_votes,
            "executions": len(execution_ids),
            "detectors": len(detectors_payload),
            "fail_votes": total_fail_votes,
            "pass_votes": total_pass_votes,
            "avg_confidence": confidence_sum / max(total_votes, 1),
            "avg_latency_ms": latency_sum / max(total_votes, 1),
        },
        "detectors": detectors_payload,
        "consensus": consensus,
        "raw_sample": raw_sample,
    }


@router.get("/runs/{run_id}/clusters")
def get_clusters(run_id: str, db: Session = Depends(get_db)) -> dict:
    return {"run_id": run_id, "clusters": list_clusters(db, run_id)}


@router.get("/runs/{run_id}/attack-summary")
def get_attack_summary(run_id: str, db: Session = Depends(get_db)) -> dict:
    run = db.query(Run).filter(Run.id == run_id).one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    def _empty_attack_row(kind: str) -> dict[str, Any]:
        return {
            "attack_type": kind,
            "total": 0,
            "success": 0,
            "failure": 0,
            "success_rate": 0.0,
            "avg_confidence": 0.0,
            "avg_disagreement": 0.0,
            "avg_uncertainty": 0.0,
            "severity_breakdown": {"critical": 0, "high": 0, "medium": 0, "low": 0},
        }

    taxonomy: list[str] = []
    # Defensive local import avoids hot-reload edge cases where module-level symbol binding lags.
    try:
        from app.models import BenchmarkSnapshot as _BenchmarkSnapshot
    except Exception:
        _BenchmarkSnapshot = None
    if _BenchmarkSnapshot is not None:
        benchmark_snapshot = (
            db.query(_BenchmarkSnapshot)
            .filter(_BenchmarkSnapshot.run_id == run_id)
            .order_by(_BenchmarkSnapshot.created_at.desc())
            .first()
        )
        if benchmark_snapshot and isinstance(benchmark_snapshot.meta, dict):
            meta_taxonomy = benchmark_snapshot.meta.get("taxonomy")
            if isinstance(meta_taxonomy, list):
                taxonomy = [str(item).strip() for item in meta_taxonomy if str(item).strip()]

    if not taxonomy:
        profile = db.query(ConfigProfile).filter(ConfigProfile.id == run.config_profile_id).one_or_none()
        benchmark_cfg = profile.benchmark_config if profile and isinstance(profile.benchmark_config, dict) else {}
        cfg_taxonomy = benchmark_cfg.get("taxonomy")
        if isinstance(cfg_taxonomy, list):
            taxonomy = [str(item).strip() for item in cfg_taxonomy if str(item).strip()]

    execution_rows = (
        db.query(Execution.id, AttackCase.attack_type)
        .join(AttackCase, AttackCase.id == Execution.attack_case_id)
        .filter(Execution.run_id == run_id)
        .all()
    )
    if not execution_rows:
        attack_types = [_empty_attack_row(kind) for kind in sorted(set(taxonomy))]
        return {
            "run_id": run_id,
            "attack_types": attack_types,
            "detector_summary": {"avg_disagreement": 0.0, "avg_uncertainty": 0.0, "count": 0},
        }

    attack_type_by_execution = {execution_id: attack_type for execution_id, attack_type in execution_rows}
    detections = (
        db.query(Detection)
        .filter(Detection.execution_id.in_(list(attack_type_by_execution.keys())))
        .all()
    )

    summary: dict[str, dict] = {kind: _empty_attack_row(kind) for kind in sorted(set(taxonomy))}
    for detection in detections:
        attack_type = attack_type_by_execution.get(detection.execution_id, "unknown")
        row = summary.setdefault(attack_type, _empty_attack_row(attack_type))
        row["total"] += 1
        was_success = any(detection.failure_flags.values())
        if was_success:
            row["success"] += 1
        else:
            row["failure"] += 1
        row["avg_confidence"] += float(detection.confidence)
        row["avg_disagreement"] += float(detection.disagreement_score or 0.0)
        row["avg_uncertainty"] += float(detection.uncertainty or 0.0)
        sev = str(detection.severity or "low").lower()
        if sev not in row["severity_breakdown"]:
            sev = "low"
        row["severity_breakdown"][sev] += 1

    ordered = []
    for attack_type, row in sorted(summary.items(), key=lambda item: item[0]):
        total = max(int(row["total"]), 1)
        row["success_rate"] = float(row["success"]) / total
        row["avg_confidence"] = float(row["avg_confidence"]) / total
        row["avg_disagreement"] = float(row["avg_disagreement"]) / total
        row["avg_uncertainty"] = float(row["avg_uncertainty"]) / total
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
                "effective_cost_usd": 0.0,
                "policy_decisions": 0,
                "policy_events": 0,
                "tool_events": 0,
            },
        )
        row["total"] += 1
        row["avg_latency_ms"] += float(execution.latency_ms or 0.0)
        effective_cost_usd = float(cost.effective_cost_usd if cost else 0.0)
        row["cost_usd"] += effective_cost_usd
        row["effective_cost_usd"] += effective_cost_usd
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
                row["policy_events"] += 1

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
