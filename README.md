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

## Finance Demo Revamp (Current)
- Config panel now uses a demo-agent dropdown sourced from `GET /v1/test-agents/catalog`.
- Target selection is simplified to `agent_id` + name/description; manual target URL entry is removed from UI.
- Backend resolves `agent_id -> endpoint` automatically for `agent_http` profiles.
- Session/profile/run history is now backend-driven with list APIs and profile-scoped run history controls in UI.
- Launch flow supports both "reuse profile" and "save new profile + run" to support repeated profile runs.
- Run history cards can attach analytics context or resume interrupted/failed runs directly.
- Agent HTTP adapter now sends `message/prompt/user_message` and propagates `thread_id`.
- Run orchestration persists `target_thread_ids` with `per_attack_type` thread strategy for multi-turn probing continuity.
- Agentic attack generation includes target-chat probing via `chat_target_agent` tool when target URL is available.

## Stats Reliability + DS Analytics Revamp
- Added `GET /v1/runs/{id}/detector-votes-summary` for scoped detector aggregation by attack type.
- `GET /v1/runs/{id}/detector-votes` now includes `attack_type` on each vote row (backward compatible additive field).
- `GET /v1/runs/{id}/attack-summary` now exposes per-attack `avg_disagreement` and `avg_uncertainty`.
- `GET /v1/runs/{id}/node-telemetry` now includes alias fields:
  - `cost_usd` + `effective_cost_usd`
  - `policy_decisions` + `policy_events`
- Attack Detail panel now uses scoped detector summary + raw vote tab fallback.
- Analytics panel now includes a Data Science tab:
  - attack outcome distribution
  - detector fail-rate comparison
  - disagreement vs uncertainty scatter
  - latency vs effective-cost frontier

## Dev Commands
```bash
# backend + frontend + test-agents (+ queue worker for redis backend)
make dev

# backend only
make dev server
make dev backend

# frontend only
make dev client
make dev frontend

# test-agents only
make dev test-agents

# queue worker only (required for redis backend; no-op guidance for inprocess)
make dev worker
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
- `GET /v1/sessions`
- `GET /v1/config-profiles`
- `GET /v1/runs`
- `GET /v1/runs/{id}/detector-votes`
- `GET /v1/runs/{id}/detector-votes-summary`
- `POST /v1/security/keys`
- `GET /v1/security/keys`
- `POST /v1/security/keys/{id}/activate`
- `POST /v1/security/keys/{id}/reencrypt-credentials`
- `POST /v1/security/keys/{id}/retire`
- `GET /v1/security/keys/events`

## Architecture Docs
- Backend core architecture (L3 Mermaid pack): `docs/backend-architecture.mdx`
