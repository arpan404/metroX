# Plain-Language Advisory + Vulnerability Summary TODO

## Scope Decision
- Backend first, no UI changes in this phase.
- Keep existing analytics and graph workflows unchanged.
- Add narrative summary as additive APIs (no breaking changes).

## Backend API
- [ ] Add `GET /v1/runs/{run_id}/narrative-summary` (latest persisted narrative).
- [ ] Add `POST /v1/runs/{run_id}/narrative-summary` with `regenerate` query flag.
- [ ] Use response schema:
  - `run_id`
  - `generated_by`
  - `model`
  - `provider`
  - `executive_summary`
  - `non_technical_explanation`
  - `top_vulnerabilities[]`
  - `advisories[]`
  - `gate_reasons[]`

## Narrative Generation
- [ ] Aggregate run signals (scorecard, risk cards, attack/detection rollups).
- [ ] Build LLM prompt for non-technical stakeholders with strict JSON output.
- [ ] Parse response robustly (full JSON and embedded JSON extraction).
- [ ] Add deterministic fallback narrative when LLM output is invalid/unavailable.
- [ ] Persist generated payload in `ReportArtifact` (`kind=narrative_summary`) and JSON file under `reports/`.

## Data Quality + Guardrails
- [ ] Ensure values are evidence-based from run metrics (no hallucinated numbers).
- [ ] Clamp list sizes (`top_vulnerabilities`, `advisories`) for stable payload size.
- [ ] Validate payload keys/types before persistence and API return.
- [ ] Preserve backward compatibility with existing report endpoint.

## Tests
- [ ] Add API contract test: POST narrative summary returns valid schema.
- [ ] Add API contract test: GET narrative summary returns latest persisted payload.
- [ ] Add fallback test path (force invalid LLM output, assert fallback payload).
- [ ] Add run-not-found test for both endpoints.

## Docs
- [ ] Add endpoints to docs page (`/Users/arpanbhandari/Code/temp/metroX/apps/client/src/components/pages/DocsPage.tsx`).
- [ ] Update README API section with narrative summary workflow.
- [ ] Update `PROJECT_PROGRESS_TRACKER.md` with milestone + status.

## Deferred (Later)
- [x] Add Analytics panel section to render narrative summary and advisories.
- [x] Add regenerate button in UI with loading/error states.
- [x] Add export option (JSON download) for narrative brief.
- [x] Add share options (markdown/pdf) for narrative brief.
