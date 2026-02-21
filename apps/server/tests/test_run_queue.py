from __future__ import annotations

import json

from app.config import get_settings
from app.runtime.run_queue import RunQueue


class _FakeRedis:
    def __init__(self) -> None:
        self.items_by_key: dict[str, list[str]] = {}
        self.dlq: list[str] = []
        self.hashes: dict[str, dict[str, str]] = {}

    def rpush(self, key: str, payload: str) -> None:
        if key.endswith(":dlq"):
            self.dlq.append(payload)
            return
        self.items_by_key.setdefault(key, []).append(payload)

    def llen(self, key: str) -> int:
        if key.endswith(":dlq"):
            return len(self.dlq)
        return len(self.items_by_key.get(key, []))

    def blpop(self, key, timeout: int = 1):
        keys = key if isinstance(key, list) else [key]
        for queue_key in keys:
            rows = self.items_by_key.get(queue_key, [])
            if rows:
                return (queue_key, rows.pop(0))
        return None

    def hset(self, key: str, field: str, value: str) -> None:
        self.hashes.setdefault(key, {})[field] = value

    def hlen(self, key: str) -> int:
        return len(self.hashes.get(key, {}))

    def expire(self, _key: str, _ttl: int) -> None:
        return


def test_redis_backend_queue_enqueues_and_reports_stats() -> None:
    settings = get_settings()
    previous_backend = settings.run_queue_backend
    previous_enabled = settings.run_queue_enabled
    previous_dlq = settings.run_queue_redis_dlq_key
    settings.run_queue_backend = "redis"
    settings.run_queue_enabled = True
    settings.run_queue_redis_dlq_key = "metrox:runs:dlq"
    queue = RunQueue()
    queue._redis_client = _FakeRedis()  # type: ignore[assignment]
    queue.enqueue("run-1", 1)
    queue.enqueue("run-2")
    first_key = sorted(queue._redis_client.items_by_key.keys())[0]  # type: ignore[attr-defined]
    first = json.loads(queue._redis_client.items_by_key[first_key][0])  # type: ignore[index]
    assert first["run_id"] == "run-1"
    assert first["attempt"] == 1
    assert first["priority"] == 2
    stats = queue.stats()
    assert stats.pending == 2
    assert stats.dlq_pending == 0
    assert stats.workers >= 1
    assert stats.live_workers == 0
    settings.run_queue_backend = previous_backend
    settings.run_queue_enabled = previous_enabled
    settings.run_queue_redis_dlq_key = previous_dlq


def test_redis_dlq_when_retry_budget_exhausted() -> None:
    settings = get_settings()
    previous_backend = settings.run_queue_backend
    previous_enabled = settings.run_queue_enabled
    previous_max_retries = settings.run_queue_max_retries
    previous_dlq = settings.run_queue_redis_dlq_key
    settings.run_queue_backend = "redis"
    settings.run_queue_enabled = True
    settings.run_queue_max_retries = 0
    settings.run_queue_redis_dlq_key = "metrox:runs:dlq"
    queue = RunQueue()
    queue._redis_client = _FakeRedis()  # type: ignore[assignment]
    queue._enqueue_retry_or_dlq("run-err", 0, "boom", priority=2)
    assert len(queue._redis_client.dlq) == 1  # type: ignore[attr-defined]
    payload = json.loads(queue._redis_client.dlq[0])  # type: ignore[index]
    assert payload["run_id"] == "run-err"
    assert payload["error"] == "boom"
    settings.run_queue_backend = previous_backend
    settings.run_queue_enabled = previous_enabled
    settings.run_queue_max_retries = previous_max_retries
    settings.run_queue_redis_dlq_key = previous_dlq
