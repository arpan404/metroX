from __future__ import annotations

import json
import logging
import sys

from app.config import get_settings
from app.observability import configure_logging
from app.runtime.run_queue import RUN_QUEUE


logger = logging.getLogger("metrox.worker")


def main() -> None:
    configure_logging()
    settings = get_settings()
    backend = settings.run_queue_backend.strip().lower()
    logger.info(
        json.dumps(
            {
                "event": "worker_boot",
                "run_queue_enabled": settings.run_queue_enabled,
                "run_queue_backend": backend,
                "redis_url": settings.redis_url,
            },
            sort_keys=True,
        )
    )
    if not settings.run_queue_enabled:
        logger.info(
            "MetroX run queue is disabled (METROX_RUN_QUEUE_ENABLED=false); worker not started."
        )
        return

    if backend != "redis":
        logger.info(
            "MetroX run queue backend is not redis; no standalone worker is needed. "
            "For inprocess backend, workers run inside the API process started via `make server-run`/`make dev-server`. "
            "To use a standalone worker, set METROX_RUN_QUEUE_BACKEND=redis and configure METROX_REDIS_URL."
        )
        return

    try:
        logger.info(
            json.dumps(
                {
                    "event": "worker_started",
                    "queue_key": settings.run_queue_redis_key,
                    "dlq_key": settings.run_queue_redis_dlq_key,
                    "workers_key": settings.run_queue_redis_workers_key,
                    "block_s": settings.run_queue_redis_block_s,
                },
                sort_keys=True,
            )
        )
        RUN_QUEUE.run_redis_worker_forever()
    except KeyboardInterrupt:
        logger.info("Worker interrupted; exiting.")
        return
    except Exception as exc:
        logger.exception("Worker failed")
        raise


if __name__ == "__main__":
    sys.exit(main() or 0)
