from __future__ import annotations

import queue
import threading
from dataclasses import dataclass
from typing import cast

from app.config import get_settings
from app.db import SessionLocal

try:
    import redis
except Exception:  # pragma: no cover - optional dependency path
    redis = None  # type: ignore[assignment]


@dataclass
class QueueStats:
    pending: int
    workers: int
    started: bool


class RunQueue:
    def __init__(self) -> None:
        self._queue: queue.Queue[str] = queue.Queue()
        self._started = False
        self._lock = threading.Lock()
        self._workers: list[threading.Thread] = []
        self._redis_client: redis.Redis | None = None  # type: ignore[name-defined]

    def _backend(self) -> str:
        return get_settings().run_queue_backend.strip().lower()

    def _get_redis_client(self):
        if self._redis_client is not None:
            return self._redis_client
        if redis is None:
            raise RuntimeError("redis queue backend requested but redis package is not installed")
        settings = get_settings()
        self._redis_client = cast("redis.Redis", redis.from_url(settings.redis_url, decode_responses=True))
        return self._redis_client

    def start(self) -> None:
        with self._lock:
            if self._started:
                return
            settings = get_settings()
            if not settings.run_queue_enabled:
                self._started = True
                return
            if self._backend() == "redis":
                # Redis queue is served by dedicated worker processes.
                self._started = True
                return
            for idx in range(max(1, settings.run_worker_threads)):
                thread = threading.Thread(target=self._worker_loop, daemon=True, name=f"run-worker-{idx}")
                thread.start()
                self._workers.append(thread)
            self._started = True

    def enqueue(self, run_id: str) -> None:
        self.start()
        if self._backend() == "redis":
            settings = get_settings()
            self._get_redis_client().rpush(settings.run_queue_redis_key, run_id)
            return
        self._queue.put(run_id)

    def stats(self) -> QueueStats:
        if self._backend() == "redis":
            settings = get_settings()
            try:
                pending = int(self._get_redis_client().llen(settings.run_queue_redis_key))
            except Exception:
                pending = -1
            return QueueStats(
                pending=pending,
                workers=0,
                started=self._started,
            )
        return QueueStats(
            pending=self._queue.qsize(),
            workers=len(self._workers),
            started=self._started,
        )

    def _worker_loop(self) -> None:
        while True:
            run_id = self._queue.get()
            db = SessionLocal()
            try:
                from app.services.orchestrator import RunOrchestrator

                RunOrchestrator(db).execute_run(run_id)
            except Exception:
                # Run state is marked failed in orchestrator; continue serving queue.
                pass
            finally:
                db.close()
                self._queue.task_done()

    def run_redis_worker_forever(self) -> None:
        settings = get_settings()
        if self._backend() != "redis":
            raise RuntimeError("run_redis_worker_forever is only valid when run_queue_backend=redis")
        client = self._get_redis_client()
        queue_key = settings.run_queue_redis_key
        timeout_s = max(1, int(settings.run_queue_redis_block_s))
        while True:
            item = client.blpop(queue_key, timeout=timeout_s)
            if not item:
                continue
            _, run_id = item
            db = SessionLocal()
            try:
                from app.services.orchestrator import RunOrchestrator

                RunOrchestrator(db).execute_run(str(run_id))
            except Exception:
                pass
            finally:
                db.close()


RUN_QUEUE = RunQueue()
