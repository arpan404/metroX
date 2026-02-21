from __future__ import annotations

from sqlalchemy import create_engine, inspect

from app.models import Base


def test_hot_path_indexes_present(tmp_path) -> None:
    db_path = tmp_path / "index_contract.db"
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False}, future=True)
    Base.metadata.create_all(bind=engine)
    inspector = inspect(engine)

    run_event_indexes = {idx["name"]: idx for idx in inspector.get_indexes("run_events")}
    execution_cost_indexes = {idx["name"]: idx for idx in inspector.get_indexes("execution_costs")}

    assert "ix_run_events_run_id_id" in run_event_indexes
    assert run_event_indexes["ix_run_events_run_id_id"]["column_names"] == ["run_id", "id"]

    assert "ix_execution_costs_run_id_created_at" in execution_cost_indexes
    assert execution_cost_indexes["ix_execution_costs_run_id_created_at"]["column_names"] == [
        "run_id",
        "created_at",
    ]

    engine.dispose()
