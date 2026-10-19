#!/usr/bin/env bash
# A short digest of one CI run, read through the GitHub API (no log downloads needed):
# every check with its result, the first lines of each failure, and the Lighthouse and ZAP
# figures. Usage: scripts/ci-digest.sh <pull request number | commit SHA>
set -euo pipefail
repo="${GITHUB_REPOSITORY:-mani-technology-in/amazon-seller-analytics-dashboard}"
ref="${1:?pull request number or commit SHA}"
if [[ "$ref" =~ ^[0-9]+$ ]] && [ "${#ref}" -lt 7 ]; then
  ref="$(gh api "repos/$repo/pulls/$ref" --jq .head.sha)"
fi
runs="$(gh api "repos/$repo/commits/$ref/check-runs?per_page=100")"
pending="$(jq '[.check_runs[] | select(.status != "completed")] | length' <<<"$runs")"
echo "Commit ${ref:0:7}: $(jq '.check_runs | length' <<<"$runs") checks, $pending still running"
jq -r '.check_runs | sort_by(.name)[] | "  \(.conclusion // .status | ascii_upcase)\t\(.name)"' <<<"$runs"
for id in $(jq -r '.check_runs[] | select(.conclusion == "failure") | .id' <<<"$runs"); do
  name="$(jq -r --argjson id "$id" '.check_runs[] | select(.id == $id) | .name' <<<"$runs")"
  echo ""
  echo "== $name"
  gh api "repos/$repo/check-runs/$id/annotations?per_page=100" --jq '
    .[] | select(.annotation_level == "failure" and (.message | test("Process completed with exit code") | not))
    | "  - \(.title // .path): \(.message | split("\n") | map(select(test("\\S"))) | .[0:4] | join(" / ") | .[0:400])"' \
    | awk '!seen[$0]++' | head -12
done
# Figures worth seeing even when green
ids="$(jq -r '.check_runs[] | select(.name | test("Lighthouse|ZAP")) | .id' <<<"$runs")"
for id in $ids; do
  gh api "repos/$repo/check-runs/$id/annotations?per_page=100" --jq '
    .[] | select(.title // "" | test("Lighthouse|ZAP")) | "  \(.title): \(.message | .[0:200])"'
done
