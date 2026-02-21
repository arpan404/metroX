# AutoRedTeam DS+

AutoRedTeam DS+ is a data-driven LLM and agent reliability platform with:
- benchmark dataset generation
- statistical scoring framework
- robustness dashboard
- risk, drift, and mitigation analytics

## Stack
- Backend: FastAPI, SQLAlchemy, Postgres, Redis-ready worker path
- Frontend: Vite, React, TypeScript
- Data science: pandas, scikit-learn, statsmodels, umap-learn, hdbscan
- Python package manager/runtime: `uv`

## Quick Start

### 1. Start infra and apps

```bash
docker compose up --build
```

- Backend: `http://localhost:8000`
- Frontend: `http://localhost:5173`

### 2. Local backend only (uv)

```bash
cd apps/server
uv sync --dev
uv run uvicorn app.main:app --reload
```

### 3. Local frontend only

```bash
cd apps/client
npm install
npm run dev
```

### 4. Run tests

```bash
make server-test
make client-test
```

### 5. Developer mode

```bash
# both backend + frontend
make dev

# backend only
make dev server

# frontend only
make dev client
```

## Core API Endpoints
- `POST /v1/sessions`
- `POST /v1/config-profiles`
- `POST /v1/runs`
- `GET /v1/runs/{id}/events`
- `GET /v1/runs/{id}/scorecard`
- `GET /v1/runs/{id}/risk-cards`
- `GET /v1/runs/{id}/features`
- `GET /v1/runs/{id}/clusters`
- `GET /v1/runs/{id}/drift`
- `POST /v1/adjudications`
- `POST /v1/mitigation-experiments`
- `GET /v1/compare`
- `POST /v1/orchestration-profiles`
- `GET /v1/runs/{id}/telemetry`
- `GET /v1/providers/credentials/{id}/audits`

## Frontend Pages
- `/` Setup Wizard
- `/monitor` Live Monitor
- `/analytics` Analytics
- `/providers` Provider Credentials (create/list/rotate/validate)

## Required Docs
- `AGENTS.md`
- `PROJECT_DESCRIPTION.md`
- `PROJECT_PROGRESS_TRACKER.md`
