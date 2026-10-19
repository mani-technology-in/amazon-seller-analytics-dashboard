# Changelog

All notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [semantic versions](https://semver.org/).

## [Unreleased]

Version 1.1 (change request CR-1): a redesign to match the Amazon section of manitechnology.com, with Sales, Profit and Reports pages and six marketplaces.

### Added

- Lighthouse CI on every preview (all six pages as a phone on slow 4G, median of 3 runs; LCP, CLS, accessibility and best-practices budgets fail the check, TBT warns) and an OWASP ZAP baseline scan that fails on any medium-risk alert. Both summarise their results on the run.
- Anonymous page views with PostHog EU (no cookies or storage, no session replay, no external scripts), off without the `POSTHOG_KEY` variable and in automated browsers.
- New README screenshots of all six pages.
- Profit page (FR-27 to FR-31): Revenue, Amazon fees, Ad spend, Product cost, Net profit and Net margin tiles; the revenue-to-profit chart, which builds left to right, each cost dropping out of revenue 110 ms apart and ending on the net-profit bar (the signature moment; off with Reduce motion; a loss shows below the baseline in red); product and marketplace profit tables with loss flags and a totals row. Product cost is labelled as entered by the seller wherever it shows.
- Reports page (FR-32): four ready-made reports for the current filters (sales by marketplace by day, product profit, inventory by network, campaign performance), each with its row count and a Download CSV button that confirms with a toast; and the exchange rates used. Money columns name their currency.
- The navigation now lists all six pages in the website's order.
- Advertising (FR-25, FR-26): Ad spend, Ad sales, ACoS, TACoS and ROAS tiles with change against the previous period; the ACoS and TACoS trend with a dashed target line (weekly beyond 60 days); the top 5 campaigns by spend; a Marketplace column in the campaign and keyword tables; and "No ads ran in …" for Canada, Mexico and France. Every figure follows the ad type and campaign filters.
- Inventory (FR-13, FR-14, FR-23, FR-24): stock on the last day of the chosen range, with Available units, Inbound units, Days of cover, Products low on stock and Products out of stock; a stock-over-time chart for one product and network, opening on the lowest cover, with the low-stock line and stock-out days shaded; the table lists every product in every fulfilment network, lowest cover first.
- New Overview page (FR-5 to FR-7, FR-20): Revenue (with a small trend line), Orders, Units sold and Days of cover; a revenue against ad spend chart (weekly beyond 60 days); units by marketplace as six small weekly charts; the top 5 products with their cover. Ad KPIs and the ACoS chart move to Advertising in PR 7.
- New Sales page (FR-11, FR-21, FR-22), replacing Products: six KPI tiles, revenue by marketplace, a marketplace table with share of revenue and change, and the product table, where each product opens its revenue by marketplace. Product pages move to `/sales/<ASIN>`; old `/products` links redirect, filters kept (FR-16).
- Marketplace and currency filters on every page (FR-17, FR-18): all marketplaces (default) or one, in US dollars or, for one marketplace, its own currency. Both are kept in the URL (`?mkt=UK&cur=local`), every amount shows its currency symbol, and money column headers name the currency.
- The Inventory table shows one row per product per fulfilment network, each network's stock set against the sales of the marketplaces it serves.
- Metrics for marketplaces, currency and profit (`web/src/metrics/marketplace.ts`, `currency.ts`, `profit.ts`): the marketplace filter, conversion to USD at each month's rate, shares of revenue, and product, marketplace and account profit with the revenue-to-profit steps. The parity check now compares every marketplace's share of revenue and every product's, marketplace's and the account's profit with SQL too (plus a one-day range where some products have ad spend and no sales).
- The data export covers all six marketplaces and adds `profit_daily.json`. From schema version 3 the daily files are split per marketplace (`mkt/<code>/`, inventory per fulfilment network in `net/<code>/`) with a small pre-totalled `overview_daily.json`, so a page downloads only the marketplaces a visitor picks: the Overview page's data for the US is about 230 KB compressed (budget 300 KB), and each data file for all six marketplaces at once stays under 2 MB. A selection layer (`web/src/data/selection.ts`) joins the chosen marketplaces and converts money to USD; the existing pages show the US marketplace in USD through it, so they are unchanged.
- Profit data: Amazon fees, refunds and refund administration fees shaped like the SP-API Finances API (`finances/<MKT>/`), the seller's product costs (`product_costs.csv`), new marts `fct_profit_daily` and `dim_product_cost`, and a SQL product-profit query (`pipeline/profit.py`) for the profit metrics to be checked against.
- New look, part 1: design tokens (`design/tokens.json`) shared by the stylesheet and the charts, Plus Jakarta Sans and JetBrains Mono bundled from npm (SIL OFL, served from the demo's own domain), a side navigation in the website's page order, a header with the "Synthetic demo data" label and a **Reduce motion** switch, and a short cross-fade between pages.
- New look, part 2: KPI tiles with gradient numbers, charts in the accent and violet series with mono labels, tables with mono numbers and "Download CSV" buttons, flags, filters and skeleton loading, all from the tokens. Tailwind's default colours are switched off and a test fails if a component hard-codes a colour.
- Synthetic data for six marketplaces (US, Canada, Mexico, UK, Germany, France) on five fulfilment networks, each in its own currency with Amazon's marketplace IDs. Mexico and France open during the year and ramp up; the UK and Germany run Sponsored Products ads; Germany and France share EU stock. Monthly exchange rates are included for converting to USD; the conversion arrives with the new screens.
- New marts `dim_marketplace` and `dim_fx_monthly`; every fact table has a `marketplace` (inventory: `network`) column.
- The US report files are byte-identical to 1.0.0, and the dashboard's export stays US-only until the new screens, so the live site does not change yet.

### Changed

- Every pull request, including Dependabot's and forks', now builds the site and runs the browser smoke tests in Chromium, Firefox and WebKit; only deploying needs the Cloudflare secrets (#41: a Dependabot update merged without a browser test). Smoke-test console errors name their source file and line, and Content-Security-Policy violations their rule, source and first characters.
- CI's deploy checks run as separate jobs side by side (smoke tests per browser, deployment, smoke test of the deployed site, Lighthouse, ZAP) and each runs to the end, with one **Deploy checks** job listing every result: one run now shows every problem, instead of one per run. Lighthouse fails only on figures that are stable between runs (CLS, accessibility, best practices); LCP is a warning, tracked weekly on the live demo. New `make preflight` (every local check, one line each) and `make ci PR=<number>` (a short digest of a CI run).

### Security

- The Content-Security-Policy allows style attributes (`style-src-attr 'unsafe-inline'`), which the charts use to size and place their elements; `<style>` blocks and outside stylesheets stay blocked. WebKit in Playwright 1.64 started refusing those writes on four pages, where Chromium and Firefox never did (#41, approved by SAM).

- A **Security** check runs on every pull request: gitleaks (secrets), osv-scanner (dependencies), zizmor (workflows) and Semgrep (code).
- Security headers on every page: Content-Security-Policy (no inline scripts or styles, no framing), HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy. The browser smoke test runs under the same policy and fails on any violation.
- GitHub Actions are pinned to commit SHAs and moved to Node 24 versions; checkouts no longer keep credentials. Deploys use the pinned Wrangler command line instead of the Node 20 Cloudflare action (#11).
- Dependabot opens weekly update pull requests for npm, uv and GitHub Actions.
- Added SECURITY.md.

### Fixed

- Faster first view on phones (Lighthouse, slow 4G): pages draw their tiles and charts from small pre-totalled files (`overview_daily.json`, now with sessions; new `profit_summary_daily.json` and `inventory_summary_daily.json`) before downloading the bigger files their tables need; the chart library loads on its own; the text font, the manifest and the overview file are preloaded; long tables draw their first 100 rows until "Show all". LCP on the Overview went from about 5.9 s to about 2.5 s.
- Firefox smoke tests sometimes timed out on a test's first page load (#26). CI traces showed the page loading fully in under 2 seconds while Firefox's page-ready signal never reached the test; an A/B run pinned it on the Cross-Origin-Opener-Policy header (3 failures in 136 runs with it, none in 136 without). The header is removed; it is not in the MT security header list. CI now keeps and summarises the traces of any failed smoke-test attempt.
- Browser tests no longer wait for the page's load event, which Firefox can hold for over 30 seconds while fonts and data arrive, and ignore font downloads cancelled by the test moving on (#26).
- Production deploys failed their last check since the Content-Security-Policy arrived: Cloudflare Web Analytics adds its beacon script to demo.manitechnology.com, and the policy blocked it. The policy now allows that one script and its reporting address.
- Chart tooltips no longer use inline styles, which the new Content-Security-Policy would block.

## [1.0.0] - 2026-10-03

First release: Overview, Advertising, Products and Inventory pages over a year of synthetic Amazon-shaped data for one US marketplace, with every metric checked against SQL in CI.
