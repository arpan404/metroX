from __future__ import annotations

import queue
import threading
from dataclasses import dataclass

from app.config import get_settings
from app.db import SessionLocal


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

    def start(self) -> None:
        with self._lock:
            if self._started:
                return
            settings = get_settings()
            if not settings.run_queue_enabled:
                self._started = True
                return
            for idx in range(max(1, settings.run_worker_threads)):
                thread = threading.Thread(target=self._worker_loop, daemon=True, name=f"run-worker-{idx}")
                thread.start()
                self._workers.append(thread)
            self._started = True

    def enqueue(self, run_id: str) -> None:
        self.start()
        self._queue.put(run_id)

    def stats(self) -> QueueStats:
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


RUN_QUEUE = RunQueue()
