from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models import Comparison, Detection, Execution, ScoreCard
from app.services.common import benjamini_hochberg, proportion_test

FLAG_BY_METRIC = {
    "asr": None,
    "hallucination_rate": "hallucination",
    "toxicity_rate": "toxicity",
    "tool_misuse_rate": "tool_misuse",
    "prompt_injection_rate": "prompt_injection_success",
    "jailbreak_rate": "jailbreak_success",
}


def compare_runs(db: Session, baseline_run_id: str, candidate_run_id: str) -> Comparison:
    baseline_card = db.query(ScoreCard).filter(ScoreCard.run_id == baseline_run_id).one_or_none()
    candidate_card = db.query(ScoreCard).filter(ScoreCard.run_id == candidate_run_id).one_or_none()
    if not baseline_card or not candidate_card:
        raise ValueError("Both baseline and candidate runs must have scorecards")

    baseline_det = _detections_for_run(db, baseline_run_id)
    candidate_det = _detections_for_run(db, candidate_run_id)

    tests: dict[str, Any] = {}
    raw_p_values: list[float] = []
    metric_order: list[str] = []

    for metric_name, flag in FLAG_BY_METRIC.items():
        base_success = _success_count(baseline_det, flag)
        cand_success = _success_count(candidate_det, flag)
        pvalue = proportion_test(cand_success, len(candidate_det), base_success, len(baseline_det))
        raw_p_values.append(pvalue)
        metric_order.append(metric_name)
        delta = float(candidate_card.metrics.get(metric_name, 0.0) - baseline_card.metrics.get(metric_name, 0.0))
        tests[metric_name] = {
            "p_value": pvalue,
            "delta": delta,
            "effect_size": delta,
            "candidate_rate": float(candidate_card.metrics.get(metric_name, 0.0)),
            "baseline_rate": float(baseline_card.metrics.get(metric_name, 0.0)),
        }

    adjusted = benjamini_hochberg(raw_p_values)
    for idx, metric_name in enumerate(metric_order):
        tests[metric_name]["q_value"] = adjusted[idx]
        tests[metric_name]["significant"] = adjusted[idx] < 0.05

    summary = {
        "candidate_composite": candidate_card.metrics.get("composite_score", 0.0),
        "baseline_composite": baseline_card.metrics.get("composite_score", 0.0),
        "composite_delta": float(
            candidate_card.metrics.get("composite_score", 0.0)
            - baseline_card.metrics.get("composite_score", 0.0)
        ),
        "significant_regressions": [
            metric
            for metric, payload in tests.items()
            if payload["delta"] > 0 and payload["significant"]
        ],
        "significant_improvements": [
            metric
            for metric, payload in tests.items()
            if payload["delta"] < 0 and payload["significant"]
        ],
    }

    comparison = Comparison(
        baseline_run_id=baseline_run_id,
        candidate_run_id=candidate_run_id,
        summary=summary,
        tests=tests,
    )
    db.add(comparison)
    db.commit()
    db.refresh(comparison)
    return comparison


def _detections_for_run(db: Session, run_id: str) -> list[Detection]:
    execution_ids = [row[0] for row in db.query(Execution.id).filter(Execution.run_id == run_id).all()]
    if not execution_ids:
        return []
    return db.query(Detection).filter(Detection.execution_id.in_(execution_ids)).all()


def _success_count(detections: list[Detection], flag: str | None) -> int:
    if flag is None:
        return sum(1 for d in detections if any(d.failure_flags.values()))
    return sum(1 for d in detections if d.failure_flags.get(flag))
