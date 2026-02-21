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
                "target_type": "synthetic",
                "endpoint": None,
                "auth_headers": {},
                "model": "gpt-4.1-mini",
                "extra": {},
            },
            "benchmark_config": {
                "dataset_name": "autoredteam-core",
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
