# AutoRedTeam DS+ Plan: Robust LLM and Agent Reliability Science Platform

## Summary
AutoRedTeam V1/V1.5 will keep the three required pillars (benchmark dataset, scoring framework, robustness dashboard) and add a full data-science reliability stack:
1. Failure science and causal diagnostics
2. Predictive risk modeling
3. Continuous drift intelligence
4. Weak supervision + active adjudication
5. Advanced statistical inference
6. Counterfactual mitigation optimization

This remains frontend-first: users fully configure targets, scoring, and sessions from UI.

## Product Scope (Final)
1. Primary test unit is full agent contract, with LLM-only mode as subset.
2. Targets supported: plain LLM APIs, RAG systems, tool agents.
3. Users create multiple sessions and multiple saved configurations; each run binds to immutable config snapshot.
4. Run strictness is configurable per run and persisted.

## Core Pillars + Data Science Layers
1. Pillar A: Benchmark Dataset
- Hybrid curated + generated benchmark.
- Versioned benchmark snapshots.
- Coverage taxonomy: injection, jailbreak, hallucination, tool misuse, unsafe output.
- Dataset quality controls: semantic dedupe, novelty score, difficulty tagging, slice balancing.

2. Pillar B: Scoring Framework
- Deterministic rule engine with detector evidence.
- Probabilistic label fusion via weak supervision.
- Per-run configurable gates: hard caps + composite + regression checks.
- Advanced inference: bootstrap CIs, effect sizes, multiple-testing correction, power-aware sizing.

3. Pillar C: Robustness Dashboard
- Live run telemetry + post-run analytics.
- Raw metric tables and calibrated risk cards.
- Slice-aware comparisons and trend views.
- Low-confidence adjudication queue.

4. Layer D: Feature Store
- Versioned feature definitions and materialized feature tables.
- Feature families: prompt linguistics, retrieval signals, tool-call graph, policy events, runtime/cost/latency.
- Point-in-time consistent feature extraction per run.

5. Layer E: Failure Mode Discovery
- Embeddings + UMAP + HDBSCAN clustering.
- Topic extraction for failure cluster naming.
- Failure co-occurrence graph and centrality metrics.
- Driver analysis by slice (model, prompt family, context length, tool path).

6. Layer F: Predictive Risk Modeling
- Per-failure-type predictive models for pre-deployment risk.
- Calibration (isotonic/Platt) and uncertainty bands.
- Risk probabilities at target-level and slice-level.
- Explainability outputs (top feature drivers).

7. Layer G: Causal Mitigation Science
- Counterfactual/ablation engine for mitigation levers.
- Controlled variant experiment templates.
- Estimated uplift with confidence intervals.
- Ranked mitigation recommendations with expected impact and cost.

8. Layer H: Drift Intelligence
- Distribution shift monitoring across time/model versions.
- Drift tests: PSI/KS/KL-based signals by feature group.
- Change-point alerts tied to reliability metric shifts.
- Nightly live runs for drift validation.

## Frontend-First DX (Locked)
1. Guided 4-step wizard
- Step 1: target/API configuration
- Step 2: benchmark selection/slices
- Step 3: scoring/gate profile
- Step 4: run preset and budget/concurrency

2. Presets
- Quick, Standard, Deep

3. Session/config UX
- Save config profiles.
- Launch multiple sessions with different configs.
- Compare sessions and runs with full config lineage.

## Public API / Interface Additions
1. `POST /v1/sessions`, `GET /v1/sessions/{id}`
2. `POST /v1/config-profiles`, `GET /v1/config-profiles/{id}`
3. `POST /v1/runs`, `GET /v1/runs/{id}`, `GET /v1/runs/{id}/events`
4. `GET /v1/runs/{id}/scorecard`, `GET /v1/runs/{id}/risk-cards`
5. `GET /v1/runs/{id}/features`, `GET /v1/runs/{id}/clusters`
6. `GET /v1/runs/{id}/drift`
7. `POST /v1/adjudications`
8. `POST /v1/mitigation-experiments`, `GET /v1/mitigation-experiments/{id}`
9. `GET /v1/compare`

## Data Model Additions
1. `evaluation_sessions`, `config_profiles`, `config_snapshots`
2. `benchmark_snapshots`, `attack_cases`
3. `runs`, `executions`, `run_events`
4. `detections`, `probabilistic_labels`, `adjudications`
5. `feature_definitions`, `feature_values`
6. `cluster_memberships`, `cluster_summaries`
7. `risk_models`, `risk_predictions`, `calibration_reports`
8. `drift_signals`, `change_points`
9. `mitigation_experiments`, `mitigation_effects`, `recommendations`
10. `scorecards`, `comparisons`, `report_artifacts`

## CI and Evaluation Policy
1. Deterministic PR CI with fixed seeds/fixtures.
2. Nightly live runs against real models/tools.
3. CI fails on:
- hard cap breach
- composite threshold failure
- significant regression vs selected baseline
4. All run configs are immutable snapshots for reproducibility.

## Required Repo Docs to Create
1. `/Users/arpanbhandari/Code/temp/metroX/AGENTS.md`
- Development rules, safety policies, reproducibility rules, PR quality bar, CI gates.

2. `/Users/arpanbhandari/Code/temp/metroX/PROJECT_DESCRIPTION.md`
- Product spec, architecture, module definitions, user journeys, success metrics.

3. `/Users/arpanbhandari/Code/temp/metroX/PROJECT_PROGRESS_TRACKER.md`
- Milestones, feature status matrix, test matrix, risks/blockers, release checklist.

## Test Cases and Scenarios
1. Benchmark reproducibility with same seed and config snapshot.
2. Label fusion quality improves vs detector-only baseline.
3. Risk model calibration error stays within threshold.
4. Drift detector sensitivity/specificity on synthetic shift fixtures.
5. Causal mitigation engine returns stable uplift ranking on controlled datasets.
6. Multi-session isolation: configs/runs do not leak state.
7. Dashboard consistency: raw metrics and risk cards match backend aggregates.
8. CI gate behavior under threshold changes and baseline regressions.

## Assumptions and Defaults
1. Stack: FastAPI + AFK + Postgres + Redis + Vite React TS.
2. Data policy: store raw plus redacted views.
3. Auth: single-tenant API key in V1.
4. Scale: supports deep runs beyond 10k executions.
5. Default DS libraries: pandas/polars, scikit-learn, statsmodels, umap-learn, hdbscan, shap, networkx.
6. Human review only for low-confidence/disagreement cases (active adjudication queue).

---

## V1.6 AFK-Native Implementation Delta (Shipped Foundation)

### Backend APIs added
- `GET /v1/providers/capabilities`
- `POST /v1/providers/validate`
- `POST /v1/pricing-profiles`
- `GET /v1/pricing-profiles/{id}`
- `GET /v1/runs/{id}/cost-summary`
- `GET /v1/runs/{id}/cost-timeseries`
- `GET /v1/runs/{id}/policy-events`
- `POST /v1/runs/{id}/resume`
- `GET /v1/runs/{id}/inference`
- `GET /v1/runs/{id}/calibration`
- `GET /v1/runs/{id}/cooccurrence-graph`
- `GET /v1/runs/{id}/forecast`

### Data model extensions added
- `provider_credentials`, `pricing_profiles`, `model_pricing`
- `execution_costs`, `run_cost_aggregates`
- `afk_run_states`
- `statistical_tests`, `calibration_bins`
- `cooccurrence_edges`, `forecast_reports`
- Existing run/execution records extended with provider/model/cost gate fields.

### Runtime behavior added
- `litellm` target adapter path with normalized token usage.
- Hybrid cost engine with provenance (`provider`, `fallback`, `mixed`) and confidence.
- Run-loop cost accumulation and projected final cost updates.
- AFK run-state checkpoint records and resume endpoint scaffolding.
- Advanced DS artifact generation hooks (inference, cooccurrence graph, forecast).

### Frontend additions
- Wizard now supports provider metadata, provider validation, and pricing profile creation.
- Analytics view now loads cost, inference, calibration, cooccurrence, and forecast datasets.

### Next hardening steps
1. Replace envelope secret cipher with KMS-backed encryption and key rotation.
2. Implement true AFK checkpoint resume semantics (stateful continuation vs replay).
3. Add richer statistical inference math and multiple-testing correction workflow.
4. Upgrade graph/forecast panels from JSON payload render to charted visual components.

## V1.6.1 Delta (Current)

### AFK runtime and policy hardening
- AFK adapter now supports native `runner.resume(agent, run_id, thread_id)` path when resume metadata exists.
- Orchestrator persists `last_afk_run_id` in AFK run-state checkpoints and injects it on resume requests.
- Policy profile resolution is enforced at runtime (`strict_readonly`, `balanced_eval`, `live_exploratory`) and logged as auditable events.

### Provider credentials lifecycle
- Added encrypted credential APIs:
  - `POST /v1/providers/credentials`
  - `GET /v1/providers/credentials`
  - `GET /v1/providers/credentials/{id}`
  - `POST /v1/providers/credentials/{id}/rotate`
- Provider validation can now use either inline `api_key` or stored `credential_id`.

### Analytics and slicing
- Added `GET /v1/runs/{id}/execution-slices` for attack/provider/model-level breakdowns (count, latency, cost).
- Analytics UI now supports interactive attack/provider/model filtering with hover tooltip state.

### Performance and operations
- Added load test fixture for 10k execution-cost hot path (`pytest -m load`, env-gated).
- Added structured request logging with trace IDs and `GET /slo` runtime metrics endpoint.
