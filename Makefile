.PHONY: server-install server-test server-run server-worker client-install client-test client-build dev dev-server dev-client server client

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
# - `make dev`         -> run server + client
# - `make dev server`  -> run only server
# - `make dev client`  -> run only client
dev:
	@if echo "$(MAKECMDGOALS)" | grep -qw "server"; then \
		$(MAKE) dev-server; \
	elif echo "$(MAKECMDGOALS)" | grep -qw "client"; then \
		$(MAKE) dev-client; \
	else \
		echo "Starting backend and frontend in developer mode..."; \
		( $(MAKE) dev-server ) & \
		( $(MAKE) dev-client ) & \
		wait; \
	fi

dev-server:
	cd apps/server && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

dev-client:
	cd apps/client && npm run dev

# Goal shims so `make dev server` / `make dev client` works without "No rule to make target".
server:
	@:

client:
	@:
