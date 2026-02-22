.PHONY: server-install server-test server-run server-worker client-install client-test client-build dev dev-server dev-client dev-backend dev-frontend dev-test-agents dev-worker kill-port kill-dev-ports server client backend frontend worker test-agents test_agents

BACKEND_PORT ?= 8000
TEST_AGENTS_PORT ?= 8001
FRONTEND_PORT ?= 5173
BACKEND_HOST ?= 0.0.0.0
FRONTEND_HOST ?= 0.0.0.0
TEST_AGENTS_HOST ?= 0.0.0.0

server-install:
	cd apps/server && uv sync --dev

server-test:
	cd apps/server && uv run pytest -q

server-run:
	cd apps/server && uv run uvicorn app.main:app --reload --host $(BACKEND_HOST) --port $(BACKEND_PORT)

server-worker:
	cd apps/server && uv run python -m app.worker

client-install:
	cd apps/client && npm install

client-test:
	cd apps/client && npm run test

client-build:
	cd apps/client && npm run build

# Developer mode selectors:
# - `make dev`                   -> run backend + frontend + test-agents (+ queue worker for redis backend)
# - `make dev backend|server`    -> run only backend API
# - `make dev frontend|client`   -> run only frontend
# - `make dev test-agents`       -> run only test-agents runtime
# - `make dev worker`            -> run only queue worker
dev:
	@if echo "$(MAKECMDGOALS)" | grep -Eqw "backend|server"; then \
		$(MAKE) dev-backend; \
	elif echo "$(MAKECMDGOALS)" | grep -Eqw "frontend|client"; then \
		$(MAKE) dev-frontend; \
	elif echo "$(MAKECMDGOALS)" | grep -Eqw "test-agents|test_agents"; then \
		$(MAKE) dev-test-agents; \
	elif echo "$(MAKECMDGOALS)" | grep -Eqw "worker"; then \
		$(MAKE) dev-worker; \
	else \
		echo "Starting backend, frontend, test-agents, and queue worker in developer mode..."; \
		$(MAKE) --no-print-directory kill-dev-ports; \
		trap 'kill 0' INT TERM EXIT; \
		( $(MAKE) dev-backend ) & \
		( $(MAKE) dev-frontend ) & \
		( $(MAKE) dev-test-agents ) & \
		( $(MAKE) dev-worker ) & \
		wait; \
	fi

kill-port:
	@PORT="$(PORT)"; \
	if [ -z "$$PORT" ]; then \
		echo "PORT is required (example: make kill-port PORT=8000)"; \
		exit 1; \
	fi; \
	PIDS=""; \
	if command -v lsof >/dev/null 2>&1; then \
		PIDS="$$(lsof -tiTCP:$$PORT -sTCP:LISTEN || true)"; \
		if [ -z "$$PIDS" ]; then \
			PIDS="$$(lsof -ti :$$PORT || true)"; \
		fi; \
	elif command -v fuser >/dev/null 2>&1; then \
		PIDS="$$(fuser -n tcp $$PORT 2>/dev/null || true)"; \
	fi; \
	if [ -z "$$PIDS" ]; then \
		echo "Port $$PORT is free"; \
		exit 0; \
	fi; \
	echo "Freeing port $$PORT (pids: $$PIDS)"; \
	kill $$PIDS >/dev/null 2>&1 || true; \
	sleep 1; \
	if command -v lsof >/dev/null 2>&1; then \
		REMAINING="$$(lsof -tiTCP:$$PORT -sTCP:LISTEN || true)"; \
		if [ -z "$$REMAINING" ]; then \
			REMAINING="$$(lsof -ti :$$PORT || true)"; \
		fi; \
		if [ -n "$$REMAINING" ]; then \
			echo "Force killing remaining pids on $$PORT: $$REMAINING"; \
			kill -9 $$REMAINING >/dev/null 2>&1 || true; \
		fi; \
	fi

kill-dev-ports:
	@$(MAKE) --no-print-directory kill-port PORT=$(BACKEND_PORT)
	@$(MAKE) --no-print-directory kill-port PORT=$(FRONTEND_PORT)
	@$(MAKE) --no-print-directory kill-port PORT=$(TEST_AGENTS_PORT)

dev-server:
	@$(MAKE) --no-print-directory kill-port PORT=$(BACKEND_PORT)
	cd apps/server && uv run uvicorn app.main:app --reload --host $(BACKEND_HOST) --port $(BACKEND_PORT)

dev-client:
	@$(MAKE) --no-print-directory kill-port PORT=$(FRONTEND_PORT)
	cd apps/client && npm run dev -- --host $(FRONTEND_HOST) --port $(FRONTEND_PORT)

dev-backend: dev-server

dev-frontend: dev-client

dev-test-agents:
	@$(MAKE) --no-print-directory kill-port PORT=$(TEST_AGENTS_PORT)
	cd apps/test-agents && uv run uvicorn main:app --reload --host $(TEST_AGENTS_HOST) --port $(TEST_AGENTS_PORT)

dev-worker:
	@if command -v pkill >/dev/null 2>&1; then \
		pkill -f "python -m app.worker" >/dev/null 2>&1 || true; \
		pkill -f "uv run python -m app.worker" >/dev/null 2>&1 || true; \
	fi
	cd apps/server && uv run python -m app.worker

# Goal shims so selector invocations work without "No rule to make target".
server:
	@:

client:
	@:

backend:
	@:

frontend:
	@:

worker:
	@:

test-agents:
	@:

test_agents:
	@:
