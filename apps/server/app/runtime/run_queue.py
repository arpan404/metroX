from __future__ import annotations

import json
import queue
import socket
import threading
import time
from datetime import datetime, timezone
from dataclasses import dataclass
from typing import cast
from app.config import get_settings
from app.db import SessionLocal
from app.models import Run
from app.utils.common import log_event

try:
    import redis
except Exception:  # pragma: no cover - optional dependency path
    redis = None  # type: ignore[assignment]


@dataclass
class QueueStats:
    pending: int
    dlq_pending: int
    workers: int
    live_workers: int
    started: bool


class RunQueue:
    def __init__(self) -> None:
        self._queue: queue.Queue[tuple[str, int]] = queue.Queue(
            maxsize=get_settings().run_queue_max_size
        )
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

    def _serialize_item(self, run_id: str, attempt: int) -> str:
        return json.dumps({"run_id": run_id, "attempt": attempt}, separators=(",", ":"))

    def _deserialize_item(self, payload: str) -> tuple[str, int]:
        try:
            raw = json.loads(payload)
            run_id = str(raw.get("run_id", "")).strip()
            attempt = int(raw.get("attempt", 0))
            if not run_id:
                raise ValueError("missing run_id")
            return run_id, max(0, attempt)
        except Exception as exc:
            raise ValueError(f"invalid queue payload: {payload}") from exc

    def _worker_id(self) -> str:
        return f"{socket.gethostname()}:{threading.current_thread().name}"

    def _heartbeat(self) -> None:
        if self._backend() != "redis":
            return
        settings = get_settings()
        try:
            client = self._get_redis_client()
            worker_id = self._worker_id()
            now_iso = datetime.now(timezone.utc).isoformat()
            client.hset(settings.run_queue_redis_workers_key, worker_id, now_iso)
            client.expire(settings.run_queue_redis_workers_key, max(5, settings.run_queue_worker_heartbeat_ttl_s))
        except Exception:
            return

    def enqueue(self, run_id: str, attempt: int = 0) -> None:
        self.start()
        if self._backend() == "redis":
            settings = get_settings()
            self._get_redis_client().rpush(settings.run_queue_redis_key, self._serialize_item(run_id, attempt))
            return
        try:
            self._queue.put_nowait((run_id, attempt))
        except queue.Full:
            raise RuntimeError("Run queue is full; try again later")

    def _enqueue_retry_or_dlq(self, run_id: str, attempt: int, error: str) -> None:
        settings = get_settings()
        next_attempt = attempt + 1
        if next_attempt <= settings.run_queue_max_retries:
            time.sleep(max(0.0, settings.run_queue_retry_backoff_s))
            self.enqueue(run_id, next_attempt)
            return

        if self._backend() == "redis":
            try:
                self._get_redis_client().rpush(
                    settings.run_queue_redis_dlq_key,
                    json.dumps(
                        {
                            "run_id": run_id,
                            "attempt": attempt,
                            "error": error,
                            "failed_at": datetime.now(timezone.utc).isoformat(),
                        },
                        separators=(",", ":"),
                    ),
                )
            except Exception:
                pass

    def stats(self) -> QueueStats:
        if self._backend() == "redis":
            settings = get_settings()
            try:
                client = self._get_redis_client()
                pending = int(client.llen(settings.run_queue_redis_key))
                dlq_pending = int(client.llen(settings.run_queue_redis_dlq_key))
                live_workers = int(client.hlen(settings.run_queue_redis_workers_key))
            except Exception:
                pending = -1
                dlq_pending = -1
                live_workers = -1
            return QueueStats(
                pending=pending,
                dlq_pending=dlq_pending,
                workers=0,
                live_workers=live_workers,
                started=self._started,
            )
        return QueueStats(
            pending=self._queue.qsize(),
            dlq_pending=0,
            workers=len(self._workers),
            live_workers=len(self._workers),
            started=self._started,
        )

    def _should_process_run(self, run_id: str) -> tuple[bool, str]:
        db = SessionLocal()
        try:
            row = db.query(Run).filter(Run.id == run_id).one_or_none()
            if not row:
                return False, "missing_run"
            if row.status in {"completed", "running"}:
                return False, f"already_{row.status}"
            return True, "ok"
        finally:
            db.close()

    def _process_one(self, run_id: str, attempt: int) -> None:
        should_run, reason = self._should_process_run(run_id)
        if not should_run:
            return
        db = SessionLocal()
        try:
            from app.pipeline.orchestrator import RunOrchestrator

            log_event(
                db,
                run_id=run_id,
                event_type="queue_worker_started",
                step=0,
                message=f"attempt={attempt}",
            )
            RunOrchestrator(db).execute_run(run_id)
        except Exception as exc:
            try:
                log_event(
                    db,
                    run_id=run_id,
                    event_type="queue_worker_failed",
                    step=99,
                    message=f"attempt={attempt} error={exc}",
                )
            except Exception:
                pass
            self._enqueue_retry_or_dlq(run_id, attempt, str(exc))
        finally:
            db.close()

    def _worker_loop(self) -> None:
        while True:
            run_id, attempt = self._queue.get()
            try:
                self._process_one(run_id, attempt)
            finally:
                self._queue.task_done()

    def run_redis_worker_forever(self) -> None:
        settings = get_settings()
        if self._backend() != "redis":
            raise RuntimeError("run_redis_worker_forever is only valid when run_queue_backend=redis")
        client = self._get_redis_client()
        queue_key = settings.run_queue_redis_key
        timeout_s = max(1, int(settings.run_queue_redis_block_s))
        while True:
            self._heartbeat()
            item = client.blpop(queue_key, timeout=timeout_s)
            if not item:
                continue
            _, payload = item
            try:
                run_id, attempt = self._deserialize_item(str(payload))
                self._process_one(run_id, attempt)
            except Exception:
                continue


RUN_QUEUE = RunQueue()
