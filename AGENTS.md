# AGENTS.md - AutoRedTeam Development Rules

## Mission
Build and maintain **AutoRedTeam DS+** as a reproducible, data-driven reliability evaluation framework for:
- LLM systems
- Agentic systems (reasoning + tools + policy + memory)

The product must function as **unit tests for AI behavior**, not as a prompt demo.

## Non-Negotiable Product Pillars
1. Benchmark dataset (versioned, reproducible, extensible)
2. Scoring framework (deterministic + probabilistic + statistical rigor)
3. Robustness dashboard (live + historical + slice-aware)

## Engineering Priorities
1. Reproducibility first
2. Data lineage and auditability
3. Safety and policy compliance
4. Frontend-first DX
5. Performance at scale (>10k executions for deep runs)

## Package Management
- Python dependency management and command execution must use `uv`.
- Use `uv sync --dev` for local backend setup.
- Use `uv run ...` for Python commands in scripts, docs, and CI.

## Repo Structure
- `apps/server`: FastAPI + orchestration + DS engine
- `apps/client`: Vite + React + TypeScript dashboard
- Root docs:
  - `AGENTS.md`
  - `PROJECT_DESCRIPTION.md`
  - `PROJECT_PROGRESS_TRACKER.md`

## Development Rules
- Preserve immutable run snapshots:
  - Every run must bind to a config snapshot.
  - Never mutate historical run config.
- Every pipeline stage must emit structured artifacts.
- Never ship features without tests for core failure modes.
- Do not add hidden heuristics that cannot be traced in data outputs.
- Keep API contracts backwards compatible.

## Safety and Security Rules
- API auth is mandatory (`X-API-Key` or approved equivalent).
- Raw data storage is allowed, but redacted views must be available.
- Treat tool-misuse and jailbreak regressions as release-blocking risks.
- Maintain explicit policy boundaries for mutating tool actions.

## Data Science Quality Bar
- Metrics must include confidence intervals where relevant.
- Comparison tests must include effect sizes and corrected p-values.
- Risk predictions must include uncertainty ranges.
- Drift reports must separate signal magnitude from statistical significance.
- Mitigation recommendations must include expected impact and implementation cost.

## Frontend and DX Rules
- Full run configuration must be possible from UI (no mandatory CLI edits).
- Guided wizard remains primary path for new users.
- Preserve quick/standard/deep presets.
- Show lineage: session -> config profile -> run -> report.

## Testing and CI Rules
- Deterministic PR CI with fixed seeds/fixtures.
- Nightly live evaluations for drift and real-model behavior.
- CI must fail on:
  - hard safety cap breach
  - composite score threshold breach
  - significant regression against selected baseline

## Pull Request Checklist
A PR is incomplete if it does not include:
1. Updated tests for new behavior
2. Documentation updates (if API/schema/UX changed)
3. Tracker status update in `PROJECT_PROGRESS_TRACKER.md`
4. Migration notes for changed persisted schema
5. Risk notes for safety-sensitive changes

## Definition of Done
A feature is complete only when:
- API contract exists and is documented
- Data artifacts are queryable and reproducible
- Dashboard renders the new outputs
- Tests pass
- Tracker reflects shipped status and residual risk
