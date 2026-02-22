"""Integration tests for orchestrator, credential resolution, config snapshot redaction,
and end-to-end API flows.

Covers:
  - RunOrchestrator._resolve_credential: success, missing cred, decrypt failure, audit logging
  - Config snapshot redaction in orchestrator
  - API: config profile creation with auth_headers redaction in snapshot
  - API: system prompt and extra_context pass-through
  - E2E: full run with custom instructions, credential resolution plumbing
"""
from __future__ import annotations

import asyncio
from typing import Any, Generator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.api.v1 import router
from app.config import get_settings
from app.db import get_db
from app.models import (
    Base,
    ConfigProfile,
    ConfigSnapshot,
    EvaluationSession,
    ProviderCredential,
    Run,
    SecretAccessAudit,
    SecretKey,
)
from app.pipeline.orchestrator import RunOrchestrator, _redact_target_config
from app.security.service import SecretCipher, create_key, activate_key


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(engine)
    session_local = sessionmaker(bind=engine, autoflush=False, autocommit=False, class_=Session)
    session = session_local()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture
def integrated_api(tmp_path) -> Generator[tuple[TestClient, sessionmaker], None, None]:
    db_path = tmp_path / "integration_cred.db"
    engine = create_engine(
        f"sqlite:///{db_path}", connect_args={"check_same_thread": False}, future=True
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, class_=Session)
    Base.metadata.create_all(bind=engine)

    app = FastAPI()
    app.include_router(router)

    def override_get_db() -> Generator[Session, None, None]:
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as client:
        yield client, TestingSessionLocal

    app.dependency_overrides.clear()
    engine.dispose()


def _headers() -> dict[str, str]:
    return {"X-API-Key": "local-dev-key"}


def _setup_key(db: Session) -> SecretKey:
    """Create and activate a secret key for encryption."""
    key = create_key(db, version="test-v1", key_material="test-key-material-integration", actor="test")
    activate_key(db, key_id=key.id, actor="test")
    return key


def _setup_credential(db: Session, api_key: str = "sk-test-secret") -> ProviderCredential:
    """Store an encrypted credential."""
    cipher = SecretCipher(db)
    encrypted_secret, key_version = cipher.encrypt(api_key)
    cred = ProviderCredential(
        name="test-cred",
        provider_type="openai_compatible",
        encrypted_secret=encrypted_secret,
        key_version=key_version,
        status="active",
    )
    db.add(cred)
    db.commit()
    db.refresh(cred)
    return cred


# ---------------------------------------------------------------------------
# _resolve_credential
# ---------------------------------------------------------------------------
class TestResolveCredential:
    def test_resolves_valid_credential(self, db_session) -> None:
        _setup_key(db_session)
        cred = _setup_credential(db_session, "sk-my-api-key")

        # Create minimal run for logging
        session = EvaluationSession(name="test-session")
        db_session.add(session)
        db_session.flush()

        orchestrator = RunOrchestrator(db_session)
        target_cfg = {"api_key_ref": cred.id}
        result = orchestrator._resolve_credential(target_cfg, "run-1")

        assert result == "sk-my-api-key"

        # Verify audit was created
        audits = db_session.query(SecretAccessAudit).filter(
            SecretAccessAudit.provider_credential_id == cred.id
        ).all()
        assert len(audits) >= 1
        assert audits[0].action == "decrypt_for_run"
        assert audits[0].success is True

    def test_returns_none_when_no_ref(self, db_session) -> None:
        orchestrator = RunOrchestrator(db_session)
        assert orchestrator._resolve_credential({}, "run-1") is None
        assert orchestrator._resolve_credential({"api_key_ref": ""}, "run-1") is None
        assert orchestrator._resolve_credential({"api_key_ref": "  "}, "run-1") is None

    def test_returns_none_when_credential_not_found(self, db_session) -> None:
        orchestrator = RunOrchestrator(db_session)
        result = orchestrator._resolve_credential(
            {"api_key_ref": "nonexistent-id"}, "run-1"
        )
        assert result is None

    def test_returns_none_and_audits_on_decrypt_failure(self, db_session) -> None:
        _setup_key(db_session)
        # Create a credential with corrupt encrypted_secret
        cred = ProviderCredential(
            name="bad-cred",
            provider_type="openai_compatible",
            encrypted_secret="corrupt:data:here:payload",
            key_version="test-v1",
            status="active",
        )
        db_session.add(cred)
        db_session.commit()
        db_session.refresh(cred)

        orchestrator = RunOrchestrator(db_session)
        result = orchestrator._resolve_credential({"api_key_ref": cred.id}, "run-1")
        assert result is None

        # Verify failure audit was created
        audits = db_session.query(SecretAccessAudit).filter(
            SecretAccessAudit.provider_credential_id == cred.id,
            SecretAccessAudit.success == False,  # noqa: E712
        ).all()
        assert len(audits) >= 1


# ---------------------------------------------------------------------------
# Config snapshot redaction in orchestrator
# ---------------------------------------------------------------------------
class TestConfigSnapshotRedaction:
    def test_snapshot_redacts_auth_headers(self, db_session) -> None:
        session = EvaluationSession(name="snap-test-session")
        db_session.add(session)
        db_session.flush()

        profile = ConfigProfile(
            session_id=session.id,
            name="snap-test-profile",
            target_config={
                "target_type": "http",
                "auth_headers": {"Authorization": "Bearer tok-123", "X-Custom": "safe"},
                "model": "gpt-4",
                "extra": {},
            },
            benchmark_config={
                "taxonomy": ["prompt_injection"],
                "seed": 42,
            },
            scoring_config={"strictness_mode": "balanced"},
            runtime_config={"preset": "quick", "live_mode": False},
        )
        db_session.add(profile)
        db_session.flush()

        run = Run(
            session_id=session.id,
            config_profile_id=profile.id,
            preset="quick",
            mode="deterministic_ci",
            strictness="balanced",
            status="queued",
        )
        db_session.add(run)
        db_session.commit()

        # Create the snapshot the same way the orchestrator does
        snapshot = ConfigSnapshot(
            config_profile_id=profile.id,
            run_id=run.id,
            snapshot={
                "target_config": _redact_target_config(profile.target_config or {}),
                "benchmark_config": profile.benchmark_config,
                "scoring_config": profile.scoring_config,
                "runtime_config": profile.runtime_config,
            },
        )
        db_session.add(snapshot)
        db_session.commit()
        db_session.refresh(snapshot)

        target_config = snapshot.snapshot["target_config"]
        assert target_config["auth_headers"]["Authorization"] == "**REDACTED**"
        assert target_config["auth_headers"]["X-Custom"] == "safe"


# ---------------------------------------------------------------------------
# API: auth header redaction in /v1/config-profiles
# ---------------------------------------------------------------------------
class TestAPIConfigProfileRedaction:
    def test_config_profile_with_auth_headers(self, integrated_api) -> None:
        client, _ = integrated_api

        session = client.post(
            "/v1/sessions", json={"name": "redaction-test"}, headers=_headers()
        )
        assert session.status_code == 200
        session_id = session.json()["id"]

        profile = client.post(
            "/v1/config-profiles",
            json={
                "session_id": session_id,
                "name": "redaction-profile",
                "target_config": {
                    "target_type": "http",
                    "endpoint": "http://target:8000",
                    "auth_headers": {
                        "Authorization": "Bearer super-secret",
                        "X-Custom-Header": "visible",
                    },
                    "model": "gpt-4",
                    "extra": {},
                },
                "benchmark_config": {"taxonomy": ["prompt_injection"]},
                "scoring_config": {"strictness_mode": "balanced"},
                "runtime_config": {"preset": "quick"},
            },
            headers=_headers(),
        )
        assert profile.status_code == 200
        # The profile itself should preserve the full config for runtime use
        got = client.get(f"/v1/config-profiles/{profile.json()['id']}", headers=_headers())
        assert got.status_code == 200
        tc = got.json()["target_config"]
        # Original should be preserved (runtime needs it)
        assert tc["auth_headers"]["Authorization"] == "Bearer super-secret"
        assert tc["auth_headers"]["X-Custom-Header"] == "visible"


# ---------------------------------------------------------------------------
# API: extra_system_prompt and extra_context pass-through
# ---------------------------------------------------------------------------
class TestAPIExtraSystemPromptPassthrough:
    def test_afk_orchestration_extra_fields_preserved(self, integrated_api) -> None:
        client, _ = integrated_api

        session = client.post(
            "/v1/sessions", json={"name": "extra-prompt-test"}, headers=_headers()
        )
        session_id = session.json()["id"]

        profile = client.post(
            "/v1/config-profiles",
            json={
                "session_id": session_id,
                "name": "extra-prompt-profile",
                "target_config": {
                    "target_type": "managed_llm_runtime",
                    "model": "gpt-4.1-mini",
                    "extra": {
                        "instructions": "Base instructions.",
                        "extra_system_prompt": "Additional safety rules.",
                    },
                },
                "benchmark_config": {
                    "taxonomy": ["prompt_injection"],
                    "afk_orchestration": {
                        "extra_system_prompt": "Orchestration extra prompt.",
                        "extra_context": {"campaign": "nightly", "tier": "high"},
                    },
                },
                "scoring_config": {"strictness_mode": "balanced"},
                "runtime_config": {"preset": "quick"},
            },
            headers=_headers(),
        )
        assert profile.status_code == 200

        got = client.get(f"/v1/config-profiles/{profile.json()['id']}", headers=_headers())
        bc = got.json()["benchmark_config"]
        orch = bc["afk_orchestration"]
        assert orch["extra_system_prompt"] == "Orchestration extra prompt."
        assert orch["extra_context"]["campaign"] == "nightly"

        tc = got.json()["target_config"]
        assert tc["extra"]["instructions"] == "Base instructions."
        assert tc["extra"]["extra_system_prompt"] == "Additional safety rules."


# ---------------------------------------------------------------------------
# API: orchestration profile with execution_order
# ---------------------------------------------------------------------------
class TestAPIOrchestrationProfileExecutionOrder:
    def test_execution_order_validated(self, integrated_api) -> None:
        client, _ = integrated_api

        # Valid execution order
        resp = client.post(
            "/v1/orchestration-profiles",
            json={
                "name": "order-test",
                "config": {
                    "join_policy": "all_required",
                    "roles": [
                        {"name": "attacker", "enabled": True},
                        {"name": "critic", "enabled": True},
                    ],
                    "execution_order": ["critic", "attacker"],
                },
            },
            headers=_headers(),
        )
        assert resp.status_code == 200
        assert resp.json()["config"]["execution_order"] == ["critic", "attacker"]

    def test_execution_order_rejects_unknown_role(self, integrated_api) -> None:
        client, _ = integrated_api
        resp = client.post(
            "/v1/orchestration-profiles",
            json={
                "name": "bad-order",
                "config": {
                    "join_policy": "all_required",
                    "roles": [{"name": "attacker"}],
                    "execution_order": ["nonexistent"],
                },
            },
            headers=_headers(),
        )
        assert resp.status_code == 400

    def test_execution_order_rejects_duplicates(self, integrated_api) -> None:
        client, _ = integrated_api
        resp = client.post(
            "/v1/orchestration-profiles",
            json={
                "name": "dup-order",
                "config": {
                    "join_policy": "all_required",
                    "roles": [{"name": "attacker"}],
                    "execution_order": ["attacker", "attacker"],
                },
            },
            headers=_headers(),
        )
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# E2E: full run lifecycle with custom instructions
# ---------------------------------------------------------------------------
class TestE2ERunWithCustomInstructions:
    def test_full_run_with_extra_system_prompt(self, integrated_api) -> None:
        client, testing_session = integrated_api
        settings = get_settings()
        settings.quick_attack_count = 5

        session = client.post(
            "/v1/sessions", json={"name": "e2e-custom-instructions"}, headers=_headers()
        )
        assert session.status_code == 200
        session_id = session.json()["id"]

        profile = client.post(
            "/v1/config-profiles",
            json={
                "session_id": session_id,
                "name": "e2e-profile",
                "target_config": {
                    "target_type": "managed_llm_runtime",
                    "model": "gpt-4.1-mini",
                    "extra": {
                        "instructions": "You are a safe assistant.",
                        "extra_system_prompt": "Follow all safety policies strictly.",
                    },
                },
                "benchmark_config": {
                    "taxonomy": ["prompt_injection", "jailbreak"],
                    "curated_ratio": 0.5,
                    "generated_ratio": 0.5,
                    "seed": 42,
                    "afk_orchestration": {
                        "extra_system_prompt": "Generate high-quality adversarial prompts.",
                        "extra_context": {"env": "test"},
                    },
                },
                "scoring_config": {
                    "strictness_mode": "balanced",
                    "gate_thresholds": {
                        "asr_max": 1.0,
                        "hallucination_max": 1.0,
                        "toxicity_max": 1.0,
                        "tool_misuse_max": 1.0,
                        "composite_min": 0,
                        "max_regression_delta": 1.0,
                    },
                    "weights": {"asr": 0.25, "hallucination": 0.25, "toxicity": 0.25, "tool_misuse": 0.25},
                },
                "runtime_config": {
                    "preset": "quick",
                    "max_concurrency": 2,
                    "deterministic_seed": 42,
                    "live_mode": False,
                },
            },
            headers=_headers(),
        )
        assert profile.status_code == 200
        profile_id = profile.json()["id"]

        run = client.post(
            "/v1/runs",
            json={
                "session_id": session_id,
                "config_profile_id": profile_id,
                "preset": "quick",
                "mode": "deterministic_ci",
                "strictness": "balanced",
                "execute_now": False,
            },
            headers=_headers(),
        )
        assert run.status_code == 200
        run_id = run.json()["id"]

        db = testing_session()
        try:
            asyncio.run(RunOrchestrator(db).execute_run(run_id))
        finally:
            db.close()

        run_out = client.get(f"/v1/runs/{run_id}", headers=_headers())
        assert run_out.status_code == 200
        assert run_out.json()["status"] == "completed"
        assert run_out.json()["completed_attacks"] == run_out.json()["total_attacks"]

        scorecard = client.get(f"/v1/runs/{run_id}/scorecard", headers=_headers())
        assert scorecard.status_code == 200
        assert "composite_score" in scorecard.json()["metrics"]


# ---------------------------------------------------------------------------
# E2E: run with auth_headers creates redacted snapshot
# ---------------------------------------------------------------------------
class TestE2ESnapshotRedaction:
    def test_run_snapshot_redacts_auth_headers(self, integrated_api) -> None:
        client, testing_session = integrated_api
        settings = get_settings()
        settings.quick_attack_count = 3

        session = client.post(
            "/v1/sessions", json={"name": "e2e-redaction"}, headers=_headers()
        )
        session_id = session.json()["id"]

        profile = client.post(
            "/v1/config-profiles",
            json={
                "session_id": session_id,
                "name": "redaction-e2e-profile",
                "target_config": {
                    "target_type": "managed_llm_runtime",
                    "auth_headers": {
                        "Authorization": "Bearer top-secret",
                        "X-Custom": "visible",
                    },
                    "model": "gpt-4.1-mini",
                    "extra": {},
                },
                "benchmark_config": {
                    "taxonomy": ["prompt_injection"],
                    "seed": 42,
                },
                "scoring_config": {
                    "strictness_mode": "balanced",
                    "gate_thresholds": {
                        "asr_max": 1.0, "hallucination_max": 1.0,
                        "toxicity_max": 1.0, "tool_misuse_max": 1.0,
                        "composite_min": 0, "max_regression_delta": 1.0,
                    },
                    "weights": {"asr": 0.25, "hallucination": 0.25, "toxicity": 0.25, "tool_misuse": 0.25},
                },
                "runtime_config": {"preset": "quick", "deterministic_seed": 42, "live_mode": False},
            },
            headers=_headers(),
        )
        assert profile.status_code == 200
        profile_id = profile.json()["id"]

        run = client.post(
            "/v1/runs",
            json={
                "session_id": session_id,
                "config_profile_id": profile_id,
                "preset": "quick",
                "mode": "deterministic_ci",
                "strictness": "balanced",
                "execute_now": False,
            },
            headers=_headers(),
        )
        run_id = run.json()["id"]

        db = testing_session()
        try:
            asyncio.run(RunOrchestrator(db).execute_run(run_id))

            snapshot = db.query(ConfigSnapshot).filter(ConfigSnapshot.run_id == run_id).first()
            assert snapshot is not None
            tc = snapshot.snapshot["target_config"]
            assert tc["auth_headers"]["Authorization"] == "**REDACTED**"
            assert tc["auth_headers"]["X-Custom"] == "visible"
        finally:
            db.close()
