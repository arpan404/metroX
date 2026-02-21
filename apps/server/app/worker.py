from __future__ import annotations

from app.services.run_queue import RUN_QUEUE


def main() -> None:
    RUN_QUEUE.run_redis_worker_forever()


if __name__ == "__main__":
    main()
