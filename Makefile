.PHONY: help install db db-down data parity dev test lint format

help:
	@echo "make install   Install Python and web dependencies"
	@echo "make db        Start PostgreSQL 16 in Docker"
	@echo "make data      Generate data, load PostgreSQL, build marts, export JSON for the web app"
	@echo "make parity    Check the web metrics against SQL (needs make data)"
	@echo "make dev       Run the web app locally"
	@echo "make test      Run pytest and Vitest"
	@echo "make lint      Run ruff, ESLint and Prettier checks"
	@echo "make format    Auto-format Python and web code"

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

test:
	cd pipeline && uv run pytest
	cd web && npm test

lint:
	cd pipeline && uv run ruff check . && uv run ruff format --check .
	cd web && npm run lint && npm run format:check && npm run typecheck

format:
	cd pipeline && uv run ruff check --fix . && uv run ruff format .
	cd web && npm run format
