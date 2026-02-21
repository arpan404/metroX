# AutoRedTeam Server

FastAPI backend for the AutoRedTeam DS+ reliability platform.

## Run

```bash
uv sync --dev
uv run uvicorn app.main:app --reload
```

Or from repo root:

```bash
make dev server
```

## Migrations (Alembic)

```bash
uv run alembic upgrade head
```

Optional startup migration mode:

```bash
AUTOREDTEAM_USE_MIGRATIONS=true uv run uvicorn app.main:app --reload
```

## Queue Backends

`AUTOREDTEAM_RUN_QUEUE_BACKEND` supports:
- `inprocess` (default): web process worker threads
- `redis`: external queue + dedicated worker process

Redis queue reliability knobs:
- `AUTOREDTEAM_RUN_QUEUE_MAX_RETRIES`
- `AUTOREDTEAM_RUN_QUEUE_RETRY_BACKOFF_S`
- `AUTOREDTEAM_RUN_QUEUE_REDIS_DLQ_KEY`
- `AUTOREDTEAM_RUN_QUEUE_WORKER_HEARTBEAT_TTL_S`

Run redis worker:

```bash
make server-worker
```
