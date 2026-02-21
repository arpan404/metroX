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
