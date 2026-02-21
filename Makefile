.PHONY: server-install server-test client-install client-build

server-install:
	cd apps/server && python -m pip install -e .[dev]

server-test:
	cd apps/server && pytest -q

client-install:
	cd apps/client && npm install

client-build:
	cd apps/client && npm run build
