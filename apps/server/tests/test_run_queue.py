from __future__ import annotations

from app.config import get_settings
from app.services.run_queue import RunQueue


class _FakeRedis:
    def __init__(self) -> None:
        self.items: list[str] = []

    def rpush(self, _key: str, run_id: str) -> None:
        self.items.append(run_id)

    def llen(self, _key: str) -> int:
        return len(self.items)

    def blpop(self, _key: str, timeout: int = 1):
        if not self.items:
            return None
        return (_key, self.items.pop(0))


def test_redis_backend_queue_enqueues_and_reports_stats() -> None:
    settings = get_settings()
    previous_backend = settings.run_queue_backend
    previous_enabled = settings.run_queue_enabled
    settings.run_queue_backend = "redis"
    settings.run_queue_enabled = True
    queue = RunQueue()
    queue._redis_client = _FakeRedis()  # type: ignore[assignment]
    queue.enqueue("run-1")
    queue.enqueue("run-2")
    stats = queue.stats()
    assert stats.pending == 2
    assert stats.workers == 0
    settings.run_queue_backend = previous_backend
    settings.run_queue_enabled = previous_enabled
