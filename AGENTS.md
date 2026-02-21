# AGENTS.md - MetroX Development Rules

## Package Layout (V1.12)
Backend code lives under `apps/server/app/` in domain-oriented packages:

| Package | Purpose |
|---------|---------|
| `app/api/` | FastAPI router (`v1.py`), SSE/WebSocket streaming |
| `app/pipeline/` | `orchestrator.py`, `benchmark.py`, `costing.py`, `compare.py`, `mitigation.py`, `reporting.py` |
| `app/runtime/` | `adapters.py`, `policy.py`, `providers.py`, `run_queue.py` |
| `app/agents/` | `agentic_attacking.py`, `orchestration_profiles.py` |
| `app/stats/` | `detection.py`, `scoring.py`, `risk.py`, `features.py`, `clustering.py`, `drift.py`, `advanced_analytics.py` |
| `app/security/` | `service.py` (SecretCipher, key lifecycle) |
| `app/utils/` | `common.py` (log_event, bootstrap_ci, proportion_test, benjamini_hochberg) |
| `app/` (root) | `main.py`, `config.py`, `db.py`, `auth.py`, `models.py`, `schemas.py`, `observability.py`, `worker.py` |

- The old monolithic `app/services/` directory is removed. Do not create it.

## Runtime Policy (V1.12)
- Managed runtime calls must use AFK abstractions only.
- Default `runtime_provider` is `litellm`. Provider settings use `api_base` for litellm, `base_url` for openai.
- System prompts are merged via `_build_system_prompt`: base `instructions` + `extra_system_prompt` joined with double newline.
- `extra_context` is passed as Jinja2 template variables to AFK agents via the `context` kwarg.
- Credential resolution: `api_key_ref` in `target_config` is resolved from `ProviderCredential` at runtime, injected into `extra.api_key`.
- Config snapshot redaction: `auth_headers` with sensitive header names are replaced with `**REDACTED**` in persisted `ConfigSnapshot` rows.
- Supported target_type write values:
  - `managed_llm_runtime`
  - `managed_agent_runtime`
  - `http`
  - `openai_compatible`
  - `agent_http`
- Supported provider_type write values:
  - `managed_llm_runtime`
  - `openai_compatible`
- `synthetic`, `litellm`, and `afk_agent` are legacy read-compat values only.

## Queue Policy (V1.12)
- `RunQueue` supports `inprocess` and `redis` backends.
- Inprocess backend enforces `maxsize` backpressure via `queue.Queue(maxsize=...)` with non-blocking `put_nowait`.
- Redis backend supports retry with configurable `max_retries` and dead-letter queue (DLQ).
- Worker heartbeat is written to a Redis hash with TTL for liveness tracking.

## Security Policy (V1.12)
- Credential encryption/decryption must use DB-managed active key from `secret_keys`.
- Fail fast when no active key exists for encrypt/decrypt operations.
- Required lifecycle path:
  1. create key
  2. activate key
  3. re-encrypt credentials
  4. retire previous keys
- Every key action and credential decrypt access must be auditable via `SecretAccessAudit`.
- Credential resolution failures (missing credential, decrypt error) are logged as events and audited.

## Detector Policy (V1.12)
- Detection output must include detector-level votes (`detection_votes`).
- Final detections must include:
  - `confidence`
  - `disagreement_score`
  - `uncertainty`
- High disagreement/uncertainty cases should be adjudication candidates.

## Orchestration Policy (V1.12)
- Orchestration profiles define multi-agent attack coordination with roles, join policies, and execution order.
- `execution_order` must reference only defined role names with no duplicates.
- `graph` edges are validated for referential integrity and cycle-freedom (topological sort).
- Three tool policy profiles: `strict_readonly`, `balanced_eval`, `live_exploratory`.

## Frontend Policy (V1.12)
- Use shadcn CLI generated primitives only from `apps/client/src/components/ui/*`.
- Do not hand-roll clone versions of shadcn components.
- First-time UX must use onboarding flow; subsequent visits should auto-load last profile context.
- Theme defaults to system (`next-themes`), neutral minimal style.

## Engineering Baseline
- Python package/runtime commands must use `uv`.
- Preserve immutable config snapshots per run.
- Keep run telemetry and policy/tool events queryable.
- Update docs and tracker on any API/schema/UI breaking change.
- Tests run via `uv run python -m pytest tests/`. Live E2E tests require `METROX_ENABLE_LIVE_MODEL_TESTS=1`.
