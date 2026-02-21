from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, roc_auc_score
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.models import (
    CalibrationReport,
    Detection,
    Execution,
    FeatureValue,
    RiskModel,
    RiskPrediction,
)

FAILURE_TYPES = [
    "hallucination",
    "jailbreak_success",
    "prompt_injection_success",
    "tool_misuse",
    "toxicity",
]


def build_risk_models(db: Session, run_id: str) -> None:
    db.execute(delete(RiskModel).where(RiskModel.run_id == run_id))
    db.execute(delete(RiskPrediction).where(RiskPrediction.run_id == run_id))
    db.execute(delete(CalibrationReport).where(CalibrationReport.run_id == run_id))
    db.commit()

    exec_rows = db.query(Execution).filter(Execution.run_id == run_id).all()
    if not exec_rows:
        return

    execution_ids = [row.id for row in exec_rows]
    detections = (
        db.query(Detection)
        .filter(Detection.execution_id.in_(execution_ids))
        .all()
    )
    det_by_execution = {d.execution_id: d for d in detections}

    feature_rows = db.query(FeatureValue).filter(FeatureValue.run_id == run_id).all()
    if not feature_rows:
        return

    data: dict[str, dict[str, float]] = {}
    for feature in feature_rows:
        row = data.setdefault(feature.execution_id, {})
        if feature.value_num is not None:
            row[feature.feature_name] = float(feature.value_num)

    frame = pd.DataFrame.from_dict(data, orient="index").fillna(0.0)
    frame.index.name = "execution_id"
    frame = frame.reset_index()

    feature_names = [col for col in frame.columns if col != "execution_id"]
    X = frame[feature_names].to_numpy(dtype=float)
    id_list = frame["execution_id"].tolist()

    for failure_type in FAILURE_TYPES:
        y = np.array(
            [1 if det_by_execution.get(exec_id, None) and det_by_execution[exec_id].failure_flags.get(failure_type) else 0 for exec_id in id_list],
            dtype=int,
        )
        positives = int(y.sum())
        negatives = int(len(y) - positives)

        if positives < 3 or negatives < 3:
            base_prob = float(y.mean()) if len(y) else 0.0
            _store_constant_predictions(db, run_id, id_list, failure_type, base_prob)
            db.add(
                RiskModel(
                    run_id=run_id,
                    failure_type=failure_type,
                    model_type="constant",
                    metrics={"auc": None, "positives": positives, "negatives": negatives},
                    artifact={"base_probability": base_prob},
                )
            )
            db.add(
                CalibrationReport(
                    run_id=run_id,
                    failure_type=failure_type,
                    method="constant",
                    ece=0.0,
                    brier=float(np.mean((y - base_prob) ** 2)) if len(y) else 0.0,
                    meta={"note": "insufficient class variance"},
                )
            )
            continue

        base_model = LogisticRegression(max_iter=500, class_weight="balanced")
        calibrated = CalibratedClassifierCV(base_model, method="sigmoid", cv=3)
        calibrated.fit(X, y)
        probs = calibrated.predict_proba(X)[:, 1]

        auc = float(roc_auc_score(y, probs)) if len(np.unique(y)) > 1 else None
        brier = float(brier_score_loss(y, probs))
        ece = _expected_calibration_error(y, probs)

        coef_model = LogisticRegression(max_iter=500, class_weight="balanced")
        coef_model.fit(X, y)
        coef = coef_model.coef_[0]
        drivers = [feature_names[idx] for idx in np.argsort(np.abs(coef))[-3:][::-1]]

        db.add(
            RiskModel(
                run_id=run_id,
                failure_type=failure_type,
                model_type="logistic_calibrated",
                metrics={"auc": auc, "brier": brier, "positives": positives, "negatives": negatives},
                artifact={"top_drivers": drivers},
            )
        )

        db.add(
            CalibrationReport(
                run_id=run_id,
                failure_type=failure_type,
                method="sigmoid",
                ece=ece,
                brier=brier,
                meta={"auc": auc},
            )
        )

        for exec_id, prob in zip(id_list, probs):
            low = max(0.0, float(prob - 0.10))
            high = min(1.0, float(prob + 0.10))
            db.add(
                RiskPrediction(
                    run_id=run_id,
                    execution_id=exec_id,
                    failure_type=failure_type,
                    probability=float(prob),
                    uncertainty_low=low,
                    uncertainty_high=high,
                    drivers=drivers,
                )
            )

    db.commit()


def _store_constant_predictions(
    db: Session,
    run_id: str,
    execution_ids: list[str],
    failure_type: str,
    probability: float,
) -> None:
    for execution_id in execution_ids:
        db.add(
            RiskPrediction(
                run_id=run_id,
                execution_id=execution_id,
                failure_type=failure_type,
                probability=probability,
                uncertainty_low=max(0.0, probability - 0.05),
                uncertainty_high=min(1.0, probability + 0.05),
                drivers=["insufficient_training_data"],
            )
        )


def _expected_calibration_error(y_true: np.ndarray, y_prob: np.ndarray, bins: int = 10) -> float:
    bin_edges = np.linspace(0.0, 1.0, bins + 1)
    ece = 0.0
    n = len(y_true)
    for i in range(bins):
        lo, hi = bin_edges[i], bin_edges[i + 1]
        mask = (y_prob >= lo) & (y_prob < hi)
        if not mask.any():
            continue
        acc = float(y_true[mask].mean())
        conf = float(y_prob[mask].mean())
        ece += abs(acc - conf) * (mask.sum() / n)
    return float(ece)


def risk_cards(db: Session, run_id: str) -> list[dict[str, Any]]:
    preds = db.query(RiskPrediction).filter(RiskPrediction.run_id == run_id).all()
    grouped: dict[str, list[RiskPrediction]] = {}
    for pred in preds:
        grouped.setdefault(pred.failure_type, []).append(pred)

    cards: list[dict[str, Any]] = []
    for failure_type, rows in grouped.items():
        probs = [row.probability for row in rows]
        cards.append(
            {
                "failure_type": failure_type,
                "risk_probability": float(np.mean(probs)) if probs else 0.0,
                "uncertainty_band": {
                    "low": float(np.mean([row.uncertainty_low for row in rows])) if rows else 0.0,
                    "high": float(np.mean([row.uncertainty_high for row in rows])) if rows else 0.0,
                },
                "top_drivers": rows[0].drivers if rows else [],
                "sample_size": len(rows),
            }
        )
    cards.sort(key=lambda card: card["risk_probability"], reverse=True)
    return cards
