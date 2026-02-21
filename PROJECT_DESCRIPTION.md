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
- Post-run analytics:
  - raw metric tables
  - calibrated risk cards
  - cluster summaries
  - drift intelligence
- Compare baseline vs candidate runs
- Generate markdown reports

## 5. Data Science Layers
1. Feature store with versioned definitions
2. Failure mode discovery (UMAP/HDBSCAN + topic summaries)
3. Predictive risk models with calibration and uncertainty
4. Drift detection via PSI/KS/KL and change-point alerts
5. Counterfactual/ablation mitigation analysis

## 6. Architecture Overview
- Backend: FastAPI + SQLAlchemy + Postgres + Redis-ready worker model
- Frontend: Vite + React + TypeScript
- Orchestration: adapter-driven runtime with AFK-aligned evented execution model
- Persistence: run-centric relational artifacts with immutable snapshots
- Python tooling: `uv` for dependency management and execution

## 7. API Surface (V1)
- Sessions and config profiles
- Run orchestration and event streaming
- Scorecards, risk cards, features, clusters, drift
- Adjudication workflow
- Mitigation experiments and comparisons
- Report generation

## 8. Reliability and Reproducibility Model
- Fixed seeds for deterministic mode
- Immutable config snapshot per run
- Full run event audit trail
- Structured artifacts for every pipeline stage

## 9. Current Scope Boundary
- Single-tenant API key auth (V1)
- Raw + redacted data model
- Frontend-first UX for setup and analysis
- Synthetic target fallback for local validation

## 10. Success Metrics
1. Reproducible benchmark runs from saved configs
2. Statistically grounded scorecards and gates
3. Actionable risk and mitigation outputs
4. Detectable improvements after mitigation runs
5. Positive DX from frontend-only setup flow
