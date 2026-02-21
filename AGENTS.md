# AGENTS.md - MetroX Development Rules

## Runtime Policy (V1.11)
- Managed runtime calls must use AFK abstractions only.
- Supported target write values:
  - `managed_llm_runtime`
  - `managed_agent_runtime`
  - `http`
  - `openai_compatible`
  - `agent_http`
- Supported provider write values:
  - `managed_llm_runtime`
  - `openai_compatible`
- `synthetic`, `litellm`, and `afk_agent` are legacy read-compat values only.

## Security Policy (V1.11)
- Credential encryption/decryption must use DB-managed active key from `secret_keys`.
- Fail fast when no active key exists for encrypt/decrypt operations.
- Required lifecycle path:
  1. create key
  2. activate key
  3. re-encrypt credentials
  4. retire previous keys
- Every key action and credential decrypt access must be auditable.

## Detector Policy (V1.11)
- Detection output must include detector-level votes (`detection_votes`).
- Final detections must include:
  - `confidence`
  - `disagreement_score`
  - `uncertainty`
- High disagreement/uncertainty cases should be adjudication candidates.

## Frontend Policy (V1.11)
- Use shadcn CLI generated primitives only from `apps/client/src/components/ui/*`.
- Do not hand-roll clone versions of shadcn components.
- First-time UX must use onboarding flow; subsequent visits should auto-load last profile context.
- Theme defaults to system (`next-themes`), neutral minimal style.

## Engineering Baseline
- Python package/runtime commands must use `uv`.
- Preserve immutable config snapshots per run.
- Keep run telemetry and policy/tool events queryable.
- Update docs and tracker on any API/schema/UI breaking change.
