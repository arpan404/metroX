# MetroX - Project Progress Tracker

## Milestones
| Milestone | Goal | Status |
|---|---|---|
| M10 | V1.11 AFK-only runtime + detector/key/provider hardening + shadcn revamp | DONE |
| M11 | Finance demo revamp: test-agent dropdown + multi-turn target thread persistence | DONE |
| M12 | Session/profile/run history control + profile-scoped run reuse | DONE |

## M12 Feature Status
| Area | Feature | Status | Notes |
|---|---|---|---|
| API | `GET /v1/sessions` | DONE | Paginated list with optional owner filter |
| API | `GET /v1/config-profiles` | DONE | Session-scoped profile listing |
| API | `GET /v1/runs` | DONE | Session/profile filtered run history + `status_counts` |
| Frontend | Session/profile selector + run history | DONE | Config panel shows profile-scoped history with open/resume controls |
| Frontend | Launch mode control | DONE | Reuse existing profile or save new profile before run |
| Frontend | Backend persistence alignment | DONE | IDs persisted locally; history rehydrated from backend lists |
| Analytics | History to analytics linkage | DONE | Selecting run history entry binds active run and analytics panel context |
| Tests | API + UI contract coverage | DONE | Added list endpoint contract test and updated ConfigPanel tests |

## M11 Feature Status
| Area | Feature | Status | Notes |
|---|---|---|---|
| API | `GET /v1/test-agents/catalog` | DONE | Runtime API list with filesystem fallback |
| Config | `agent_id` support in target config | DONE | Backend resolves endpoint from selected test agent |
| Runtime | Agent HTTP unified payload + thread extraction | DONE | Sends `message/prompt/user_message/thread_id` |
| Orchestrator | Per-attack-type target thread persistence | DONE | Stored in `AFKRunState.checkpoint.target_thread_ids` |
| Orchestrator | Resume restores thread map | DONE | Falls back to prior checkpoints when needed |
| Agentic Generation | `chat_target_agent` tool | DONE | Target probing in generation flow with persisted thread continuity |
| Frontend | Config dropdown for test agents | DONE | Removed manual URL input, read-only resolved endpoint |
| Frontend | Payload simplification | DONE | Sends `agent_id`, threading strategy `per_attack_type` |
| Tests | API/runtime/orchestration/UI updates | DONE | Contract + adapter + run integration + ConfigPanel tests |

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
