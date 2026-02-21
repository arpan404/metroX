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

## Feature Matrix
| Area | Feature | Status | Notes |
|---|---|---|---|
| Sessions | Create/get evaluation sessions | DONE | API implemented |
| Config Profiles | Create/get reusable configs | DONE | Snapshot-compatible |
| Runs | Launch and monitor runs | DONE | Background orchestration |
| Benchmark | Hybrid curated + generated | DONE | Versioned snapshot + dedupe hash |
| Benchmark | Multi-agent attack orchestration | DONE | Attacker/Critic/Verifier/Analyst roles with AFK-live or mock mode |
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
| Reports | Markdown run reports | DONE | API generation endpoint |
| Governance | AGENTS + project docs | DONE | Root docs created |

## Test Matrix
| Category | Status | Scope |
|---|---|---|
| Unit Tests | DONE | benchmark, scoring, drift |
| API Contract Tests | DONE | auth/session/profile/run contract checks |
| Integration Tests | DONE | full run lifecycle with synthetic target |
| Frontend Tests | DONE | wizard and analytics rendering |
| Load Tests | PLANNED | deep run >10k performance |

## Risks and Blockers
| ID | Risk | Severity | Status | Mitigation |
|---|---|---|---|---|
| R-01 | Large deep runs may stress single worker path | High | OPEN | Add queue worker pool + batching optimization |
| R-02 | Detector heuristics may have false positives | Medium | OPEN | Expand adjudication and calibration loops |
| R-03 | SSE monitor currently basic retry behavior | Medium | OPEN | Add resumable event cursors |
| R-04 | Multi-tenant auth not in V1 scope | Medium | ACCEPTED | Plan RBAC in V2 |

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
