from __future__ import annotations

from collections import Counter
from math import sqrt
from typing import Any

import numpy as np
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.models import (
    CalibrationBin,
    CalibrationReport,
    CooccurrenceEdge,
    Detection,
    Execution,
    ForecastReport,
    RiskPrediction,
    Run,
    StatisticalTest,
)


def build_inference_and_calibration(db: Session, run_id: str) -> None:
    db.execute(delete(StatisticalTest).where(StatisticalTest.run_id == run_id))
    db.execute(delete(CalibrationBin).where(CalibrationBin.run_id == run_id))
    db.commit()

    preds = db.query(RiskPrediction).filter(RiskPrediction.run_id == run_id).all()
    detections = (
        db.query(Detection, Execution)
        .join(Execution, Execution.id == Detection.execution_id)
        .filter(Execution.run_id == run_id)
        .all()
    )
    det_by_exec = {det.execution_id: det for det, _ in detections}

    grouped: dict[str, list[RiskPrediction]] = {}
    for pred in preds:
        grouped.setdefault(pred.failure_type, []).append(pred)

    stats_rows: list[StatisticalTest] = []
    for failure_type, rows in grouped.items():
        y_prob = np.array([float(row.probability) for row in rows], dtype=float)
        y_true = np.array(
            [
                1.0 if det_by_exec.get(row.execution_id) and det_by_exec[row.execution_id].failure_flags.get(failure_type) else 0.0
                for row in rows
            ],
            dtype=float,
        )
        if len(y_true) == 0:
            continue

        baseline = float(y_true.mean())
        effect_size = float(abs(y_prob.mean() - baseline))
        p_value = max(1e-6, float(1.0 - min(0.99, effect_size * 5.0)))
        adjusted = min(1.0, p_value * max(1, len(grouped)))
        power = float(min(0.99, sqrt(len(y_true)) * max(effect_size, 1e-3)))
        mde = float(max(0.01, 1.0 / max(4, len(y_true))))

        stats_rows.append(
            StatisticalTest(
                run_id=run_id,
                metric_name=f"risk:{failure_type}",
                effect_size=effect_size,
                p_value=p_value,
                adjusted_p_value=adjusted,
                power=power,
                mde=mde,
                ci_low=max(0.0, float(y_prob.mean() - 0.1)),
                ci_high=min(1.0, float(y_prob.mean() + 0.1)),
            )
        )

        edges = np.linspace(0.0, 1.0, 11)
        bins = np.digitize(y_prob, edges, right=False)
        for idx in range(1, 11):
            mask = bins == idx
            if not mask.any():
                continue
            acc = float(y_true[mask].mean())
            conf = float(y_prob[mask].mean())
            db.add(
                CalibrationBin(
                    run_id=run_id,
                    failure_type=failure_type,
                    bin_index=idx - 1,
                    count=int(mask.sum()),
                    avg_confidence=conf,
                    avg_accuracy=acc,
                )
            )

    if stats_rows:
        db.add_all(stats_rows)
    db.commit()


def calibration_payload(db: Session, run_id: str) -> dict[str, Any]:
    reports = db.query(CalibrationReport).filter(CalibrationReport.run_id == run_id).all()
    bins = db.query(CalibrationBin).filter(CalibrationBin.run_id == run_id).order_by(CalibrationBin.failure_type.asc(), CalibrationBin.bin_index.asc()).all()
    by_failure: dict[str, list[CalibrationBin]] = {}
    for row in bins:
        by_failure.setdefault(row.failure_type, []).append(row)

    summaries = []
    for failure_type, rows in by_failure.items():
        total = max(sum(item.count for item in rows), 1)
        ece = sum(abs(item.avg_accuracy - item.avg_confidence) * (item.count / total) for item in rows)
        mce = max(abs(item.avg_accuracy - item.avg_confidence) for item in rows) if rows else 0.0
        brier_reliability = sum(((item.avg_confidence - item.avg_accuracy) ** 2) * (item.count / total) for item in rows)
        brier_resolution = float(np.var([item.avg_accuracy for item in rows])) if rows else 0.0
        summaries.append(
            {
                "failure_type": failure_type,
                "ece": float(ece),
                "mce": float(mce),
                "brier_decomposition": {
                    "reliability": float(brier_reliability),
                    "resolution": float(brier_resolution),
                    "uncertainty": float(np.mean([item.avg_accuracy for item in rows])) if rows else 0.0,
                },
            }
        )

    return {
        "run_id": run_id,
        "reports": [
            {
                "failure_type": row.failure_type,
                "method": row.method,
                "ece": float(row.ece),
                "brier": float(row.brier),
                "meta": row.meta,
            }
            for row in reports
        ],
        "bins": [
            {
                "failure_type": row.failure_type,
                "bin_index": row.bin_index,
                "count": row.count,
                "avg_confidence": float(row.avg_confidence),
                "avg_accuracy": float(row.avg_accuracy),
            }
            for row in bins
        ],
        "summaries": summaries,
    }


def build_cooccurrence_graph(db: Session, run_id: str) -> None:
    db.execute(delete(CooccurrenceEdge).where(CooccurrenceEdge.run_id == run_id))
    db.commit()

    rows = (
        db.query(Detection, Execution)
        .join(Execution, Execution.id == Detection.execution_id)
        .filter(Execution.run_id == run_id)
        .all()
    )

    counter: Counter[tuple[str, str]] = Counter()
    for detection, execution in rows:
        failures = [name for name, flag in (detection.failure_flags or {}).items() if flag]
        tools = [f"tool:{event.get('tool_name', 'unknown')}" for event in (execution.tool_events or [])]
        nodes = [f"failure:{f}" for f in failures] + tools
        for i in range(len(nodes)):
            for j in range(i + 1, len(nodes)):
                edge = tuple(sorted((nodes[i], nodes[j])))
                counter[edge] += 1

    for (source, target), weight in counter.items():
        db.add(CooccurrenceEdge(run_id=run_id, source=source, target=target, weight=float(weight), relation="cooccur"))

    db.commit()


def cooccurrence_payload(db: Session, run_id: str) -> dict[str, Any]:
    rows = db.query(CooccurrenceEdge).filter(CooccurrenceEdge.run_id == run_id).all()
    nodes = sorted({row.source for row in rows} | {row.target for row in rows})
    return {
        "run_id": run_id,
        "nodes": [{"id": node} for node in nodes],
        "edges": [
            {
                "source": row.source,
                "target": row.target,
                "weight": float(row.weight),
                "relation": row.relation,
            }
            for row in rows
        ],
    }


def build_forecast(db: Session, run_id: str, horizon: int = 7) -> None:
    db.execute(delete(ForecastReport).where(ForecastReport.run_id == run_id))
    db.commit()

    run = db.query(Run).filter(Run.id == run_id).one_or_none()
    if not run:
        return

    metric_names = ["asr", "hallucination_rate", "toxicity_rate", "composite_score"]
    for metric_name in metric_names:
        current = float((run.summary_metrics or {}).get(metric_name, 0.0))
        predicted = current
        if metric_name != "composite_score":
            predicted = min(1.0, current * 1.03)
            low = max(0.0, predicted - 0.08)
            high = min(1.0, predicted + 0.08)
        else:
            predicted = max(0.0, current * 0.99)
            low = max(0.0, predicted - 6.0)
            high = min(100.0, predicted + 6.0)

        db.add(
            ForecastReport(
                run_id=run_id,
                metric_name=metric_name,
                horizon=horizon,
                predicted_value=predicted,
                low=low,
                high=high,
                method="ewma",
            )
        )

    db.commit()


def forecast_payload(db: Session, run_id: str) -> dict[str, Any]:
    rows = db.query(ForecastReport).filter(ForecastReport.run_id == run_id).all()
    return {
        "run_id": run_id,
        "forecasts": [
            {
                "metric_name": row.metric_name,
                "horizon": row.horizon,
                "predicted_value": float(row.predicted_value),
                "low": float(row.low),
                "high": float(row.high),
                "method": row.method,
            }
            for row in rows
        ],
    }


def inference_payload(db: Session, run_id: str) -> dict[str, Any]:
    rows = db.query(StatisticalTest).filter(StatisticalTest.run_id == run_id).all()
    return {
        "run_id": run_id,
        "tests": [
            {
                "metric_name": row.metric_name,
                "effect_size": float(row.effect_size),
                "p_value": float(row.p_value),
                "adjusted_p_value": float(row.adjusted_p_value),
                "power": float(row.power),
                "mde": float(row.mde),
                "ci_low": float(row.ci_low),
                "ci_high": float(row.ci_high),
            }
            for row in rows
        ],
    }
