from __future__ import annotations

import sys

from app.config import get_settings
from app.runtime.run_queue import RUN_QUEUE


def main() -> None:
    settings = get_settings()
    backend = settings.run_queue_backend.strip().lower()
    if not settings.run_queue_enabled:
        print("MetroX run queue is disabled (METROX_RUN_QUEUE_ENABLED=false); worker not started.")
        return

    if backend != "redis":
        print(
            "MetroX run queue backend is not redis; no standalone worker is needed. "
            "For inprocess backend, workers run inside the API process started via `make server-run`/`make dev-server`. "
            "To use a standalone worker, set METROX_RUN_QUEUE_BACKEND=redis and configure METROX_REDIS_URL."
        )
        return

    try:
        RUN_QUEUE.run_redis_worker_forever()
    except KeyboardInterrupt:
        print("Worker interrupted; exiting.")
        return
    except Exception as exc:
        print(f"Worker failed: {exc}")
        raise


if __name__ == "__main__":
    sys.exit(main() or 0)
