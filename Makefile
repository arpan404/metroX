.PHONY: server-install server-test server-run client-install client-test client-build

server-install:
	cd apps/server && uv sync --dev

server-test:
	cd apps/server && uv run pytest -q

server-run:
	cd apps/server && uv run uvicorn app.main:app --reload

client-install:
	cd apps/client && npm install

client-test:
	cd apps/client && npm run test

client-build:
	cd apps/client && npm run build
