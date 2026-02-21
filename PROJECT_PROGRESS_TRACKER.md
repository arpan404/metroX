# AutoRedTeam DS+ - Project Progress Tracker

## Legend
- `PLANNED`: scoped but not started
- `IN_PROGRESS`: actively being implemented
- `DONE`: implemented and integrated
- `BLOCKED`: cannot proceed due to dependency

## Milestones
| Milestone | Goal | Status |
|---|---|---|
| M0 | Repo bootstrap + core docs | DONE |
| M1 | Backend data model + API foundation | DONE |
| M2 | Benchmark + scoring + run orchestration | DONE |
| M3 | DS layers (features, clusters, risk, drift) | DONE |
| M4 | Frontend wizard + monitor + analytics | DONE |
| M5 | CI workflows + expanded test matrix | DONE |
| M6 | AFK-native runtime + provider/cost intelligence | IN_PROGRESS |
| M7 | Advanced DS math and graph/forecast analytics | IN_PROGRESS |
| M8 | Runtime hardening + observability + scale tests | IN_PROGRESS |

## Feature Matrix
| Area | Feature | Status | Notes |
|---|---|---|---|
| Sessions | Create/get evaluation sessions | DONE | API implemented |
| Config Profiles | Create/get reusable configs | DONE | Snapshot-compatible |
| Runs | Launch and monitor runs | DONE | Background orchestration |
| Benchmark | Hybrid curated + generated | DONE | Versioned snapshot + dedupe hash |
| Benchmark | Multi-agent attack orchestration | DONE | Attacker/Critic/Verifier/Analyst roles with AFK-live or mock mode |
| Benchmark | AFK configurable orchestration profile | DONE | Join policy, role overrides, fail-safe budgets, runner backpressure controls |
| Benchmark | AFK interaction fallback + routing strategy + threading controls | DONE | Schema/config updated with headless fallback defaults |
| Detection | Heuristic detectors + weak supervision | DONE | Extensible architecture |
| Scoring | Caps + composite + CI output | DONE | Regression checks supported |
| Feature Store | Materialized per-execution features | DONE | Versioned feature definitions |
| Clustering | Failure grouping and summaries | DONE | UMAP/HDBSCAN with fallback |
| Risk Models | Calibrated risk predictions | DONE | Logistic + uncertainty bands |
| Drift | PSI/KS/KL + change points | DONE | Baseline-linked |
| Mitigation | Experiment effects + recommendations | DONE | Ranked by impact/cost |
| Dashboard | Wizard (4-step) | DONE | Frontend-first config flow |
| Dashboard | Live run monitor | DONE | SSE stream support |
| Dashboard | Analytics views | DONE | Scorecards/risk/clusters/drift/compare |
| Provider Runtime | Provider validation API (synthetic/litellm/openai-compatible) | DONE | `/v1/providers/validate`, encrypted key ref creation |
| Provider Runtime | Credential CRUD + key rotation APIs | DONE | `/v1/providers/credentials*` |
| Pricing | Pricing profile API + model token rates | DONE | `/v1/pricing-profiles` CRUD (create/get) |
| Cost Intelligence | Execution + run cost persistence and summaries | DONE | Hybrid provenance (`provider`/`fallback`/`mixed`) |
| Cost Intelligence | Run cost timeseries and budget gate state | DONE | `/v1/runs/{id}/cost-timeseries` + gate payload |
| AFK Runtime | Run resume endpoint + AFK run-state records | DONE | `/v1/runs/{id}/resume` + `afk_run_states` |
| AFK Runtime | Native AFK resume path + run/thread lineage reuse | DONE | Adapter uses `runner.resume(...)` with persisted `last_afk_run_id` |
| Policy | Runtime policy profile enforcement + audit event emission | DONE | Policy profile resolved per run and enforced on tool decisions |
| DS Advanced | Inference payloads and calibration bins | DONE | `/v1/runs/{id}/inference` + `/calibration` |
| DS Advanced | Cooccurrence graph + forecast payload | DONE | `/v1/runs/{id}/cooccurrence-graph` + `/forecast` |
| Analytics | Execution slice API + filtered charted UI | DONE | `/v1/runs/{id}/execution-slices` + interactive filters |
| Reports | Markdown run reports | DONE | API generation endpoint |
| Governance | AGENTS + project docs | DONE | Root docs created |
| Observability | Trace ids + structured request logs + SLO endpoint | DONE | `X-Trace-Id` + `/slo` |

## Test Matrix
| Category | Status | Scope |
|---|---|---|
| Unit Tests | DONE | benchmark, scoring, drift |
| API Contract Tests | DONE | auth/session/profile/run + provider/pricing contracts |
| Integration Tests | DONE | full run lifecycle with synthetic target + cost/advanced endpoints |
| Frontend Tests | DONE | wizard and analytics rendering |
| Load Tests | IN_PROGRESS | 10k cost hot-path test added behind `AUTOREDTEAM_ENABLE_LOAD=1` |

## Risks and Blockers
| ID | Risk | Severity | Status | Mitigation |
|---|---|---|---|---|
| R-01 | Large deep runs may stress single worker path | High | OPEN | Add queue worker pool + batching optimization |
| R-02 | Detector heuristics may have false positives | Medium | OPEN | Expand adjudication and calibration loops |
| R-03 | SSE monitor currently basic retry behavior | Medium | OPEN | Add resumable event cursors |
| R-04 | Multi-tenant auth not in V1 scope | Medium | ACCEPTED | Plan RBAC in V2 |
| R-05 | Encryption implementation is single-tenant envelope baseline | Medium | OPEN | Replace with managed KMS in V2 |
| R-06 | OpenAI-compatible validation depends on provider `/models` behavior | Low | OPEN | Add tolerant fallback probing strategy |

## Release Readiness Checklist (V1)
- [x] Backend core APIs implemented
- [x] Frontend setup and analytics views implemented
- [x] Benchmark + scoring + risk + drift path implemented
- [x] Required governance docs present
- [x] Deterministic PR CI pipeline finalized
- [x] Nightly live evaluation workflow finalized
- [x] API and dashboard integration tests expanded

## Change Log
- 2026-02-21: Initial implementation of DS+ platform scaffold, backend API suite, DS modules, frontend wizard/monitor/analytics, and root governance docs.
- 2026-02-21: Migrated backend/CI to uv, added API contract + integration tests, added frontend vitest coverage, and finalized release-readiness checklist items.
- 2026-02-21: Enabled multi-agent attack orchestration in benchmark generation with role-based attacker pipeline and frontend controls.
- 2026-02-21: Upgraded AFK orchestration to configurable coordinator/subagent mode with join-policy, fail-safe, and runner control surface plus `/v1/afk/capabilities`.
- 2026-02-21: Added provider credential lifecycle + rotation APIs, AFK-native resume path, policy profile runtime enforcement, execution-slice analytics endpoint/UI filters, load-test scaffolding, and `/slo` observability endpoint with trace-id logging.
