#!/usr/bin/env bash
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
mkdir -p "$ROOT/artifacts/security"
STATUS=0
# Version-pinned images; retain resolved immutable digests with release evidence.
docker run --rm -v "$ROOT:/src:ro" -v "$ROOT/artifacts/security:/reports" zricethezav/gitleaks:v8.24.3 dir /src --config /src/scripts/release/gitleaks.toml --gitleaks-ignore-path /src/scripts/release/gitleaks.ignore --redact --report-format json --report-path /reports/gitleaks.json > "$ROOT/artifacts/security/gitleaks.log" 2>&1 || STATUS=1
docker run --rm -v "$ROOT:/src:ro" -v "$ROOT/artifacts/security:/reports" semgrep/semgrep:1.136.0 semgrep scan --timeout 120 --config /src/scripts/release/semgrep.yml --error --json --output /reports/semgrep.json --exclude node_modules --exclude dist --exclude .next --exclude artifacts /src/apps /src/packages > "$ROOT/artifacts/security/semgrep.log" 2>&1 || STATUS=1
docker run --rm -v "$ROOT:/src:ro" -v "$ROOT/artifacts/security:/reports" semgrep/semgrep:1.136.0 semgrep scan --timeout 30 --config p/owasp-top-ten --error --json --output /reports/semgrep-owasp.json --exclude node_modules --exclude dist --exclude .next --exclude artifacts /src/apps /src/packages > "$ROOT/artifacts/security/semgrep-owasp.log" 2>&1 || STATUS=1
docker run --rm -v "$ROOT:/src:ro" -v "$ROOT/artifacts/security:/reports" aquasec/trivy:0.65.0 fs --scanners vuln,misconfig --severity HIGH,CRITICAL --exit-code 1 --skip-dirs "**/node_modules" --skip-dirs /src/apps/portal/.next --skip-dirs /src/artifacts --format json --output /reports/trivy.json /src > "$ROOT/artifacts/security/trivy.log" 2>&1 || STATUS=1
docker image inspect zricethezav/gitleaks:v8.24.3 semgrep/semgrep:1.136.0 aquasec/trivy:0.65.0 --format '{{json .RepoDigests}}' > "$ROOT/artifacts/security/scanner-digests.jsonl"
printf '%s\n' "$STATUS" > "$ROOT/artifacts/security/docker-exit-code.txt"
exit "$STATUS"
