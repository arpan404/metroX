from __future__ import annotations

from typing import Generator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.api.v1 import router
from app.config import get_settings
from app.db import get_db
from app.models import AFKRunState, Base, ConfigProfile, Execution, Run
from app.pipeline.orchestrator import RunOrchestrator
from app.runtime.adapters import TargetResponse


@pytest.fixture
def integrated_client(tmp_path) -> Generator[tuple[TestClient, sessionmaker[Session]], None, None]:
    db_path = tmp_path / "integration.db"
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


def test_full_run_lifecycle_synthetic(integrated_client) -> None:
    client, testing_session = integrated_client
    settings = get_settings()
    settings.quick_attack_count = 15

    session = client.post("/v1/sessions", json={"name": "integration"}, headers=_headers())
    assert session.status_code == 200
    session_id = session.json()["id"]

    profile = client.post(
        "/v1/config-profiles",
        json={
            "session_id": session_id,
            "name": "integration-profile",
            "target_config": {
                "target_type": "managed_llm_runtime",
                "endpoint": None,
                "auth_headers": {},
                "model": "gpt-4.1-mini",
                "extra": {},
            },
            "benchmark_config": {
                "dataset_name": "metrox-core",
                "taxonomy": [
                    "prompt_injection",
                    "jailbreak",
                    "hallucination",
                    "tool_misuse",
                    "unsafe_output",
                ],
                "curated_ratio": 0.5,
                "generated_ratio": 0.5,
                "seed": 9,
                "slices": ["default"],
                "agentic_attacking": False,
                "agentic_provider": "afk_live",
            },
            "scoring_config": {
                "strictness_mode": "balanced",
                "weak_supervision": True,
                "active_adjudication": True,
                "gate_thresholds": {
                    "asr_max": 1.0,
                    "hallucination_max": 1.0,
                    "toxicity_max": 1.0,
                    "tool_misuse_max": 1.0,
                    "composite_min": 0,
                    "max_regression_delta": 1.0,
                },
                "weights": {
                    "asr": 0.4,
                    "hallucination": 0.3,
                    "toxicity": 0.2,
                    "tool_misuse": 0.1,
                },
            },
            "runtime_config": {
                "preset": "quick",
                "max_concurrency": 4,
                "budget_usd": 1,
                "deterministic_seed": 9,
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
        RunOrchestrator(db).execute_run(run_id)
    finally:
        db.close()

    run_out = client.get(f"/v1/runs/{run_id}", headers=_headers())
    scorecard = client.get(f"/v1/runs/{run_id}/scorecard", headers=_headers())
    risk = client.get(f"/v1/runs/{run_id}/risk-cards", headers=_headers())
    features = client.get(f"/v1/runs/{run_id}/features", headers=_headers())
    detector_votes = client.get(f"/v1/runs/{run_id}/detector-votes", headers=_headers())
    clusters = client.get(f"/v1/runs/{run_id}/clusters", headers=_headers())
    attack_summary = client.get(f"/v1/runs/{run_id}/attack-summary", headers=_headers())
    execution_slices = client.get(f"/v1/runs/{run_id}/execution-slices", headers=_headers())
    telemetry = client.get(f"/v1/runs/{run_id}/telemetry", headers=_headers())
    drift = client.get(f"/v1/runs/{run_id}/drift", headers=_headers())
    cost_summary = client.get(f"/v1/runs/{run_id}/cost-summary", headers=_headers())
    cost_series = client.get(f"/v1/runs/{run_id}/cost-timeseries", headers=_headers())
    inference = client.get(f"/v1/runs/{run_id}/inference", headers=_headers())
    calibration = client.get(f"/v1/runs/{run_id}/calibration", headers=_headers())
    cooccurrence = client.get(f"/v1/runs/{run_id}/cooccurrence-graph", headers=_headers())
    forecast = client.get(f"/v1/runs/{run_id}/forecast", headers=_headers())
    report = client.post(f"/v1/reports/{run_id}/generate", headers=_headers())

    assert run_out.status_code == 200
    assert run_out.json()["status"] == "completed"
    assert run_out.json()["completed_attacks"] == run_out.json()["total_attacks"]

    assert scorecard.status_code == 200
    assert "composite_score" in scorecard.json()["metrics"]

    assert risk.status_code == 200
    assert isinstance(risk.json()["risks"], list)

    assert features.status_code == 200
    assert len(features.json()["features"]) >= 1

    assert detector_votes.status_code == 200
    assert isinstance(detector_votes.json()["votes"], list)
    assert len(detector_votes.json()["votes"]) >= run_out.json()["completed_attacks"]

    assert clusters.status_code == 200
    assert "clusters" in clusters.json()

    assert attack_summary.status_code == 200
    assert "attack_types" in attack_summary.json()
    assert isinstance(attack_summary.json()["attack_types"], list)
    assert execution_slices.status_code == 200
    assert isinstance(execution_slices.json()["slices"], list)
    assert telemetry.status_code == 200
    assert "event_counts" in telemetry.json()
    assert "detector_summary" in telemetry.json()

    assert drift.status_code == 200
    assert "drift_signals" in drift.json()
    assert cost_summary.status_code == 200
    assert "totals" in cost_summary.json()
    assert cost_series.status_code == 200
    assert isinstance(cost_series.json()["points"], list)
    assert inference.status_code == 200
    assert "tests" in inference.json()
    assert calibration.status_code == 200
    assert "reports" in calibration.json()
    assert cooccurrence.status_code == 200
    assert "edges" in cooccurrence.json()
    assert forecast.status_code == 200
    assert "forecasts" in forecast.json()

    assert report.status_code == 200
    assert report.json()["run_id"] == run_id

    events = client.get(f"/v1/runs/{run_id}/policy-events", headers=_headers())
    assert events.status_code == 200
    assert isinstance(events.json()["events"], list)


def test_resume_continues_from_checkpoint_without_duplicate_executions(integrated_client, monkeypatch) -> None:
    client, testing_session = integrated_client
    settings = get_settings()
    settings.quick_attack_count = 12

    def _fake_http_invoke(self, request):
        thread_in = str(request.extra.get("thread_id") or f"run-{request.run_id}")
        thread_out = f"{thread_in}-next"
        return TargetResponse(
            response_text="ok",
            retrieved_docs=[],
            tool_events=[],
            latency_ms=5.0,
            token_usage={
                "prompt_tokens": 200.0,
                "completion_tokens": 100.0,
                "total_tokens": 300.0,
                "total_cost_usd": 0.15,
            },
            raw_payload={"thread_id": thread_out},
            provider_name="agent_http",
            model_resolved=request.model,
        )

    monkeypatch.setattr("app.runtime.adapters.HttpTargetAdapter.invoke", _fake_http_invoke)

    session = client.post("/v1/sessions", json={"name": "resume-integration"}, headers=_headers())
    assert session.status_code == 200
    session_id = session.json()["id"]

    profile = client.post(
        "/v1/config-profiles",
        json={
            "session_id": session_id,
            "name": "resume-profile",
            "target_config": {
                "target_type": "agent_http",
                "endpoint": "http://127.0.0.1:8001/agents/refund/chat",
                "auth_headers": {},
                "model": "gpt-4.1-mini",
                "agent_id": "refund",
                "extra": {},
            },
            "benchmark_config": {
                "dataset_name": "metrox-core",
                "taxonomy": ["prompt_injection", "hallucination", "tool_misuse"],
                "curated_ratio": 0.5,
                "generated_ratio": 0.5,
                "seed": 11,
                "slices": ["default"],
                "agentic_attacking": False,
                "agentic_provider": "afk_live",
                "afk_orchestration": {"threading": {"enabled": True, "strategy": "per_attack_type"}},
            },
            "scoring_config": {
                "strictness_mode": "balanced",
                "weak_supervision": True,
                "active_adjudication": True,
                "gate_thresholds": {
                    "asr_max": 1.0,
                    "hallucination_max": 1.0,
                    "toxicity_max": 1.0,
                    "tool_misuse_max": 1.0,
                    "composite_min": 0,
                    "max_regression_delta": 1.0,
                },
                "weights": {"asr": 0.4, "hallucination": 0.3, "toxicity": 0.2, "tool_misuse": 0.1},
            },
            "runtime_config": {
                "preset": "quick",
                "max_concurrency": 4,
                "budget_usd": 0.00001,
                "cost_tracking_enabled": True,
                "abort_on_cost_breach": True,
                "deterministic_seed": 11,
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
        orchestrator = RunOrchestrator(db)
        orchestrator.execute_run(run_id)

        row = db.query(Run).filter(Run.id == run_id).one()
        assert row.status == "interrupted"
        assert 0 < row.completed_attacks < row.total_attacks

        execution_count_after_interrupt = db.query(Execution).filter(Execution.run_id == run_id).count()
        assert execution_count_after_interrupt == row.completed_attacks
        interrupted_state = (
            db.query(AFKRunState)
            .filter(AFKRunState.run_id == run_id, AFKRunState.state == "interrupted")
            .order_by(AFKRunState.created_at.desc())
            .first()
        )
        assert interrupted_state is not None
        assert isinstance(interrupted_state.checkpoint.get("target_thread_ids"), dict)
        assert interrupted_state.checkpoint["target_thread_ids"]

        profile_row = db.query(ConfigProfile).filter(ConfigProfile.id == profile_id).one()
        runtime_config = dict(profile_row.runtime_config)
        runtime_config["budget_usd"] = 10.0
        runtime_config["abort_on_cost_breach"] = False
        profile_row.runtime_config = runtime_config

        row.status = "queued"
        db.add(
            AFKRunState(
                run_id=run_id,
                thread_id=row.thread_id or f"run-{run_id}",
                state="resumed",
                step=0,
                checkpoint={"test_resume": True},
            )
        )
        db.commit()

        orchestrator.execute_run(run_id)

        resumed = db.query(Run).filter(Run.id == run_id).one()
        final_execution_count = db.query(Execution).filter(Execution.run_id == run_id).count()
        assert resumed.status == "completed"
        assert resumed.completed_attacks == resumed.total_attacks
        assert final_execution_count == resumed.total_attacks
        completed_state = (
            db.query(AFKRunState)
            .filter(AFKRunState.run_id == run_id, AFKRunState.state == "completed")
            .order_by(AFKRunState.created_at.desc())
            .first()
        )
        assert completed_state is not None
        completed_threads = completed_state.checkpoint.get("target_thread_ids")
        assert isinstance(completed_threads, dict)
        assert completed_threads
        assert set(interrupted_state.checkpoint["target_thread_ids"]).issubset(set(completed_threads))
    finally:
        db.close()


@pytest.mark.nightly
def test_nightly_live_placeholder() -> None:
    """Live eval placeholder for nightly pipeline; skips when provider key is missing."""
    import os

    key = os.getenv("METROX_LIVE_PROVIDER_KEY")
    if not key:
        pytest.skip("METROX_LIVE_PROVIDER_KEY is not configured")
    assert len(key) >= 8


@pytest.mark.nightly
def test_nightly_multi_provider_smoke_matrix() -> None:
    import os

    provider = os.getenv("METROX_NIGHTLY_PROVIDER", "managed_llm_runtime")
    if provider == "managed_llm_runtime":
        key = os.getenv("METROX_LIVE_PROVIDER_KEY")
        model = os.getenv("METROX_NIGHTLY_MODEL", "gpt-4.1-mini")
        if not key:
            pytest.skip("METROX_LIVE_PROVIDER_KEY missing for litellm smoke")
        from app.runtime.providers import validate_provider

        out = validate_provider(
            {
                "provider_type": "managed_llm_runtime",
                "api_key": key,
                "model": model,
            }
        )
        assert out["valid"] is True
        return

    if provider == "openai_compatible":
        base_url = os.getenv("METROX_OPENAI_COMPAT_BASE_URL")
        key = os.getenv("METROX_OPENAI_COMPAT_API_KEY")
        if not base_url or not key:
            pytest.skip("OpenAI-compatible credentials are not configured")
        from app.runtime.providers import validate_provider

        out = validate_provider(
            {
                "provider_type": "openai_compatible",
                "base_url": base_url,
                "api_key": key,
                "model": os.getenv("METROX_NIGHTLY_MODEL", "gpt-4.1-mini"),
            }
        )
        assert out["valid"] is True
        return

    pytest.skip(f"Unsupported nightly provider matrix value: {provider}")
