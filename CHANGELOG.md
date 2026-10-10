# Changelog

All notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [semantic versions](https://semver.org/).

## [Unreleased]

Version 1.1 (change request CR-1): a redesign to match the Amazon section of manitechnology.com, with Sales, Profit and Reports pages and six marketplaces.

### Security

- A **Security** check runs on every pull request: gitleaks (secrets), osv-scanner (dependencies), zizmor (workflows) and Semgrep (code).
- Security headers on every page: Content-Security-Policy (no inline scripts or styles, no framing), HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy. The browser smoke test runs under the same policy and fails on any violation.
- GitHub Actions are pinned to commit SHAs and moved to Node 24 versions; checkouts no longer keep credentials. Deploys use the pinned Wrangler command line instead of the Node 20 Cloudflare action (#11).
- Dependabot opens weekly update pull requests for npm, uv and GitHub Actions.
- Added SECURITY.md.

### Fixed

- Chart tooltips no longer use inline styles, which the new Content-Security-Policy would block.

## [1.0.0] - 2026-10-03

First release: Overview, Advertising, Products and Inventory pages over a year of synthetic Amazon-shaped data for one US marketplace, with every metric checked against SQL in CI.
