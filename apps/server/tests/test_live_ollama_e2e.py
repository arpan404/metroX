from __future__ import annotations

import asyncio
from typing import Generator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.api.v1 import router
from app.config import get_settings
from app.db import get_db
from app.models import Base, Execution, Run
from app.pipeline.orchestrator import RunOrchestrator
from app.runtime.providers import validate_provider
from tests.live_helpers import (
    configure_afk_litellm_env,
    live_test_config,
    live_tests_enabled,
    require_live_preflight,
)


@pytest.fixture
def live_client(tmp_path) -> Generator[tuple[TestClient, sessionmaker[Session]], None, None]:
    db_path = tmp_path / "live_ollama_e2e.db"
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False}, future=True)
    testing_session_local = sessionmaker(bind=engine, autoflush=False, autocommit=False, class_=Session)
    Base.metadata.create_all(bind=engine)

    app = FastAPI()
    app.include_router(router)

    def override_get_db() -> Generator[Session, None, None]:
        db = testing_session_local()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as client:
        yield client, testing_session_local

    app.dependency_overrides.clear()
    engine.dispose()


def _headers() -> dict[str, str]:
    return {"X-API-Key": "local-dev-key"}


def _ensure_key(client: TestClient) -> None:
    created = client.post(
        "/v1/security/keys",
        json={"version": "v1-live", "key_material": "live-contract-key-material", "actor": "live-test"},
        headers=_headers(),
    )
    if created.status_code not in {200, 400}:
        raise AssertionError(f"Failed to create key: {created.status_code} {created.text}")


def _create_session_and_profile(
    client: TestClient,
    *,
    target_type: str,
    model: str,
    runtime_provider: str,
    base_url: str | None,
    api_key: str,
    agentic_attacking: bool = True,
    afk_stream: bool = True,
) -> tuple[str, str]:
    session = client.post("/v1/sessions", json={"name": f"live-{target_type}"}, headers=_headers())
    assert session.status_code == 200
    session_id = session.json()["id"]

    profile = client.post(
        "/v1/config-profiles",
        json={
            "session_id": session_id,
            "name": f"live-{target_type}-profile",
            "target_config": {
                "target_type": target_type,
                "endpoint": None,
                "auth_headers": {},
                "model": model,
                "provider_name": runtime_provider,
                "base_url": base_url,
                "extra": {
                    "runtime_provider": runtime_provider,
                    "api_key": api_key,
                    "afk_stream": afk_stream,
                    "afk_timeout_s": 30.0,
                    "afk_memory_backend": "disabled",
                    "telemetry": "null",
                    **({"base_url": base_url} if base_url else {}),
                },
            },
            "benchmark_config": {
                "dataset_name": "metrox-core",
                "taxonomy": ["prompt_injection", "hallucination", "tool_misuse"],
                "curated_ratio": 0.6,
                "generated_ratio": 0.4,
                "seed": 77,
                "slices": ["default"],
                "agentic_attacking": agentic_attacking,
                "agentic_provider": "afk_live" if agentic_attacking else "mock",
                "agentic_model": model,
            },
            "scoring_config": {
                "strictness_mode": "balanced",
                "weak_supervision": True,
                "active_adjudication": True,
            },
            "runtime_config": {
                "preset": "quick",
                "max_concurrency": 2,
                "budget_usd": 2.0,
                "deterministic_seed": 77,
                "live_mode": True,
            },
        },
        headers=_headers(),
    )
    assert profile.status_code == 200, profile.text
    return session_id, profile.json()["id"]


@pytest.mark.live_model
def test_live_provider_validation_matrix_ollama() -> None:
    if not live_tests_enabled():
        pytest.skip("Set METROX_ENABLE_LIVE_MODEL_TESTS=1 to run live model tests")

    cfg = live_test_config()
    require_live_preflight(cfg)

    managed = validate_provider(
        {
            "provider_type": "managed_llm_runtime",
            "model": cfg["managed_model"],
            "api_key": cfg["api_key"],
        }
    )
    assert managed["valid"] is True
    assert managed["capability_confidence"] >= 1.0

    compat = validate_provider(
        {
            "provider_type": "openai_compatible",
            "base_url": cfg["openai_compat_base_url"],
            "api_key": cfg["api_key"],
            "model": cfg["openai_model"],
        }
    )
    assert compat["valid"] is True
    assert isinstance(compat.get("probe_results"), list)
    assert len(compat["probe_results"]) >= 2


@pytest.mark.live_model
def test_live_managed_llm_runtime_end_to_end(live_client) -> None:
    if not live_tests_enabled():
        pytest.skip("Set METROX_ENABLE_LIVE_MODEL_TESTS=1 to run live model tests")

    cfg = live_test_config()
    require_live_preflight(cfg)
    configure_afk_litellm_env(cfg)

    client, testing_session = live_client
    _ensure_key(client)

    settings = get_settings()
    settings.quick_attack_count = 8

    session_id, profile_id = _create_session_and_profile(
        client,
        target_type="managed_llm_runtime",
        model=cfg["managed_model"],
        runtime_provider="litellm",
        base_url=None,
        api_key=cfg["api_key"],
        agentic_attacking=True,
        afk_stream=True,
    )

    run = client.post(
        "/v1/runs",
        json={
            "session_id": session_id,
            "config_profile_id": profile_id,
            "preset": "quick",
            "mode": "live_nightly",
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
        rows = db.query(Execution).filter(Execution.run_id == run_id).all()
        assert rows
        degraded = [row for row in rows if isinstance(row.raw_payload, dict) and row.raw_payload.get("degraded")]
        assert not degraded, "managed_llm_runtime degraded to fallback; expected live Ollama execution"
    finally:
        db.close()

    out = client.get(f"/v1/runs/{run_id}", headers=_headers())
    assert out.status_code == 200
    assert out.json()["status"] == "completed"

    votes = client.get(f"/v1/runs/{run_id}/detector-votes", headers=_headers())
    assert votes.status_code == 200
    assert len(votes.json()["votes"]) >= out.json()["completed_attacks"]


@pytest.mark.live_model
def test_live_managed_agent_runtime_end_to_end(live_client) -> None:
    if not live_tests_enabled():
        pytest.skip("Set METROX_ENABLE_LIVE_MODEL_TESTS=1 to run live model tests")

    cfg = live_test_config()
    require_live_preflight(cfg)
    configure_afk_litellm_env(cfg)

    client, testing_session = live_client
    _ensure_key(client)

    settings = get_settings()
    settings.quick_attack_count = 1

    session_id, profile_id = _create_session_and_profile(
        client,
        target_type="managed_agent_runtime",
        model=cfg["managed_model"],
        runtime_provider="litellm",
        base_url=None,
        api_key=cfg["api_key"],
        agentic_attacking=False,
        afk_stream=False,
    )

    run = client.post(
        "/v1/runs",
        json={
            "session_id": session_id,
            "config_profile_id": profile_id,
            "preset": "quick",
            "mode": "live_nightly",
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
        row = db.query(Run).filter(Run.id == run_id).one()
        assert row.status == "completed"
    finally:
        db.close()

    policy_events = client.get(f"/v1/runs/{run_id}/policy-events", headers=_headers())
    assert policy_events.status_code == 200
    assert isinstance(policy_events.json()["events"], list)
