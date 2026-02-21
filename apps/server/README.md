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

Run redis worker:

```bash
make server-worker
```
