from __future__ import annotations

import os
import time
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.api.v1 import router
from app.db import get_db
from app.models import (
    AttackCase,
    Base,
    BenchmarkSnapshot,
    ConfigProfile,
    Detection,
    EvaluationSession,
    Execution,
    ExecutionCost,
    Run,
    RunEvent,
)
from app.services.costing import rebuild_run_cost_aggregate


def _headers() -> dict[str, str]:
    return {"X-API-Key": "local-dev-key"}


@pytest.mark.scale_pg
def test_postgres_10k_api_query_paths() -> None:
    if os.getenv("AUTOREDTEAM_ENABLE_PG_SCALE") != "1":
        pytest.skip("Set AUTOREDTEAM_ENABLE_PG_SCALE=1 to run postgres scale tests")
    database_url = os.getenv("AUTOREDTEAM_POSTGRES_SCALE_URL")
    if not database_url:
        pytest.skip("AUTOREDTEAM_POSTGRES_SCALE_URL is required for postgres scale tests")

    engine = create_engine(database_url, future=True, pool_pre_ping=True)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, class_=Session)
    Base.metadata.create_all(bind=engine)

    run_id = str(uuid4())
    db = TestingSessionLocal()
    try:
        session = EvaluationSession(id=str(uuid4()), name="scale-session", owner="ci")
        profile = ConfigProfile(
            id=str(uuid4()),
            session_id=session.id,
            name="scale-profile",
            strictness_mode="balanced",
            target_config={"target_type": "synthetic"},
            benchmark_config={"taxonomy": ["prompt_injection", "jailbreak", "hallucination", "tool_misuse"]},
            scoring_config={},
            runtime_config={},
        )
        run = Run(
            id=run_id,
            session_id=session.id,
            config_profile_id=profile.id,
            preset="deep",
            mode="deterministic_ci",
            strictness="balanced",
            status="completed",
            total_attacks=10_000,
            completed_attacks=10_000,
            created_at=datetime.now(timezone.utc),
        )
        benchmark = BenchmarkSnapshot(
            id=str(uuid4()),
            run_id=run.id,
            name="scale-benchmark",
            version="v1",
            source_mix={"curated": 0.5, "generated": 0.5},
        )

        db.add_all([session, profile, run, benchmark])
        db.flush()

        attack_types = ["prompt_injection", "jailbreak", "hallucination", "tool_misuse"]
        attack_ids: list[str] = []
        for attack_type in attack_types:
            row = AttackCase(
                id=str(uuid4()),
                benchmark_snapshot_id=benchmark.id,
                attack_type=attack_type,
                family=attack_type,
                prompt=f"{attack_type} prompt",
                target_behavior="stress",
                source="template",
                difficulty="medium",
                dedupe_hash=str(uuid4()).replace("-", ""),
                novelty_score=0.5,
            )
            db.add(row)
            attack_ids.append(row.id)
        db.flush()

        for idx in range(10_000):
            attack_type = attack_types[idx % len(attack_types)]
            execution = Execution(
                id=str(uuid4()),
                run_id=run.id,
                attack_case_id=attack_ids[idx % len(attack_ids)],
                target_type="synthetic",
                provider_name="synthetic",
                model_resolved="gpt-4.1-mini",
                prompt="attack prompt",
                response="response text",
                latency_ms=30 + (idx % 11),
                token_usage={"prompt_tokens": 24, "completion_tokens": 18, "total_tokens": 42},
                retrieved_docs=[],
                tool_events=[],
                raw_payload={},
            )
            db.add(execution)
            db.flush()
            db.add(
                Detection(
                    id=str(uuid4()),
                    execution_id=execution.id,
                    failure_flags={attack_type: idx % 3 == 0},
                    severity="medium",
                    confidence=0.6,
                    evidence={"attack_type": attack_type},
                )
            )
            db.add(
                ExecutionCost(
                    id=str(uuid4()),
                    run_id=run.id,
                    execution_id=execution.id,
                    provider_name="synthetic",
                    model="gpt-4.1-mini",
                    prompt_tokens=24,
                    completion_tokens=18,
                    total_tokens=42,
                    provider_reported_cost_usd=0.0,
                    estimated_cost_usd=0.00015,
                    effective_cost_usd=0.00015,
                    cost_source="fallback",
                    confidence=0.8,
                )
            )
            db.add(
                RunEvent(
                    run_id=run.id,
                    event_type="progress",
                    step=2,
                    message=f"processed {idx + 1}",
                    data={"idx": idx + 1},
                )
            )
            if (idx + 1) % 500 == 0:
                db.commit()
        db.commit()
        rebuild_run_cost_aggregate(db, run.id)
        explain_events = db.execute(
            text("EXPLAIN SELECT id FROM run_events WHERE run_id = :run_id AND id > 0 ORDER BY id LIMIT 50"),
            {"run_id": run.id},
        ).fetchall()
        explain_costs = db.execute(
            text("EXPLAIN SELECT execution_id FROM execution_costs WHERE run_id = :run_id ORDER BY created_at DESC LIMIT 50"),
            {"run_id": run.id},
        ).fetchall()
        explain_events_text = " ".join(str(row[0]) for row in explain_events)
        explain_costs_text = " ".join(str(row[0]) for row in explain_costs)
        assert "ix_run_events_run_id_id" in explain_events_text
        assert "ix_execution_costs_run_id_created_at" in explain_costs_text
        db.close()

        app = FastAPI()
        app.include_router(router)

        def override_get_db():
            local = TestingSessionLocal()
            try:
                yield local
            finally:
                local.close()

        app.dependency_overrides[get_db] = override_get_db

        with TestClient(app) as client:
            started = time.perf_counter()
            node = client.get(f"/v1/runs/{run.id}/node-telemetry", headers=_headers())
            node_elapsed = time.perf_counter() - started
            assert node.status_code == 200
            assert len(node.json()["nodes"]) >= 1
            assert node_elapsed < 3.0

            started = time.perf_counter()
            telemetry = client.get(f"/v1/runs/{run.id}/telemetry", headers=_headers())
            telemetry_elapsed = time.perf_counter() - started
            assert telemetry.status_code == 200
            assert telemetry.json()["progress"]["completed"] == 10_000
            assert telemetry_elapsed < 1.5

            started = time.perf_counter()
            cost = client.get(f"/v1/runs/{run.id}/cost-summary", headers=_headers())
            cost_elapsed = time.perf_counter() - started
            assert cost.status_code == 200
            assert cost.json()["totals"]["effective_cost"] > 0
            assert cost_elapsed < 1.5
    finally:
        with engine.begin() as cleanup:
            cleanup.exec_driver_sql("DROP SCHEMA public CASCADE")
            cleanup.exec_driver_sql("CREATE SCHEMA public")
        engine.dispose()
