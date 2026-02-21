from __future__ import annotations

import json

from app.config import get_settings
from app.runtime.run_queue import RunQueue


class _FakeRedis:
    def __init__(self) -> None:
        self.items: list[str] = []
        self.dlq: list[str] = []
        self.hashes: dict[str, dict[str, str]] = {}

    def rpush(self, key: str, payload: str) -> None:
        if key.endswith(":dlq"):
            self.dlq.append(payload)
            return
        self.items.append(payload)

    def llen(self, key: str) -> int:
        if key.endswith(":dlq"):
            return len(self.dlq)
        return len(self.items)

    def blpop(self, _key: str, timeout: int = 1):
        if not self.items:
            return None
        return (_key, self.items.pop(0))

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
    first = json.loads(queue._redis_client.items[0])  # type: ignore[index]
    assert first["run_id"] == "run-1"
    assert first["attempt"] == 1
    stats = queue.stats()
    assert stats.pending == 2
    assert stats.dlq_pending == 0
    assert stats.workers == 0
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
    queue._enqueue_retry_or_dlq("run-err", 0, "boom")
    assert len(queue._redis_client.dlq) == 1  # type: ignore[attr-defined]
    payload = json.loads(queue._redis_client.dlq[0])  # type: ignore[index]
    assert payload["run_id"] == "run-err"
    assert payload["error"] == "boom"
    settings.run_queue_backend = previous_backend
    settings.run_queue_enabled = previous_enabled
    settings.run_queue_max_retries = previous_max_retries
    settings.run_queue_redis_dlq_key = previous_dlq
