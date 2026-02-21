# AutoRedTeam V1.11 Plan (Implemented)

## Locked Decisions
1. AFK-only runtime abstraction for managed LLM and managed agent targets.
2. Synthetic mode removed from write-path and UI selection.
3. Breaking enum rename applied.
4. Detector ensemble upgraded with vote artifacts and uncertainty/disagreement outputs.
5. Local DB-managed key lifecycle added (create/activate/reencrypt/retire + audits).
6. Provider validation hardened with multi-probe matrix and confidence output.
7. Frontend revamp migrated to shadcn CLI components with first-run onboarding and profile-first workbench.

## Breaking API/Schema Changes
- `target_type` write contract:
  - `managed_llm_runtime`
  - `managed_agent_runtime`
  - `http`
  - `openai_compatible`
  - `agent_http`
- `provider_type` write contract:
  - `managed_llm_runtime`
  - `openai_compatible`
- Removed from write path: `synthetic`, `litellm`, `afk_agent`.
- Legacy read normalization remains for historical rows.

## Implemented Backend Scope
- AFK managed runtime adapters:
  - `AFKLLMRuntimeAdapter`
  - `AFKManagedAgentRuntimeAdapter`
- Detector ensemble pipeline:
  - rule detector
  - retrieval consistency detector
  - AFK-contract judge detector
- Added `detection_votes` table and endpoint `GET /v1/runs/{id}/detector-votes`.
- Added `detections.disagreement_score` and `detections.uncertainty`.
- Added local key lifecycle tables:
  - `secret_keys`
  - `secret_key_events`
- Added key lifecycle APIs:
  - `POST /v1/security/keys`
  - `GET /v1/security/keys`
  - `POST /v1/security/keys/{id}/activate`
  - `POST /v1/security/keys/{id}/reencrypt-credentials`
  - `POST /v1/security/keys/{id}/retire`
  - `GET /v1/security/keys/events`
- Provider validation hardening:
  - probe flow (`/models`, `/v1/models`, chat probe, health fallback)
  - `probe_results[]`, `capability_confidence`, `model_discovery_mode`, `warnings[]`, normalized error class.

## Implemented Frontend Scope
- shadcn CLI components installed and used from `src/components/ui/*`.
- Replaced linear wizard with:
  - animated first-run onboarding
  - config workbench (single-page progressive setup)
  - sticky run launcher panel
  - automatic load of last profile context.
- Providers console updated for:
  - new provider enums
  - key lifecycle operations
  - provider probe diagnostics.
- Theme provider set to system-default (`next-themes`).

## Migration
- Added Alembic revision: `20260221_0003_v111_runtime_detector_keys.py`.
- Adds detection uncertainty fields, detector vote table, and security key lifecycle tables.

## Validation
- Backend tests: `uv run pytest -q` passing.
- Client tests: `npm test -- --run` passing.
- Client build: `npm run build` passing.
