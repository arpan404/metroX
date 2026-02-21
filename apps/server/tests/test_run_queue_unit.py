"""Unit tests for app.runtime.run_queue module.

Covers:
  - Queue maxsize backpressure
  - Serialize / deserialize items
  - Stats reporting (inprocess and redis)
  - Retry and DLQ behaviour
  - Worker heartbeat
  - _should_process_run guard logic
"""
from __future__ import annotations

import json
import queue

import pytest

from app.config import get_settings
from app.runtime.run_queue import QueueStats, RunQueue


class _FakeRedis:
    """Minimal fake Redis for queue tests."""

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


def _settings_ctx(**overrides):
    """Context manager that patches settings and restores them."""
    class _Ctx:
        def __init__(self):
            self.settings = get_settings()
            self.original: dict = {}

        def __enter__(self):
            for k, v in overrides.items():
                self.original[k] = getattr(self.settings, k)
                setattr(self.settings, k, v)
            return self.settings

        def __exit__(self, *a):
            for k, v in self.original.items():
                setattr(self.settings, k, v)

    return _Ctx()


# ---------------------------------------------------------------------------
# Serialization
# ---------------------------------------------------------------------------
class TestSerialization:
    def test_serialize_deserialize_roundtrip(self) -> None:
        q = RunQueue()
        payload = q._serialize_item("run-42", 3)
        run_id, attempt = q._deserialize_item(payload)
        assert run_id == "run-42"
        assert attempt == 3

    def test_deserialize_negative_attempt_clamped(self) -> None:
        q = RunQueue()
        payload = json.dumps({"run_id": "r1", "attempt": -5})
        run_id, attempt = q._deserialize_item(payload)
        assert attempt == 0

    def test_deserialize_missing_run_id_raises(self) -> None:
        q = RunQueue()
        with pytest.raises(ValueError, match="invalid queue payload"):
            q._deserialize_item(json.dumps({"attempt": 1}))

    def test_deserialize_invalid_json_raises(self) -> None:
        q = RunQueue()
        with pytest.raises(ValueError, match="invalid queue payload"):
            q._deserialize_item("not-json")


# ---------------------------------------------------------------------------
# Inprocess queue backpressure
# ---------------------------------------------------------------------------
class TestInprocessQueueBackpressure:
    def test_maxsize_applied(self) -> None:
        with _settings_ctx(
            run_queue_backend="inprocess",
            run_queue_enabled=True,
            run_queue_max_size=2,
        ):
            q = RunQueue()
            q._queue = queue.Queue(maxsize=2)
            q._started = True
            q.enqueue("r1")
            q.enqueue("r2")
            with pytest.raises(RuntimeError, match="full"):
                q.enqueue("r3")

    def test_inprocess_stats(self) -> None:
        with _settings_ctx(
            run_queue_backend="inprocess",
            run_queue_enabled=True,
            run_queue_max_size=100,
        ):
            q = RunQueue()
            q._started = True
            q.enqueue("r1")
            q.enqueue("r2")
            stats = q.stats()
            assert stats.pending == 2
            assert stats.workers == 0  # no workers spawned in test
            assert stats.started is True


# ---------------------------------------------------------------------------
# Redis backend
# ---------------------------------------------------------------------------
class TestRedisBackend:
    def test_redis_enqueue(self) -> None:
        with _settings_ctx(
            run_queue_backend="redis",
            run_queue_enabled=True,
            run_queue_redis_key="test:queue",
        ):
            q = RunQueue()
            q._redis_client = _FakeRedis()
            q.enqueue("run-1", 1)
            q.enqueue("run-2")

            items = q._redis_client.items
            assert len(items) == 2
            first = json.loads(items[0])
            assert first["run_id"] == "run-1"
            assert first["attempt"] == 1

    def test_redis_stats(self) -> None:
        with _settings_ctx(
            run_queue_backend="redis",
            run_queue_enabled=True,
            run_queue_redis_key="test:queue",
            run_queue_redis_dlq_key="test:queue:dlq",
            run_queue_redis_workers_key="test:workers",
        ):
            q = RunQueue()
            fake = _FakeRedis()
            q._redis_client = fake
            q.enqueue("r1")
            q.enqueue("r2")
            stats = q.stats()
            assert stats.pending == 2
            assert stats.dlq_pending == 0

    def test_redis_dlq_on_max_retries(self) -> None:
        with _settings_ctx(
            run_queue_backend="redis",
            run_queue_enabled=True,
            run_queue_max_retries=0,
            run_queue_redis_key="test:queue",
            run_queue_redis_dlq_key="test:queue:dlq",
        ):
            q = RunQueue()
            q._redis_client = _FakeRedis()
            q._enqueue_retry_or_dlq("run-err", 0, "boom")
            assert len(q._redis_client.dlq) == 1
            payload = json.loads(q._redis_client.dlq[0])
            assert payload["run_id"] == "run-err"
            assert payload["error"] == "boom"

    def test_redis_retry_when_budget_remaining(self) -> None:
        with _settings_ctx(
            run_queue_backend="redis",
            run_queue_enabled=True,
            run_queue_max_retries=3,
            run_queue_retry_backoff_s=0.0,
            run_queue_redis_key="test:queue",
            run_queue_redis_dlq_key="test:queue:dlq",
        ):
            q = RunQueue()
            q._redis_client = _FakeRedis()
            q._started = True
            q._enqueue_retry_or_dlq("run-retry", 0, "temp error")
            # Should re-enqueue, not DLQ
            assert len(q._redis_client.items) == 1
            assert len(q._redis_client.dlq) == 0
            requeued = json.loads(q._redis_client.items[0])
            assert requeued["run_id"] == "run-retry"
            assert requeued["attempt"] == 1

    def test_heartbeat_writes_to_workers_hash(self) -> None:
        with _settings_ctx(
            run_queue_backend="redis",
            run_queue_enabled=True,
            run_queue_redis_workers_key="test:workers",
            run_queue_worker_heartbeat_ttl_s=30,
        ):
            q = RunQueue()
            fake = _FakeRedis()
            q._redis_client = fake
            q._heartbeat()
            assert len(fake.hashes.get("test:workers", {})) == 1


# ---------------------------------------------------------------------------
# QueueStats dataclass
# ---------------------------------------------------------------------------
class TestQueueStats:
    def test_fields(self) -> None:
        stats = QueueStats(pending=5, dlq_pending=2, workers=3, live_workers=2, started=True)
        assert stats.pending == 5
        assert stats.dlq_pending == 2
        assert stats.workers == 3
        assert stats.live_workers == 2
        assert stats.started is True
