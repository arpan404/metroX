from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models import (
    Comparison,
    MitigationEffect,
    MitigationExperiment,
    Recommendation,
    ScoreCard,
)
from app.pipeline.compare import compare_runs

MITIGATION_LIBRARY = {
    "hallucination_rate": {
        "title": "Improve grounding and citation validation",
        "description": "Increase retrieval quality threshold, add citation verification, and reject unsupported claims.",
        "cost": 0.45,
    },
    "prompt_injection_rate": {
        "title": "Harden instruction hierarchy",
        "description": "Add system prompt hardening and explicit injection override refusal templates.",
        "cost": 0.35,
    },
    "jailbreak_rate": {
        "title": "Strengthen refusal and moderation rules",
        "description": "Use stricter safety policy and refusal rewrites for high-risk intents.",
        "cost": 0.40,
    },
    "tool_misuse_rate": {
        "title": "Enforce tool policy approvals",
        "description": "Require approval gates for mutating tools and deny unknown tool routes.",
        "cost": 0.25,
    },
    "toxicity_rate": {
        "title": "Apply toxic output reranking",
        "description": "Use moderation scoring and fallback safer completions before final output.",
        "cost": 0.30,
    },
}


def create_mitigation_experiment(
    db: Session,
    *,
    name: str,
    baseline_run_id: str,
    candidate_run_id: str,
    config: dict[str, Any],
) -> MitigationExperiment:
    baseline = db.query(ScoreCard).filter(ScoreCard.run_id == baseline_run_id).one_or_none()
    candidate = db.query(ScoreCard).filter(ScoreCard.run_id == candidate_run_id).one_or_none()
    if not baseline or not candidate:
        raise ValueError("Both runs need scorecards before mitigation comparison")

    comparison: Comparison = compare_runs(db, baseline_run_id, candidate_run_id)

    experiment = MitigationExperiment(
        name=name,
        baseline_run_id=baseline_run_id,
        candidate_run_id=candidate_run_id,
        config=config,
        status="completed",
    )
    db.add(experiment)
    db.commit()
    db.refresh(experiment)

    effects: list[MitigationEffect] = []
    recs: list[Recommendation] = []

    rank = 1
    for metric_name in [
        "asr",
        "hallucination_rate",
        "prompt_injection_rate",
        "jailbreak_rate",
        "tool_misuse_rate",
        "toxicity_rate",
    ]:
        base = float(baseline.metrics.get(metric_name, 0.0))
        cand = float(candidate.metrics.get(metric_name, 0.0))
        uplift = base - cand
        metric_test = comparison.tests.get(metric_name, {})

        effects.append(
            MitigationEffect(
                mitigation_experiment_id=experiment.id,
                metric_name=metric_name,
                uplift=uplift,
                ci_low=float(uplift - 0.03),
                ci_high=float(uplift + 0.03),
                p_value=float(metric_test.get("q_value", 1.0)),
            )
        )

        if metric_name in MITIGATION_LIBRARY:
            lib = MITIGATION_LIBRARY[metric_name]
            expected = max(0.0, uplift)
            recs.append(
                Recommendation(
                    mitigation_experiment_id=experiment.id,
                    title=lib["title"],
                    description=lib["description"],
                    expected_impact=expected,
                    implementation_cost=float(lib["cost"]),
                    rank=rank,
                )
            )
            rank += 1

    recs.sort(key=lambda item: (item.expected_impact - item.implementation_cost), reverse=True)
    for idx, rec in enumerate(recs, start=1):
        rec.rank = idx

    db.add_all(effects)
    db.add_all(recs)
    db.commit()

    return experiment


def mitigation_payload(db: Session, mitigation_experiment_id: str) -> dict[str, Any]:
    experiment = (
        db.query(MitigationExperiment)
        .filter(MitigationExperiment.id == mitigation_experiment_id)
        .one_or_none()
    )
    if not experiment:
        raise ValueError("Mitigation experiment not found")

    effects = (
        db.query(MitigationEffect)
        .filter(MitigationEffect.mitigation_experiment_id == mitigation_experiment_id)
        .all()
    )
    recs = (
        db.query(Recommendation)
        .filter(Recommendation.mitigation_experiment_id == mitigation_experiment_id)
        .order_by(Recommendation.rank.asc())
        .all()
    )

    return {
        "id": experiment.id,
        "name": experiment.name,
        "baseline_run_id": experiment.baseline_run_id,
        "candidate_run_id": experiment.candidate_run_id,
        "status": experiment.status,
        "created_at": experiment.created_at,
        "effects": [
            {
                "metric_name": effect.metric_name,
                "uplift": effect.uplift,
                "ci_low": effect.ci_low,
                "ci_high": effect.ci_high,
                "p_value": effect.p_value,
            }
            for effect in effects
        ],
        "recommendations": [
            {
                "title": rec.title,
                "description": rec.description,
                "expected_impact": rec.expected_impact,
                "implementation_cost": rec.implementation_cost,
                "rank": rec.rank,
            }
            for rec in recs
        ],
    }
