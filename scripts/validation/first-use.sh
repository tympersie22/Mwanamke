#!/usr/bin/env bash
# Local synthetic OIDC + PostgreSQL + web protocol acceptance. No vendor calls.
set -euo pipefail
cd "$(dirname "$0")/../.."
validation_root="$PWD"
validation_container="mwanamke-first-use-$(date +%s)-$$"
validation_logs=$(mktemp -d)
validation_pids=()
cleanup() {
  for pid in "${validation_pids[@]:-}"; do [ -z "$pid" ] || kill "$pid" 2>/dev/null || true; done
  docker rm -f "$validation_container" >/dev/null 2>&1 || true
  rm -rf "$validation_logs"
}
trap cleanup EXIT
for validation_port in 3400 4200 4401; do
  if lsof -iTCP:"$validation_port" -sTCP:LISTEN -t >/dev/null 2>&1; then echo "Local test port $validation_port is occupied; stop its test service first."; exit 1; fi
done
docker run --detach --name "$validation_container" -e POSTGRES_USER=validation \
  -e POSTGRES_PASSWORD=synthetic-only -e POSTGRES_DB=validation -p 127.0.0.1::5432 postgres:16-alpine >/dev/null
for attempt in $(seq 1 60); do
  if docker exec "$validation_container" pg_isready -U validation >/dev/null 2>&1; then break; fi
  sleep 1
done
validation_port=$(docker port "$validation_container" 5432/tcp | awk -F: '{print $NF}')
export DATABASE_URL="postgresql://validation:synthetic-only@127.0.0.1:${validation_port}/validation"
npm run prisma:generate -w @mwanamke/api
npm run prisma:migrate -w @mwanamke/api
npm run test:integration -w @mwanamke/api

export NODE_ENV=development
node scripts/validation/oidc-issuer.mjs >"$validation_logs/issuer.log" 2>&1 & validation_pids+=("$!")
(
  cd apps/api
  export PORT=4200 HOST=127.0.0.1 APP_ORIGIN=http://127.0.0.1:3400 STATE_STORE=postgres
  export AUTH_MODE=oidc OIDC_ISSUER_URL=http://127.0.0.1:4401 OIDC_JWKS_URL=http://127.0.0.1:4401/jwks OIDC_AUDIENCE=mwanamke-api
  export IDENTITY_SUBJECT_HMAC_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= LOG_LEVEL=silent
  exec node --import tsx src/server.ts
) >"$validation_logs/api.log" 2>&1 & validation_pids+=("$!")
(
  cd apps/portal
  export PORTAL_SESSION_KEY=$(openssl rand -hex 32)
  export PORTAL_ORIGIN=http://127.0.0.1:3400 API_BASE_URL=http://127.0.0.1:4200
  export OIDC_ISSUER=http://127.0.0.1:4401 OIDC_CLIENT_ID=mwanamke-local-validation
  export OIDC_REDIRECT_URI=http://127.0.0.1:3400/auth/callback OIDC_ALLOW_INSECURE_LOCAL=true OIDC_AUDIENCE=mwanamke-api
  export OIDC_MOBILE_CLIENT_ID=mwanamke-local-validation-native OIDC_MOBILE_REDIRECT_URI=http://127.0.0.1:3400/native-callback
  exec node "$validation_root/node_modules/next/dist/bin/next" dev --port 3400
) >"$validation_logs/portal.log" 2>&1 & validation_pids+=("$!")
validation_ready=false
for attempt in $(seq 1 90); do
  if curl --silent --fail http://127.0.0.1:4200/ready >/dev/null && \
     curl --silent --fail http://127.0.0.1:4401/.well-known/openid-configuration >/dev/null && \
     [ "$(curl --silent --output /dev/null --write-out '%{http_code}' http://127.0.0.1:3400/api/care/me)" = 401 ]; then validation_ready=true; break; fi
  sleep 1
done
if [ "$validation_ready" != true ]; then echo 'Local test services did not become ready; no acceptance result.'; exit 1; fi
node scripts/validation/oidc-smoke.mjs
node scripts/validation/native-oidc-smoke.mjs
echo 'PASS: disposable first-use protocol harness; vendor, native-device, payment and full clinical journey gates remain separate.'
