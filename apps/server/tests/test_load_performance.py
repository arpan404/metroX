from __future__ import annotations

import os
import time
from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.models import Base, Execution, ExecutionCost
from app.pipeline.costing import rebuild_run_cost_aggregate


@pytest.mark.load
def test_cost_aggregate_hot_path_10k(tmp_path) -> None:
    if os.getenv("METROX_ENABLE_LOAD") != "1":
        pytest.skip("Set METROX_ENABLE_LOAD=1 to run load tests")

    db_path = tmp_path / "load_hot_path.db"
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False}, future=True)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, class_=Session)
    Base.metadata.create_all(bind=engine)

    run_id = str(uuid4())
    db = TestingSessionLocal()
    try:
        for _ in range(10_000):
            execution = Execution(
                run_id=run_id,
                attack_case_id=str(uuid4()),
                target_type="managed_llm_runtime",
                provider_name="managed_llm_runtime",
                model_resolved="gpt-4.1-mini",
                prompt="prompt",
                response="response",
                latency_ms=12.0,
                token_usage={"prompt_tokens": 30, "completion_tokens": 22, "total_tokens": 52},
                retrieved_docs=[],
                tool_events=[],
                raw_payload={},
            )
            db.add(execution)
            db.flush()
            db.add(
                ExecutionCost(
                    run_id=run_id,
                    execution_id=execution.id,
                    provider_name="managed_llm_runtime",
                    model="gpt-4.1-mini",
                    prompt_tokens=30,
                    completion_tokens=22,
                    total_tokens=52,
                    provider_reported_cost_usd=0.0,
                    estimated_cost_usd=0.0002,
                    effective_cost_usd=0.0002,
                    cost_source="fallback",
                    confidence=0.8,
                )
            )
        db.commit()

        start = time.perf_counter()
        summary = rebuild_run_cost_aggregate(db, run_id)
        elapsed_s = time.perf_counter() - start
        assert summary["totals"]["effective_cost"] > 0
        assert elapsed_s < 3.5
    finally:
        db.close()
        engine.dispose()
