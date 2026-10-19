.PHONY: help install db db-down data parity dev build smoke test lint format preflight ci

help:
	@echo "make install   Install Python and web dependencies"
	@echo "make db        Start PostgreSQL 16 in Docker"
	@echo "make data      Generate data, load PostgreSQL, build marts, export JSON for the web app"
	@echo "make parity    Check the web metrics against SQL (needs make data)"
	@echo "make dev       Run the web app locally"
	@echo "make smoke     Build the site and run the browser smoke test (needs make data)"
	@echo "make test      Run pytest and Vitest"
	@echo "make lint      Run ruff, ESLint and Prettier checks"
	@echo "make format    Auto-format Python and web code"
	@echo "make preflight Every check that runs locally, one line each (run before pushing)"
	@echo "make ci PR=n   A short digest of a pull request's CI run"

install:
	cd pipeline && uv sync
	cd web && npm ci

db:
	docker compose up -d --wait db

db-down:
	docker compose down

data:
	cd pipeline && uv run python -m generator --out output
	cd pipeline && uv run python load.py --src output
	cd pipeline && uv run python models.py
	cd pipeline && uv run python export.py

parity:
	cd pipeline && uv run python parity.py --out output/parity.json
	cd web && npx vitest run src/metrics/parity.test.ts

dev:
	cd web && npm run dev

build:
	cd web && npm run build

smoke: build
	cd web && npm run smoke

test:
	cd pipeline && uv run pytest
	cd web && npm test

lint:
	cd pipeline && uv run ruff check . && uv run ruff format --check .
	cd web && npm run lint && npm run format:check && npm run typecheck

format:
	cd pipeline && uv run ruff check --fix . && uv run ruff format .
	cd web && npm run format

preflight:
	scripts/preflight.sh

ci:
	scripts/ci-digest.sh $(PR)
