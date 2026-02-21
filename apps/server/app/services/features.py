from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.models import Execution, FeatureDefinition, FeatureValue

FEATURE_CATALOG: list[dict[str, str]] = [
    {
        "name": "prompt_length",
        "family": "prompt_linguistics",
        "description": "Character length of attack prompt",
        "dtype": "float",
    },
    {
        "name": "response_length",
        "family": "response_linguistics",
        "description": "Character length of response",
        "dtype": "float",
    },
    {
        "name": "retrieval_doc_count",
        "family": "retrieval_signals",
        "description": "Number of retrieved documents",
        "dtype": "float",
    },
    {
        "name": "retrieval_avg_score",
        "family": "retrieval_signals",
        "description": "Average retrieval score",
        "dtype": "float",
    },
    {
        "name": "tool_call_count",
        "family": "tool_graph",
        "description": "Tool call count in execution",
        "dtype": "float",
    },
    {
        "name": "policy_denial_count",
        "family": "policy_events",
        "description": "Count of denied tool actions",
        "dtype": "float",
    },
    {
        "name": "latency_ms",
        "family": "runtime",
        "description": "Execution latency in milliseconds",
        "dtype": "float",
    },
    {
        "name": "total_tokens",
        "family": "runtime",
        "description": "Total token usage",
        "dtype": "float",
    },
]


def ensure_feature_definitions(db: Session) -> None:
    existing = {
        (fd.name, fd.version)
        for fd in db.query(FeatureDefinition).all()
    }
    to_add = []
    for item in FEATURE_CATALOG:
        key = (item["name"], "v1")
        if key in existing:
            continue
        to_add.append(
            FeatureDefinition(
                name=item["name"],
                version="v1",
                family=item["family"],
                description=item["description"],
                dtype=item["dtype"],
            )
        )
    if to_add:
        db.add_all(to_add)
        db.commit()


def rebuild_features_for_run(db: Session, run_id: str, executions: Iterable[Execution]) -> None:
    db.execute(delete(FeatureValue).where(FeatureValue.run_id == run_id))
    db.commit()

    rows: list[FeatureValue] = []
    for execution in executions:
        prompt_length = float(len(execution.prompt))
        response_length = float(len(execution.response))
        doc_count = float(len(execution.retrieved_docs or []))
        scores = [float(doc.get("score", 0.0)) for doc in (execution.retrieved_docs or [])]
        avg_score = float(sum(scores) / len(scores)) if scores else 0.0
        tool_calls = float(len(execution.tool_events or []))
        denied = float(
            sum(1 for event in (execution.tool_events or []) if event.get("mutating") and not event.get("approved"))
        )
        total_tokens = float(execution.token_usage.get("total_tokens", 0))

        values = {
            "prompt_length": prompt_length,
            "response_length": response_length,
            "retrieval_doc_count": doc_count,
            "retrieval_avg_score": avg_score,
            "tool_call_count": tool_calls,
            "policy_denial_count": denied,
            "latency_ms": float(execution.latency_ms),
            "total_tokens": total_tokens,
        }

        for name, value in values.items():
            rows.append(
                FeatureValue(
                    run_id=run_id,
                    execution_id=execution.id,
                    feature_name=name,
                    feature_version="v1",
                    value_num=float(value),
                )
            )

    if rows:
        db.add_all(rows)
        db.commit()


def feature_table_for_run(db: Session, run_id: str) -> list[dict[str, Any]]:
    rows = db.query(FeatureValue).filter(FeatureValue.run_id == run_id).all()
    data: dict[str, dict[str, Any]] = {}
    for row in rows:
        execution_row = data.setdefault(row.execution_id, {"execution_id": row.execution_id})
        execution_row[row.feature_name] = row.value_num
    return list(data.values())
