# AutoRedTeam Server

FastAPI backend for AutoRedTeam V1.11.

## Runtime Contract (Breaking)
`target_type` write values:
- `managed_llm_runtime`
- `managed_agent_runtime`
- `http`
- `openai_compatible`
- `agent_http`

`provider_type` write values:
- `managed_llm_runtime`
- `openai_compatible`

Legacy (`synthetic`, `litellm`, `afk_agent`) are read-normalized only.

## Run (uv)
```bash
uv sync --dev
uv run uvicorn app.main:app --reload
```

## Migrations
```bash
uv run alembic upgrade head
```

## Security Key Bootstrap (Required)
Credentials require an active key:
```bash
curl -X POST http://localhost:8000/v1/security/keys \
  -H 'X-API-Key: local-dev-key' -H 'Content-Type: application/json' \
  -d '{"version":"v1","key_material":"dev-key-material","actor":"dev"}'
```

## Queue Backends
`AUTOREDTEAM_RUN_QUEUE_BACKEND`:
- `inprocess` (default)
- `redis` (external worker)

Run redis worker:
```bash
make server-worker
```
