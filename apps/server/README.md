# MetroX Server

FastAPI backend for MetroX V1.11.

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
`METROX_RUN_QUEUE_BACKEND`:
- `inprocess` (default)
- `redis` (external worker)

Run redis worker:
```bash
make server-worker
```

## Backend Test Matrix
Deterministic suite:
```bash
uv run pytest -q
```

Live Ollama suite (AFK managed runtime + managed agent runtime):
```bash
export METROX_ENABLE_LIVE_MODEL_TESTS=1
export METROX_LIVE_OLLAMA_BASE_URL=http://localhost:11434
export METROX_LIVE_OPENAI_COMPAT_BASE_URL=http://localhost:11434/v1
export METROX_LIVE_MANAGED_MODEL=ollama_chat/gpt-oss:20b
export METROX_LIVE_OPENAI_MODEL=gpt-oss:20b
export METROX_LIVE_API_KEY=ollama
uv run pytest -q -m live_model
```

Nightly live suite:
```bash
uv run pytest -q -m nightly_live_model
```
