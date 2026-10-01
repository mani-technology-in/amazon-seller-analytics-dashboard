# Amazon Seller Analytics Dashboard

A demo analytics dashboard for an Amazon seller, built by [Mani Technology](https://manitechnology.com). It brings sales, advertising (Sponsored Products, Sponsored Brands and Sponsored Display) and FBA inventory into one view, with metrics such as ACoS, TACoS and ROAS.

All data is synthetic. It is generated for a fictional brand ("Demo Brand") and shaped like real Amazon SP-API and Amazon Ads v3 reports, so a real connector could replace the generator later.

> **Status:** in development. The data generator and raw load are in place; the data models, export and dashboard pages arrive in the next pull requests. Live demo: demo.manitechnology.com (coming soon).

## How it works

```
Build time:  data generator (Python) → PostgreSQL 16 (raw → staging → marts) → JSON files
Run time:    Cloudflare Pages serves the JSON + a React app; the browser does the date-range maths
```

PostgreSQL only runs at build time, on your machine or in GitHub Actions. The live demo is static files, with no database or server.

## Repository layout

| Path | What it holds |
| --- | --- |
| `pipeline/` | Python project (uv): data generator, database load, SQL models, JSON export, pytest tests |
| `pipeline/generator/` | Synthetic data for the fictional Demo Brand, written as Amazon-shaped report files |
| `pipeline/load.py` | Loads the report files into the `raw` schema |
| `pipeline/sql/` | SQL scripts for the `raw`, `staging` and `marts` schemas |
| `web/` | React + TypeScript app (Vite, Tailwind CSS), Vitest tests |
| `docs/` | Metric definitions and project documentation |
| `.github/workflows/` | CI: lint, format check, type check, tests and build on every push and pull request |

## Run it locally

You need Docker, [uv](https://docs.astral.sh/uv/) and Node.js 22.

```bash
make install   # Python and web dependencies
make db        # start PostgreSQL 16 in Docker
make data      # generate a year of synthetic data and load it into PostgreSQL
make dev       # run the web app at http://localhost:5173
```

Other commands: `make test` (pytest and Vitest), `make lint` (ruff, ESLint, Prettier, TypeScript) and `make format`.

The pipeline reads `DATABASE_URL` (see `.env.example`); the default matches `docker-compose.yml`.

## Synthetic data

`make data` generates 12 months of daily data (1 Oct 2025 to 30 Sep 2026) for a fictional brand with 40 products in four categories and 18 ad campaigns. The same seed always produces byte-identical files.

| File | Shaped like |
| --- | --- |
| `sales_traffic/YYYY-MM-DD.json` | SP-API `GET_SALES_AND_TRAFFIC_REPORT` (daily, by child ASIN) |
| `fba_inventory/YYYY-MM-DD.tsv` | SP-API `GET_FBA_MYI_UNSUPPRESSED_INVENTORY_DATA` |
| `ads/spCampaigns.json.gz` and seven more | Amazon Ads v3 reports for Sponsored Products, Sponsored Brands and Sponsored Display (`timeUnit` DAILY, GZIP_JSON) |
| `products.json` | The product catalog |

The data includes a weekly pattern, a Q4 peak, a January dip, Prime Day and Black Friday spikes with deal prices, two product launches, three stockouts caused by late shipments, and a few keywords that spend without selling. Ads stop serving while a product is out of stock. Campaign, targeting and advertised-product reports add up to the same totals, and ad orders never exceed total orders.

Each file is loaded into the `raw` schema unchanged (one JSON record per row, with Amazon's own field names), so a real SP-API or Ads connector could load the same tables.

## Metrics

See [docs/metric-definitions.md](docs/metric-definitions.md).

## Licence

Copyright (c) 2026 Mani Technology. All rights reserved. The code is public to read, but no licence is granted to reuse it. See [LICENSE](LICENSE).
