# MetroX Operations Runbook

## Scope
Runtime triage for API incidents, failing CI gates, and evaluation-budget breaches.

## Quick Checks
1. Check API health:
   - `curl -s http://localhost:8000/health`
2. Check SLO snapshot:
   - `curl -s http://localhost:8000/slo | jq`
3. Correlate request failures with trace IDs:
   - Use `X-Trace-Id` from client response headers and search structured server logs.

## Gate Regression Triage
1. Identify failing run:
   - `GET /v1/runs/{id}`
   - `GET /v1/runs/{id}/scorecard`
2. Compare with baseline:
   - `GET /v1/compare?baseline_run_id=...&candidate_run_id=...`
3. Inspect diagnostics:
   - `GET /v1/runs/{id}/risk-cards`
   - `GET /v1/runs/{id}/execution-slices`
   - `GET /v1/runs/{id}/policy-events`

## Budget Breach Triage
1. Query cost state:
   - `GET /v1/runs/{id}/cost-summary`
   - `GET /v1/runs/{id}/cost-timeseries`
2. Confirm runtime config:
   - `GET /v1/config-profiles/{id}` and inspect `runtime_config.budget_usd`, `abort_on_cost_breach`.
3. If run was interrupted, resume once budget/profile is adjusted:
   - `POST /v1/runs/{id}/resume`

## AFK Resume Triage
1. Verify AFK lineage checkpoint state exists in `afk_run_states`.
2. Confirm run has stable `thread_id`.
3. Resume run:
   - `POST /v1/runs/{id}/resume`
4. Verify events:
   - `GET /v1/runs/{id}/policy-events` and run events stream.

## Provider Credential Rotation
1. Create credential:
   - `POST /v1/providers/credentials`
2. Rotate key:
   - `POST /v1/providers/credentials/{id}/rotate`
3. Validate provider with stored credential:
   - `POST /v1/providers/validate` using `credential_id`.

## Load Test Procedure
1. Enable load marker:
   - `METROX_ENABLE_LOAD=1`
2. Run:
   - `uv run --project apps/server pytest -m load`
3. Target:
   - 10k execution-cost aggregate hot path under threshold.
