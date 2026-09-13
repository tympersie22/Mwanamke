#!/usr/bin/env bash
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
OUT="${MWANAMKE_SCAN_OUTPUT:-$ROOT/artifacts/security}"
mkdir -p "$OUT"
STATUS=0
npm audit --omit=dev --audit-level=high --json > "$OUT/npm-audit.json" || STATUS=1
npm sbom --sbom-format cyclonedx --omit=dev > "$OUT/sbom.cdx.json" || STATUS=1
if command -v gitleaks >/dev/null; then
  gitleaks dir "$ROOT" --config "$ROOT/scripts/release/gitleaks.toml" --redact --report-format json --report-path "$OUT/gitleaks.json" > "$OUT/gitleaks.log" 2>&1 || STATUS=1
else echo 'BLOCKED: gitleaks unavailable' > "$OUT/gitleaks.log"; STATUS=1; fi
if command -v semgrep >/dev/null; then
  semgrep scan --timeout 120 --config "$ROOT/scripts/release/semgrep.yml" --error --json --output "$OUT/semgrep.json" --exclude node_modules --exclude dist --exclude .next --exclude artifacts "$ROOT/apps" "$ROOT/packages" > "$OUT/semgrep.log" 2>&1 || STATUS=1
else echo 'BLOCKED: semgrep unavailable' > "$OUT/semgrep.log"; STATUS=1; fi
if command -v trivy >/dev/null; then
  trivy fs --scanners vuln,misconfig --severity HIGH,CRITICAL --exit-code 1 --format json --output "$OUT/trivy.json" "$ROOT" > "$OUT/trivy.log" 2>&1 || STATUS=1
else echo 'BLOCKED: trivy unavailable' > "$OUT/trivy.log"; STATUS=1; fi
printf '%s\n' "$STATUS" > "$OUT/exit-code.txt"
echo "Security evidence written to $OUT; exit $STATUS. Missing scanners are failures, not passes."
exit "$STATUS"
