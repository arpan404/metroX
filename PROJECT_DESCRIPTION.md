# AutoRedTeam DS+ - Project Description (V1.11)

## Product
AutoRedTeam is a data-driven reliability and safety test framework for LLM systems and full agent contracts.

## Core Identity
- Unit-test-like reliability gates for AI systems.
- Frontend-first configuration and execution.
- Reproducible run snapshots with statistical diagnostics.

## Runtime Architecture
- AFK-only managed runtime for LLM and agent execution paths.
- Managed target types:
  - `managed_llm_runtime`
  - `managed_agent_runtime`
- Additional transport types:
  - `http`
  - `openai_compatible`
  - `agent_http`
- Legacy runtime labels are normalized on read only.

## Data Science Stack
- Benchmark snapshots with attack taxonomy coverage.
- Detector ensemble with vote artifacts and fusion uncertainty.
- Feature extraction, clustering, risk models, calibration, drift, co-occurrence graph, forecasting.
- Scorecards with gates, confidence intervals, effect-size-aware regression checks.

## Security and Provider Hardening
- Local DB-managed encryption key lifecycle (`secret_keys`, `secret_key_events`).
- Encrypted provider credentials with auditable access trail.
- Hardened provider validation with multi-probe capability checks and confidence scoring.

## UI/UX
- First-run animated onboarding.
- Post-onboarding config workbench (single-page progressive flow).
- Sticky run launcher with readiness and gate context.
- Providers console for credentials, key lifecycle, and probe diagnostics.
- shadcn component system and neutral system-theme styling.

## Deliverables
- Versioned benchmark and execution datasets.
- Scoring framework with uncertainty-aware detection.
- Robustness dashboard + monitor + analytics.
- Report generation and comparison workflows.
