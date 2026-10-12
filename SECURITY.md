# Security

This repository holds a public demo built by [Mani Technology](https://manitechnology.com). The live demo at https://demo.manitechnology.com is a static site: it has no logins, stores no personal data and shows only synthetic data for a fictional brand.

## Reporting a problem

Please email **support@manitechnology.com** with "Security" in the subject, or use GitHub's private vulnerability reporting ("Report a vulnerability" on the Security tab of this repository). Please do not open a public issue for a security problem.

Include what you found, the page or file involved and the steps to reproduce it. We reply within 3 working days and tell you what we will do and when.

## What we check on every change

- Secrets: gitleaks scans the full history.
- Dependencies: osv-scanner checks the web and Python lockfiles; Dependabot proposes updates weekly.
- Code: Semgrep (high-severity rules) and GitHub CodeQL.
- Workflows: zizmor checks the GitHub Actions setup; third-party actions are pinned to commit SHAs.
- Live site: security headers (Content-Security-Policy, HSTS, X-Content-Type-Options, Referrer-Policy, frame-ancestors) are checked on every preview and on the production domain.

## Supported versions

Only the latest version on `main`, which is what the live demo runs.
