# AutoRedTeam DS+ - Project Description

## 1. Product Identity
AutoRedTeam DS+ is a robust, data-driven LLM and agent evaluation framework that behaves like **unit testing for AI systems**.

It evaluates not only final answers, but full agent contracts:
- behavioral outcomes
- tool usage
- policy compliance
- runtime budgets
- reliability drift across versions

## 2. Target Users
1. AI platform teams shipping LLM/agent systems
2. Applied ML and safety teams tracking regressions
3. Product teams that need easy, frontend-first configuration
4. CI owners enforcing release gates on AI quality

## 3. Core Product Goals
- Convert AI safety and reliability from anecdotal testing into measurable science.
- Make evaluation reproducible and CI-friendly.
- Provide actionable diagnostics and mitigation recommendations.

## 4. Primary Capabilities
### 4.1 Benchmark Dataset
- Hybrid curated + generated attack dataset
- Multi-agent attacker orchestration (Attacker, Critic, Verifier, Analyst)
- AFK-native orchestration controls:
  - join policies (`all_required`, `first_success`, `quorum`)
  - role-level model/instruction overrides
  - fail-safe budgets (cost, time, call limits)
  - runner backpressure and subagent concurrency
- Taxonomy coverage:
  - prompt injection
  - jailbreak
  - hallucination
  - tool misuse
  - unsafe output
- Dataset versioning, dedupe, novelty scoring, and slice tagging

### 4.2 Scoring Framework
- Deterministic detector-based labels
- Weak supervision fusion for probabilistic labels
- Advanced statistical inference:
  - bootstrap confidence intervals
  - effect sizes
  - multiple-testing correction
  - power-aware sizing
- Configurable hard caps + composite gate policy per run

### 4.3 Robustness Dashboard
- Guided 4-step setup wizard
- Live run telemetry stream
- Dual stream transport: SSE + WebSocket (fallback-safe)
- Post-run analytics:
  - raw metric tables
  - calibrated risk cards
  - cluster summaries
  - drift intelligence
- Compare baseline vs candidate runs
- Generate markdown reports
- Dedicated provider settings surface for credential lifecycle and provider validation
- Cost intelligence panels:
  - effective/provider/fallback spend
  - run cost burn and projected completion cost
- Node telemetry panel:
  - per-attack success/failure counters
  - average latency
  - cumulative attack-path cost
- Advanced DS analytics panels:
  - inference diagnostics (effect sizes + adjusted p-values)
  - calibration payloads
  - cooccurrence graph payloads
  - forecast payloads
  - interactive charts for cost trend and calibration reliability

## 5. Data Science Layers
1. Feature store with versioned definitions
2. Failure mode discovery (UMAP/HDBSCAN + topic summaries)
3. Predictive risk models with calibration and uncertainty
4. Drift detection via PSI/KS/KL and change-point alerts
5. Counterfactual/ablation mitigation analysis
6. Inference rigor layer (effect size, p-value adjustment, power/MDE)
7. Failure path graph layer (cooccurrence edges for failures/tools)
8. Forecast intelligence layer for reliability and cost trend projection

## 6. Architecture Overview
- Backend: FastAPI + SQLAlchemy + Postgres + Redis-ready worker model
- Frontend: Vite + React + TypeScript
- Orchestration: adapter-driven runtime with AFK-aligned evented execution model
- Persistence: run-centric relational artifacts with immutable snapshots
- Python tooling: `uv` for dependency management and execution
- Queue runtime:
  - `inprocess` worker threads for local/dev
  - `redis` external queue + dedicated worker process for production
  - retry/backoff, DLQ, and worker heartbeat telemetry in redis mode

## 7. API Surface (V1)
- Sessions and config profiles
- Run orchestration and event streaming
- AFK capability registry endpoint for orchestration tuning
- Provider and pricing APIs (`/v1/providers/*`, `/v1/pricing-profiles/*`)
- Provider credential lifecycle APIs (`create/list/get/rotate`) with encrypted secret persistence
- Provider credential audit API (`GET /v1/providers/credentials/{id}/audits`)
- Orchestration profile APIs (`create/list/get/update`)
- Orchestration profile validation and immutable lineage binding in config/run snapshots
- Scorecards, risk cards, features, clusters, drift
- Cost APIs (`/v1/runs/{id}/cost-summary`, `/v1/runs/{id}/cost-timeseries`)
- Slice analytics API (`/v1/runs/{id}/execution-slices`) for attack/provider/model diagnostics
- Advanced DS APIs (`/v1/runs/{id}/inference`, `/v1/runs/{id}/calibration`, `/v1/runs/{id}/cooccurrence-graph`, `/v1/runs/{id}/forecast`)
- Resume endpoint (`POST /v1/runs/{id}/resume`) with AFK run-state tracking
- Telemetry endpoint (`GET /v1/runs/{id}/telemetry`) for live event/cost counters
- Adjudication workflow
- Mitigation experiments and comparisons
- Report generation

## 8. Reliability and Reproducibility Model
- Fixed seeds for deterministic mode
- Immutable config snapshot per run
- Full run event audit trail
- Structured artifacts for every pipeline stage
- AFK-native resume continuity via persisted run/thread lineage and checkpoint metadata

## 9. Operations and SRE Hooks
- Structured JSON request logs with trace-id propagation
- `/slo` endpoint for API-level request/error/latency summaries
- Load-test harness for 10k execution-cost aggregation hot path
- Secret access audit trail for credential operations
- Queue-worker runtime path with `GET /v1/queue/stats` for deep-run operations visibility
- Credential rotation policy enforcement (`max-age`, `min-length`, versioned rotation)
- Optional KMS secret backend with strict mode fail-fast behavior
- Hot-path DB indexing and migration coverage for deep-run query routes
- Postgres 10k+ scale suite with endpoint latency SLO assertions and query-plan checks
## 10. Current Scope Boundary
- Single-tenant API key auth (V1)
- Raw + redacted data model
- Frontend-first UX for setup and analysis
- Synthetic target fallback for local validation

## 11. Success Metrics
1. Reproducible benchmark runs from saved configs
2. Statistically grounded scorecards and gates
3. Actionable risk and mitigation outputs
4. Detectable improvements after mitigation runs
5. Positive DX from frontend-only setup flow
