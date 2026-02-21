from __future__ import annotations

import json
import logging
import time
from collections import defaultdict
from threading import Lock
from typing import Any

logger = logging.getLogger("metrox.api")


class SLAMetrics:
    def __init__(self) -> None:
        self._lock = Lock()
        self._requests = 0
        self._errors = 0
        self._latency_total_ms = 0.0
        self._status_counts: dict[str, int] = defaultdict(int)

    def record(self, *, status_code: int, latency_ms: float) -> None:
        with self._lock:
            self._requests += 1
            if status_code >= 500:
                self._errors += 1
            self._latency_total_ms += latency_ms
            self._status_counts[str(status_code)] += 1

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            avg_latency = self._latency_total_ms / self._requests if self._requests else 0.0
            error_rate = self._errors / self._requests if self._requests else 0.0
            return {
                "requests_total": self._requests,
                "errors_total": self._errors,
                "error_rate": error_rate,
                "avg_latency_ms": avg_latency,
                "status_counts": dict(self._status_counts),
                "targets": {
                    "error_budget_max": 0.01,
                    "p95_latency_target_ms": 1200.0,
                },
            }


METRICS = SLAMetrics()


def configure_logging() -> None:
    root = logging.getLogger()
    if root.handlers:
        return
    logging.basicConfig(level=logging.INFO, format="%(message)s")


def log_request_event(
    *,
    trace_id: str,
    path: str,
    method: str,
    status_code: int,
    latency_ms: float,
) -> None:
    payload = {
        "event": "http_request",
        "trace_id": trace_id,
        "path": path,
        "method": method,
        "status_code": status_code,
        "latency_ms": round(latency_ms, 2),
        "ts_ms": int(time.time() * 1000),
    }
    logger.info(json.dumps(payload, sort_keys=True))
