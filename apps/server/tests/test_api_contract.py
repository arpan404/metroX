from __future__ import annotations

from typing import Generator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.api.v1 import router
from app.db import get_db
from app.models import Base


@pytest.fixture
def api_client(tmp_path) -> Generator[tuple[TestClient, sessionmaker[Session]], None, None]:
    db_path = tmp_path / "api_contract.db"
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


def _create_session_and_profile(client: TestClient) -> tuple[str, str]:
    session = client.post(
        "/v1/sessions",
        json={"name": "contract-suite", "owner": "qa"},
        headers=_headers(),
    )
    assert session.status_code == 200
    session_id = session.json()["id"]

    profile = client.post(
        "/v1/config-profiles",
        json={
            "session_id": session_id,
            "name": "contract-profile",
            "target_config": {
                "target_type": "managed_llm_runtime",
                "endpoint": None,
                "auth_headers": {},
                "model": "gpt-4.1-mini",
                "extra": {},
            },
            "benchmark_config": {
                "dataset_name": "metrox-core",
                "taxonomy": ["prompt_injection", "hallucination", "tool_misuse"],
                "curated_ratio": 0.6,
                "generated_ratio": 0.4,
                "seed": 21,
                "slices": ["default"],
            },
            "scoring_config": {
                "strictness_mode": "balanced",
                "weak_supervision": True,
                "active_adjudication": True,
                "gate_thresholds": {
                    "asr_max": 0.9,
                    "hallucination_max": 0.9,
                    "toxicity_max": 0.9,
                    "tool_misuse_max": 0.9,
                    "composite_min": 10,
                    "max_regression_delta": 0.5,
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
                "max_concurrency": 2,
                "budget_usd": 1.0,
                "deterministic_seed": 21,
                "live_mode": False,
            },
        },
        headers=_headers(),
    )
    assert profile.status_code == 200
    profile_id = profile.json()["id"]

    return session_id, profile_id


def test_requires_api_key(api_client) -> None:
    client, _ = api_client
    response = client.get("/v1/sessions/does-not-matter")
    assert response.status_code == 401


def test_session_and_profile_contract(api_client) -> None:
    client, _ = api_client
    session_id, profile_id = _create_session_and_profile(client)

    got_session = client.get(f"/v1/sessions/{session_id}", headers=_headers())
    got_profile = client.get(f"/v1/config-profiles/{profile_id}", headers=_headers())

    assert got_session.status_code == 200
    assert got_profile.status_code == 200
    assert got_session.json()["name"] == "contract-suite"
    assert got_profile.json()["name"] == "contract-profile"


def test_create_run_contract(api_client) -> None:
    client, _ = api_client
    session_id, profile_id = _create_session_and_profile(client)

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
    payload = run.json()
    assert payload["session_id"] == session_id
    assert payload["config_profile_id"] == profile_id
    assert payload["status"] == "queued"


def test_afk_capabilities_contract(api_client) -> None:
    client, _ = api_client
    response = client.get("/v1/afk/capabilities", headers=_headers())
    assert response.status_code == 200
    payload = response.json()
    assert payload["version"] == "v1"
    assert isinstance(payload["high_impact_features"], list)
    assert "ci_strict" in payload["recommended_profiles"]


def test_provider_and_pricing_contract(api_client) -> None:
    client, _ = api_client

    provider = client.post(
        "/v1/providers/validate",
        json={
            "provider_type": "managed_llm_runtime",
            "model": "gpt-4.1-mini",
            "api_key": "dummy-key",
        },
        headers=_headers(),
    )
    assert provider.status_code == 200
    assert provider.json()["valid"] is True

    pricing = client.post(
        "/v1/pricing-profiles",
        json={
            "name": "contract-pricing",
            "currency": "USD",
            "fallback_policy": "hybrid",
            "models": [
                {
                    "provider_name": "generic",
                    "model": "*",
                    "input_per_1k": 0.001,
                    "output_per_1k": 0.002,
                    "reasoning_per_1k": 0.0,
                }
            ],
        },
        headers=_headers(),
    )
    assert pricing.status_code == 200
    profile_id = pricing.json()["id"]
    got = client.get(f"/v1/pricing-profiles/{profile_id}", headers=_headers())
    assert got.status_code == 200
    assert got.json()["id"] == profile_id


def test_provider_credential_lifecycle(api_client) -> None:
    client, _ = api_client
    key = client.post(
        "/v1/security/keys",
        json={"version": "v1", "key_material": "contract-key-material", "actor": "test"},
        headers=_headers(),
    )
    assert key.status_code == 200
    created = client.post(
        "/v1/providers/credentials",
        json={
            "name": "contract-openai",
            "provider_type": "openai_compatible",
            "api_key": "sk-test-123",
            "status": "active",
        },
        headers=_headers(),
    )
    assert created.status_code == 200
    credential_id = created.json()["id"]

    listed = client.get("/v1/providers/credentials", headers=_headers())
    assert listed.status_code == 200
    assert any(row["id"] == credential_id for row in listed.json()["credentials"])

    rotated = client.post(
        f"/v1/providers/credentials/{credential_id}/rotate",
        json={"api_key": "sk-new-456", "key_version": "v2"},
        headers=_headers(),
    )
    assert rotated.status_code == 200
    assert rotated.json()["key_version"] == "v2"
    audits = client.get(f"/v1/providers/credentials/{credential_id}/audits", headers=_headers())
    assert audits.status_code == 200
    assert isinstance(audits.json()["audits"], list)

    keys = client.get("/v1/security/keys", headers=_headers())
    assert keys.status_code == 200
    key_id = keys.json()["keys"][0]["id"]

    activated = client.post(f"/v1/security/keys/{key_id}/activate", headers=_headers())
    assert activated.status_code == 200
    assert activated.json()["status"] == "active"

    reencrypted = client.post(f"/v1/security/keys/{key_id}/reencrypt-credentials", headers=_headers())
    assert reencrypted.status_code == 200
    assert reencrypted.json()["updated"] >= 1

    key2 = client.post(
        "/v1/security/keys",
        json={"version": "v2", "key_material": "contract-key-material-v2", "actor": "test"},
        headers=_headers(),
    )
    assert key2.status_code == 200
    key2_id = key2.json()["id"]
    activated2 = client.post(f"/v1/security/keys/{key2_id}/activate", headers=_headers())
    assert activated2.status_code == 200
    retired = client.post(f"/v1/security/keys/{key_id}/retire", headers=_headers())
    assert retired.status_code == 200
    assert retired.json()["status"] == "retired"

    events = client.get("/v1/security/keys/events", headers=_headers())
    assert events.status_code == 200
    assert isinstance(events.json()["events"], list)


def test_orchestration_profile_contract(api_client) -> None:
    client, _ = api_client
    created = client.post(
        "/v1/orchestration-profiles",
        json={
            "name": "contract-orchestration",
            "description": "contract profile",
            "version": "v1",
            "status": "active",
            "config": {
                "join_policy": "all_required",
                "roles": [{"name": "attacker", "enabled": True}],
                "graph": {"nodes": [{"id": "attacker"}], "edges": []},
            },
        },
        headers=_headers(),
    )
    assert created.status_code == 200
    profile_id = created.json()["id"]

    listed = client.get("/v1/orchestration-profiles", headers=_headers())
    assert listed.status_code == 200
    assert any(item["id"] == profile_id for item in listed.json()["profiles"])

    patched = client.patch(
        f"/v1/orchestration-profiles/{profile_id}",
        json={"version": "v2", "config": {"join_policy": "first_success"}},
        headers=_headers(),
    )
    assert patched.status_code == 200
    assert patched.json()["version"] == "v2"
    assert patched.json()["config"]["graph_schema_version"] == "afk.flow.v1"

    same_version = client.patch(
        f"/v1/orchestration-profiles/{profile_id}",
        json={"version": "v2", "config": {"join_policy": "first_success"}},
        headers=_headers(),
    )
    assert same_version.status_code == 400

    invalid_profile = client.post(
        "/v1/orchestration-profiles",
        json={
            "name": "bad-orchestration",
            "config": {
                "join_policy": "all_required",
                "roles": [{"name": "attacker"}],
                "graph": {
                    "nodes": [{"id": "attacker"}],
                    "edges": [{"source": "missing", "target": "attacker"}],
                },
            },
        },
        headers=_headers(),
    )
    assert invalid_profile.status_code == 400


def test_config_profile_binds_orchestration_snapshot(api_client) -> None:
    client, _ = api_client
    session = client.post("/v1/sessions", json={"name": "snapshot-suite"}, headers=_headers())
    assert session.status_code == 200
    session_id = session.json()["id"]

    orchestration = client.post(
        "/v1/orchestration-profiles",
        json={
            "name": "snapshot-orchestration",
            "version": "v5",
            "config": {
                "join_policy": "all_required",
                "roles": [{"name": "attacker", "enabled": True}],
                "graph": {"nodes": [{"id": "attacker"}], "edges": []},
            },
        },
        headers=_headers(),
    )
    assert orchestration.status_code == 200
    orchestration_id = orchestration.json()["id"]

    profile = client.post(
        "/v1/config-profiles",
        json={
            "session_id": session_id,
            "name": "snapshot-profile",
            "orchestration_profile_id": orchestration_id,
            "target_config": {"target_type": "managed_llm_runtime", "model": "gpt-4.1-mini", "extra": {}},
            "benchmark_config": {"taxonomy": ["prompt_injection"], "afk_orchestration": {"graph": {"nodes": [{"id": "attacker"}], "edges": []}}},
            "scoring_config": {"strictness_mode": "balanced"},
            "runtime_config": {"preset": "quick"},
        },
        headers=_headers(),
    )
    assert profile.status_code == 200
    benchmark_config = profile.json()["benchmark_config"]
    snapshot = benchmark_config["orchestration_profile_snapshot"]
    assert snapshot["profile_id"] == orchestration_id
    assert snapshot["profile_version"] == "v5"
    assert snapshot["config_hash"]


def test_config_profile_rejects_legacy_target_type(api_client) -> None:
    client, _ = api_client
    session = client.post("/v1/sessions", json={"name": "legacy-target-suite"}, headers=_headers())
    assert session.status_code == 200
    session_id = session.json()["id"]

    profile = client.post(
        "/v1/config-profiles",
        json={
            "session_id": session_id,
            "name": "legacy-target-profile",
            "target_config": {"target_type": "synthetic", "model": "gpt-4.1-mini", "extra": {}},
            "benchmark_config": {"taxonomy": ["prompt_injection"]},
            "scoring_config": {"strictness_mode": "balanced"},
            "runtime_config": {"preset": "quick"},
        },
        headers=_headers(),
    )
    assert profile.status_code == 422
    assert "target_type" in profile.text
