from __future__ import annotations

import hashlib
import random
from datetime import datetime
from typing import Any

import numpy as np
from scipy import stats
from sqlalchemy.orm import Session

from app.models import RunEvent


def stable_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def seeded_random(seed: int) -> random.Random:
    return random.Random(seed)


def log_event(
    db: Session,
    *,
    run_id: str,
    event_type: str,
    step: int,
    message: str | None = None,
    data: dict[str, Any] | None = None,
) -> RunEvent:
    event = RunEvent(
        run_id=run_id,
        event_type=event_type,
        step=step,
        message=message,
        data=data or {},
        created_at=datetime.utcnow(),
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def bootstrap_ci(values: list[float], alpha: float = 0.05, n_boot: int = 1000) -> tuple[float, float]:
    if not values:
        return (0.0, 0.0)
    arr = np.array(values, dtype=float)
    rng = np.random.default_rng(123)
    stats_samples = []
    for _ in range(n_boot):
        sample = rng.choice(arr, size=len(arr), replace=True)
        stats_samples.append(float(np.mean(sample)))
    lower = np.quantile(stats_samples, alpha / 2)
    upper = np.quantile(stats_samples, 1 - alpha / 2)
    return (float(lower), float(upper))


def proportion_test(success_a: int, total_a: int, success_b: int, total_b: int) -> float:
    if min(total_a, total_b) == 0:
        return 1.0
    count = np.array([success_a, success_b])
    nobs = np.array([total_a, total_b])
    _, pvalue = stats.proportions_ztest(count, nobs)
    return float(pvalue)


def benjamini_hochberg(p_values: list[float]) -> list[float]:
    m = len(p_values)
    if m == 0:
        return []
    indexed = sorted(enumerate(p_values), key=lambda item: item[1])
    adjusted = [0.0] * m
    prev = 1.0
    for rank, (idx, p_val) in enumerate(reversed(indexed), start=1):
        q = min(prev, p_val * m / (m - rank + 1))
        adjusted[idx] = q
        prev = q
    return adjusted


def as_bool(value: Any) -> bool:
    return bool(value)
