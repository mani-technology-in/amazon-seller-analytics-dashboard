#!/usr/bin/env bash
# Everything that can run before a push, in one go, with one line per check: lint, unit and
# pipeline tests, parity, build, the browser smoke test in Chromium (desktop and phone) and
# Lighthouse on the local build (report only). Runs every check even when one fails, then
# shows the end of each failing check's log. CI still runs Firefox, WebKit, ZAP and Lighthouse
# on the deployed preview.
#
# Needs PostgreSQL (DATABASE_URL) and `make data`. Optional: PW_CHROMIUM / CHROME_PATH pointing
# at a Chromium binary when Playwright's own is not installed.
set -uo pipefail
cd "$(dirname "$0")/.."
logs="$(mktemp -d)"
failed=()

check() {
  local name="$1"; shift
  local log="$logs/${name// /-}.log"
  local start=$SECONDS
  if "$@" >"$log" 2>&1; then
    printf 'PASS  %-28s %3ss\n' "$name" $((SECONDS - start))
  else
    printf 'FAIL  %-28s %3ss  (%s)\n' "$name" $((SECONDS - start)) "$log"
    failed+=("$name")
  fi
}

check "lint and types" make lint
check "pipeline tests" bash -c 'cd pipeline && uv run pytest -q'
check "web tests (incl. parity)" bash -c 'cd pipeline && uv run python parity.py --out output/parity.json && cd ../web && npx vitest run'
check "build" make build
check "smoke (chromium, phone)" bash -c 'cd web && npx playwright test --project=chromium --project=android'

# Lighthouse on the local build: report only (the preview's figures in CI are the ones that count)
lighthouse() {
  cd web || return 1
  npx vite preview --port 4174 --strictPort >/dev/null 2>&1 &
  local server=$! status
  for _ in $(seq 20); do curl -s localhost:4174 >/dev/null && break; sleep 0.5; done
  local site=http://localhost:4174
  CHROME_PATH="${CHROME_PATH:-${PW_CHROMIUM:-}}" npx --yes @lhci/cli@0.15.1 collect --numberOfRuns=1 \
    --url="$site/" --url="$site/sales" --url="$site/inventory" \
    --url="$site/advertising" --url="$site/profit" --url="$site/reports" &&
    npx --yes @lhci/cli@0.15.1 upload --target=filesystem --outputDir=lhci &&
    LH_RUNS=1 node e2e/lighthouse-summary.mjs
  status=$?
  kill "$server" 2>/dev/null
  return $status
}
check "lighthouse (local, report)" lighthouse
# the figures, one line per page
grep -h '^::notice title=Lighthouse' "$logs"/lighthouse*.log 2>/dev/null |
  sed -E 's/^::notice title=Lighthouse ([^:]*)::median /        \1: /; s/ \(runs [^)]*\)//'

if [ ${#failed[@]} -gt 0 ]; then
  for name in "${failed[@]}"; do
    echo ""
    echo "== $name (last 20 lines)"
    tail -20 "$logs/${name// /-}.log"
  done
  exit 1
fi
echo "All local checks passed. CI adds Firefox, WebKit, ZAP and Lighthouse on the preview."
