# MetroX - Project Progress Tracker

## Milestones
| Milestone | Goal | Status |
|---|---|---|
| M10 | V1.11 AFK-only runtime + detector/key/provider hardening + shadcn revamp | DONE |

## V1.11 Feature Status
| Area | Feature | Status | Notes |
|---|---|---|---|
| Runtime | AFK-only managed runtime adapters | DONE | `managed_llm_runtime` + `managed_agent_runtime` |
| Runtime | Synthetic mode removal from write/UI | DONE | Legacy read normalization retained |
| API/Schema | Breaking enum rename | DONE | target/provider contracts updated |
| Detection | Vote-level artifacts (`detection_votes`) | DONE | New endpoint `/v1/runs/{id}/detector-votes` |
| Detection | Disagreement/uncertainty on final detections | DONE | Added to scoring/telemetry summaries |
| Security | Local DB key lifecycle tables | DONE | `secret_keys`, `secret_key_events` |
| Security | Key lifecycle APIs | DONE | create/list/activate/reencrypt/retire/events |
| Security | Fail-fast without active key | DONE | applied for credential encrypt/decrypt |
| Provider | Multi-probe validation hardening | DONE | `/models`, `/v1/models`, chat, health fallback |
| Provider | Capability confidence + error class | DONE | returned in validation response |
| Frontend | shadcn CLI component migration | DONE | generated primitives under `src/components/ui/*` |
| Frontend | Onboarding-first UX | DONE | first-run guide + persistent completion flag |
| Frontend | Config workbench + sticky launcher | DONE | replaces old linear step wizard |
| Frontend | Providers key lifecycle UI | DONE | key management + validation probes |
| Docs | plan/project/readme updates | DONE | breaking changes documented |
| Migration | Alembic V1.11 revision | DONE | `20260221_0003_v111_runtime_detector_keys.py` |

## Test Matrix
| Category | Status | Command |
|---|---|---|
| Backend tests | PASS | `cd apps/server && uv run pytest -q` |
| Frontend tests | PASS | `cd apps/client && npm test -- --run` |
| Frontend build | PASS | `cd apps/client && npm run build` |

## Residual Risks
| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| R-11-1 | AFK provider runtime differences across non-standard endpoints | Medium | keep probe diagnostics and capability caching |
| R-11-2 | Local key wrapping uses local master env secret (non-cloud KMS) | Medium | cloud KMS adapter planned next phase |
| R-11-3 | Bundle size warning in client build | Low | split monitor/analytics chunks in next pass |

## Next Recommended Phase
1. Move local key lifecycle to pluggable cloud KMS backend.
2. Add detector-judge live AFK model mode toggle with calibration report.
3. Add chunk splitting and route-level lazy loading for client performance.
