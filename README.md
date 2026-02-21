# MetroX (V1.11)

Data-driven reliability testing platform for LLMs and agent systems.

## What Changed in V1.11
- AFK-only managed runtime paths for LLM/agent execution.
- Breaking enum rename for target/provider contracts.
- Synthetic mode removed from write path/UI.
- Detector vote artifacts + disagreement/uncertainty fusion outputs.
- Local DB key lifecycle APIs for credential encryption management.
- Hardened provider probe validation.
- Full shadcn-based onboarding/workbench UI revamp.

## Dev Commands
```bash
# both
make dev

# server only
make dev server

# client only
make dev client
```

## Tests
```bash
make server-test
make client-test
```

## Backend Stack
- FastAPI + SQLAlchemy + Alembic
- AFK runtime orchestration
- Postgres + Redis-ready queue path
- Python tooling via `uv`

## Frontend Stack
- Vite + React + TypeScript
- shadcn CLI components
- React Flow + Recharts
- system theme with `next-themes`

## Key API Additions
- `GET /v1/runs/{id}/detector-votes`
- `POST /v1/security/keys`
- `GET /v1/security/keys`
- `POST /v1/security/keys/{id}/activate`
- `POST /v1/security/keys/{id}/reencrypt-credentials`
- `POST /v1/security/keys/{id}/retire`
- `GET /v1/security/keys/events`

## Architecture Docs
- Backend core architecture (L3 Mermaid pack): `docs/backend-architecture.mdx`
