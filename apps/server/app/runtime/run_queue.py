from __future__ import annotations

import json
import logging
import queue
import socket
import threading
import time
import heapq
from datetime import datetime, timezone
from dataclasses import dataclass
from typing import cast
from app.config import get_settings
from app.db import SessionLocal
from app.models import Run
from app.utils.common import log_event


logger = logging.getLogger("metrox.queue")

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
        self._queue: queue.PriorityQueue[tuple[int, int, str, int]] = queue.PriorityQueue(
            maxsize=get_settings().run_queue_max_size
        )
        self._started = False
        self._lock = threading.Lock()
        self._sequence_lock = threading.Lock()
        self._sequence = 0
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
        self._redis_client = cast("redis.Redis", redis.from_url(settings.redis_url, decode_responses=True)) # type: ignore
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

    def _next_sequence(self) -> int:
        with self._sequence_lock:
            self._sequence += 1
            return self._sequence

    def _serialize_item(self, run_id: str, attempt: int, priority: int) -> str:
        return json.dumps(
            {"run_id": run_id, "attempt": attempt, "priority": priority},
            separators=(",", ":"),
        )

    def _deserialize_item(self, payload: str) -> tuple[str, int, int]:
        try:
            raw = json.loads(payload)
            run_id = str(raw.get("run_id", "")).strip()
            attempt = int(raw.get("attempt", 0))
            priority = int(raw.get("priority", get_settings().run_queue_default_priority))
            if not run_id:
                raise ValueError("missing run_id")
            return run_id, max(0, attempt), self._normalize_priority(priority)
        except Exception as exc:
            raise ValueError(f"invalid queue payload: {payload}") from exc

    def _normalize_priority(self, priority: int | None) -> int:
        settings = get_settings()
        min_priority = int(settings.run_queue_min_priority)
        max_priority = int(settings.run_queue_max_priority)
        if min_priority > max_priority:
            min_priority, max_priority = max_priority, min_priority
        if priority is None:
            return int(settings.run_queue_default_priority)
        return max(min_priority, min(max_priority, int(priority)))

    def _redis_priority_key(self, priority: int) -> str:
        settings = get_settings()
        return f"{settings.run_queue_redis_key}:p{self._normalize_priority(priority)}"

    def _redis_priority_keys(self) -> list[str]:
        settings = get_settings()
        min_priority = int(settings.run_queue_min_priority)
        max_priority = int(settings.run_queue_max_priority)
        if min_priority > max_priority:
            min_priority, max_priority = max_priority, min_priority
        return [self._redis_priority_key(priority) for priority in range(min_priority, max_priority + 1)]

    def _priority_bounds(self) -> tuple[int, int]:
        settings = get_settings()
        min_priority = int(settings.run_queue_min_priority)
        max_priority = int(settings.run_queue_max_priority)
        if min_priority > max_priority:
            min_priority, max_priority = max_priority, min_priority
        return min_priority, max_priority

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

    def enqueue(self, run_id: str, attempt: int = 0, priority: int | None = None) -> None:
        self.start()
        normalized_priority = self._normalize_priority(priority)
        if self._backend() == "redis":
            redis_key = self._redis_priority_key(normalized_priority)
            self._get_redis_client().rpush(
                redis_key,
                self._serialize_item(run_id, attempt, normalized_priority),
            )
            return
        try:
            self._queue.put_nowait((normalized_priority, self._next_sequence(), run_id, attempt))
        except queue.Full:
            raise RuntimeError("Run queue is full; try again later")

    def list_pending(self, limit: int = 200) -> list[dict[str, int | str]]:
        normalized_limit = max(1, int(limit))
        if self._backend() == "redis":
            out: list[dict[str, int | str]] = []
            try:
                client = self._get_redis_client()
                for key in self._redis_priority_keys():
                    if len(out) >= normalized_limit:
                        break
                    remaining = normalized_limit - len(out)
                    for payload in client.lrange(key, 0, max(0, remaining - 1)):
                        try:
                            run_id, attempt, priority = self._deserialize_item(str(payload))
                        except Exception:
                            continue
                        out.append(
                            {
                                "run_id": run_id,
                                "attempt": int(attempt),
                                "priority": int(priority),
                                "position": len(out) + 1,
                            }
                        )
                return out
            except Exception:
                return []

        with self._queue.mutex:
            snapshot = sorted(list(self._queue.queue), key=lambda row: (row[0], row[1]))
        return [
            {
                "run_id": run_id,
                "attempt": int(attempt),
                "priority": int(priority),
                "position": idx + 1,
            }
            for idx, (priority, _sequence, run_id, attempt) in enumerate(snapshot[:normalized_limit])
        ]

    def remove(self, run_id: str) -> bool:
        run_key = str(run_id or "").strip()
        if not run_key:
            return False

        if self._backend() == "redis":
            try:
                client = self._get_redis_client()
                removed = False
                for key in self._redis_priority_keys():
                    payloads = client.lrange(key, 0, -1)
                    survivors: list[str] = []
                    key_removed = False
                    for payload in payloads:
                        try:
                            queued_run_id, _attempt, _priority = self._deserialize_item(str(payload))
                        except Exception:
                            survivors.append(str(payload))
                            continue
                        if queued_run_id == run_key:
                            key_removed = True
                            removed = True
                            continue
                        survivors.append(str(payload))
                    if not key_removed:
                        continue
                    pipeline = client.pipeline()
                    pipeline.delete(key)
                    if survivors:
                        pipeline.rpush(key, *survivors)
                    pipeline.execute()
                return removed
            except Exception:
                return False

        with self._queue.mutex:
            before = len(self._queue.queue)
            self._queue.queue[:] = [item for item in self._queue.queue if item[2] != run_key]
            removed = before - len(self._queue.queue)
            if removed <= 0:
                return False
            heapq.heapify(self._queue.queue)
            self._queue.unfinished_tasks = max(0, self._queue.unfinished_tasks - removed)
            if self._queue.unfinished_tasks == 0:
                self._queue.all_tasks_done.notify_all()
            self._queue.not_full.notify_all()
            return True

    def set_priority(self, run_id: str, priority: int) -> dict[str, int | str] | None:
        run_key = str(run_id or "").strip()
        if not run_key:
            return None
        target_priority = self._normalize_priority(priority)

        if self._backend() == "redis":
            try:
                client = self._get_redis_client()
                source_key = ""
                source_payload = ""
                attempt = 0
                for key in self._redis_priority_keys():
                    payloads = client.lrange(key, 0, -1)
                    for payload in payloads:
                        try:
                            queued_run_id, queued_attempt, _queued_priority = self._deserialize_item(str(payload))
                        except Exception:
                            continue
                        if queued_run_id != run_key:
                            continue
                        source_key = key
                        source_payload = str(payload)
                        attempt = queued_attempt
                        break
                    if source_key:
                        break
                if not source_key or not source_payload:
                    return None
                destination_key = self._redis_priority_key(target_priority)
                rewritten = self._serialize_item(run_key, attempt, target_priority)
                pipeline = client.pipeline()
                pipeline.lrem(source_key, 1, source_payload)
                pipeline.lpush(destination_key, rewritten)
                pipeline.execute()
                return {
                    "run_id": run_key,
                    "attempt": int(attempt),
                    "priority": int(target_priority),
                }
            except Exception:
                return None

        with self._queue.mutex:
            selected: tuple[int, int, str, int] | None = None
            remaining: list[tuple[int, int, str, int]] = []
            for item in self._queue.queue:
                if selected is None and item[2] == run_key:
                    selected = item
                    continue
                remaining.append(item)
            if selected is None:
                return None
            existing_sequences = [item[1] for item in remaining if item[0] == target_priority]
            if existing_sequences:
                next_sequence = min(existing_sequences) - 1
            else:
                next_sequence = self._next_sequence()
            updated = (target_priority, int(next_sequence), selected[2], selected[3])
            remaining.append(updated)
            self._queue.queue[:] = remaining
            heapq.heapify(self._queue.queue)
            return {
                "run_id": selected[2],
                "attempt": int(selected[3]),
                "priority": int(target_priority),
            }

    def move_up(self, run_id: str) -> dict[str, int | str] | None:
        run_key = str(run_id or "").strip()
        if not run_key:
            return None
        min_priority, _ = self._priority_bounds()
        pending = self.list_pending(limit=max(1, get_settings().run_queue_max_size))
        for item in pending:
            if str(item.get("run_id", "")).strip() != run_key:
                continue
            current_priority = int(item.get("priority", get_settings().run_queue_default_priority))
            target_priority = max(min_priority, current_priority - 1)
            return self.set_priority(run_key, target_priority)
        return None

    def _enqueue_retry_or_dlq(self, run_id: str, attempt: int, error: str, priority: int) -> None:
        settings = get_settings()
        next_attempt = attempt + 1
        if next_attempt <= settings.run_queue_max_retries:
            time.sleep(max(0.0, settings.run_queue_retry_backoff_s))
            self.enqueue(run_id, next_attempt, priority=priority)
            return

        if self._backend() == "redis":
            try:
                self._get_redis_client().rpush(
                    settings.run_queue_redis_dlq_key,
                    json.dumps(
                        {
                            "run_id": run_id,
                            "attempt": attempt,
                            "priority": self._normalize_priority(priority),
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
                pending = sum(int(client.llen(key)) for key in self._redis_priority_keys())
                dlq_pending = int(client.llen(settings.run_queue_redis_dlq_key))
                live_workers = int(client.hlen(settings.run_queue_redis_workers_key))
            except Exception:
                pending = -1
                dlq_pending = -1
                live_workers = -1
            return QueueStats(
                pending=pending,
                dlq_pending=dlq_pending,
                workers=max(1, settings.run_worker_threads),
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
            if row.status in {"completed", "running", "interrupted"}:
                return False, f"already_{row.status}"
            return True, "ok"
        finally:
            db.close()

    def _process_one(self, run_id: str, attempt: int, priority: int) -> None:
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
                message=f"attempt={attempt} priority={priority}",
            )
            RunOrchestrator(db).execute_run(run_id)
        except Exception as exc:
            try:
                log_event(
                    db,
                    run_id=run_id,
                    event_type="queue_worker_failed",
                    step=99,
                    message=f"attempt={attempt} priority={priority} error={exc}",
                )
            except Exception:
                pass
            self._enqueue_retry_or_dlq(run_id, attempt, str(exc), priority=priority)
        finally:
            db.close()

    def _worker_loop(self) -> None:
        while True:
            priority, _, run_id, attempt = self._queue.get()
            try:
                self._process_one(run_id, attempt, priority)
            finally:
                self._queue.task_done()

    def run_redis_worker_forever(self) -> None:
        settings = get_settings()
        if self._backend() != "redis":
            raise RuntimeError("run_redis_worker_forever is only valid when run_queue_backend=redis")
        client = self._get_redis_client()
        priority_keys = self._redis_priority_keys()
        timeout_s = max(1, int(settings.run_queue_redis_block_s))
        while True:
            self._heartbeat()
            item = client.blpop(priority_keys, timeout=timeout_s)
            if not item:
                continue
            queue_key, payload = item
            try:
                run_id, attempt, payload_priority = self._deserialize_item(str(payload))
                priority = payload_priority
                key_str = str(queue_key)
                if ":p" in key_str:
                    try:
                        priority = self._normalize_priority(int(key_str.rsplit(":p", 1)[1]))
                    except Exception:
                        priority = payload_priority
                logger.info(
                    json.dumps(
                        {
                            "event": "run_dequeued",
                            "run_id": run_id,
                            "attempt": attempt,
                            "priority": priority,
                        },
                        sort_keys=True,
                    )
                )
                self._process_one(run_id, attempt, priority)
            except Exception as exc:
                logger.warning(
                    json.dumps(
                        {
                            "event": "run_dequeue_error",
                            "error": str(exc),
                        },
                        sort_keys=True,
                    )
                )
                continue


RUN_QUEUE = RunQueue()
