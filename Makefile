.PHONY: server-install server-test server-run server-worker client-install client-test client-build dev dev-server dev-client dev-backend dev-frontend dev-test-agents server client backend frontend test-agents test_agents

server-install:
	cd apps/server && uv sync --dev

server-test:
	cd apps/server && uv run pytest -q

server-run:
	cd apps/server && uv run uvicorn app.main:app --reload

server-worker:
	cd apps/server && uv run python -m app.worker

client-install:
	cd apps/client && npm install

client-test:
	cd apps/client && npm run test

client-build:
	cd apps/client && npm run build

# Developer mode selectors:
# - `make dev`                   -> run backend + frontend + test-agents
# - `make dev backend|server`    -> run only backend API
# - `make dev frontend|client`   -> run only frontend
# - `make dev test-agents`       -> run only test-agents runtime
dev:
	@if echo "$(MAKECMDGOALS)" | grep -Eqw "backend|server"; then \
		$(MAKE) dev-backend; \
	elif echo "$(MAKECMDGOALS)" | grep -Eqw "frontend|client"; then \
		$(MAKE) dev-frontend; \
	elif echo "$(MAKECMDGOALS)" | grep -Eqw "test-agents|test_agents"; then \
		$(MAKE) dev-test-agents; \
	else \
		echo "Starting backend, frontend, and test-agents in developer mode..."; \
		trap 'kill 0' INT TERM EXIT; \
		( $(MAKE) dev-backend ) & \
		( $(MAKE) dev-frontend ) & \
		( $(MAKE) dev-test-agents ) & \
		wait; \
	fi

dev-server:
	cd apps/server && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

dev-client:
	cd apps/client && npm run dev

dev-backend: dev-server

dev-frontend: dev-client

dev-test-agents:
	cd apps/test-agents && uv run uvicorn main:app --reload --host 127.0.0.1 --port 8001

# Goal shims so selector invocations work without "No rule to make target".
server:
	@:

client:
	@:

backend:
	@:

frontend:
	@:

test-agents:
	@:

test_agents:
	@:
