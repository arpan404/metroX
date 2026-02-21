from __future__ import annotations

from typing import Any

import numpy as np
from scipy.stats import entropy, ks_2samp
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.models import ChangePoint, DriftSignal, FeatureValue, Run, ScoreCard


def compute_drift(db: Session, run_id: str, baseline_run_id: str | None) -> None:
    db.execute(delete(DriftSignal).where(DriftSignal.run_id == run_id))
    db.execute(delete(ChangePoint).where(ChangePoint.run_id == run_id))
    db.commit()

    if not baseline_run_id:
        return

    current = db.query(FeatureValue).filter(FeatureValue.run_id == run_id).all()
    baseline = db.query(FeatureValue).filter(FeatureValue.run_id == baseline_run_id).all()

    current_by_feature: dict[str, list[float]] = {}
    baseline_by_feature: dict[str, list[float]] = {}

    for row in current:
        if row.value_num is not None:
            current_by_feature.setdefault(row.feature_name, []).append(float(row.value_num))
    for row in baseline:
        if row.value_num is not None:
            baseline_by_feature.setdefault(row.feature_name, []).append(float(row.value_num))

    for feature_name, curr_vals in current_by_feature.items():
        base_vals = baseline_by_feature.get(feature_name, [])
        if not curr_vals or not base_vals:
            continue

        psi = _psi(base_vals, curr_vals)
        ks_stat = ks_2samp(base_vals, curr_vals)
        kl = _kl_divergence(base_vals, curr_vals)
        level = "low"
        if psi > 0.2 or ks_stat.pvalue < 0.05:
            level = "medium"
        if psi > 0.35 or ks_stat.pvalue < 0.01:
            level = "high"

        db.add(
            DriftSignal(
                run_id=run_id,
                baseline_run_id=baseline_run_id,
                feature_name=feature_name,
                psi=float(psi),
                ks_pvalue=float(ks_stat.pvalue),
                kl_divergence=float(kl),
                drift_level=level,
            )
        )

    _compute_change_points(db, run_id)
    db.commit()


def _compute_change_points(db: Session, run_id: str) -> None:
    run = db.query(Run).filter(Run.id == run_id).one_or_none()
    if run is None:
        return

    scorecards = (
        db.query(ScoreCard, Run)
        .join(Run, Run.id == ScoreCard.run_id)
        .filter(Run.session_id == run.session_id)
        .order_by(Run.created_at.asc())
        .all()
    )
    if len(scorecards) < 2:
        return

    metric_names = ["asr", "hallucination_rate", "toxicity_rate", "tool_misuse_rate"]
    for metric_name in metric_names:
        series = [float(card.metrics.get(metric_name, 0.0)) for card, _ in scorecards]
        if len(series) < 3:
            continue
        rolling_mean = np.mean(series[:-1])
        delta = float(abs(series[-1] - rolling_mean))
        threshold = float(np.std(series[:-1]) * 2.0 + 1e-6)
        if delta > threshold:
            db.add(
                ChangePoint(
                    metric_name=metric_name,
                    run_id=run_id,
                    score=delta,
                    threshold=threshold,
                )
            )


def _psi(expected: list[float], actual: list[float], bins: int = 10) -> float:
    expected_arr = np.array(expected)
    actual_arr = np.array(actual)
    quantiles = np.quantile(expected_arr, np.linspace(0, 1, bins + 1))
    quantiles[0] = min(expected_arr.min(), actual_arr.min()) - 1e-9
    quantiles[-1] = max(expected_arr.max(), actual_arr.max()) + 1e-9

    expected_counts, _ = np.histogram(expected_arr, bins=quantiles)
    actual_counts, _ = np.histogram(actual_arr, bins=quantiles)

    expected_pct = np.where(expected_counts == 0, 1e-6, expected_counts / expected_counts.sum())
    actual_pct = np.where(actual_counts == 0, 1e-6, actual_counts / actual_counts.sum())

    psi = np.sum((actual_pct - expected_pct) * np.log(actual_pct / expected_pct))
    return float(psi)


def _kl_divergence(expected: list[float], actual: list[float], bins: int = 20) -> float:
    expected_arr = np.array(expected)
    actual_arr = np.array(actual)
    low = min(expected_arr.min(), actual_arr.min())
    high = max(expected_arr.max(), actual_arr.max())
    if low == high:
        return 0.0
    expected_hist, _ = np.histogram(expected_arr, bins=bins, range=(low, high), density=True)
    actual_hist, _ = np.histogram(actual_arr, bins=bins, range=(low, high), density=True)
    expected_hist = np.where(expected_hist == 0, 1e-6, expected_hist)
    actual_hist = np.where(actual_hist == 0, 1e-6, actual_hist)
    return float(entropy(actual_hist, expected_hist))


def drift_payload(db: Session, run_id: str) -> dict[str, Any]:
    signals = db.query(DriftSignal).filter(DriftSignal.run_id == run_id).all()
    change_points = db.query(ChangePoint).filter(ChangePoint.run_id == run_id).all()
    baseline_run_id = signals[0].baseline_run_id if signals else None

    return {
        "run_id": run_id,
        "baseline_run_id": baseline_run_id,
        "drift_signals": [
            {
                "feature_name": row.feature_name,
                "psi": row.psi,
                "ks_pvalue": row.ks_pvalue,
                "kl_divergence": row.kl_divergence,
                "drift_level": row.drift_level,
            }
            for row in signals
        ],
        "change_points": [
            {
                "metric_name": row.metric_name,
                "score": row.score,
                "threshold": row.threshold,
                "detected_at": row.detected_at.isoformat(),
            }
            for row in change_points
        ],
    }
