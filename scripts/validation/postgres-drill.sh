#!/usr/bin/env bash
# Disposable local migration/restore drill; never targets an existing database.
set -euo pipefail
cd "$(dirname "$0")/../.."
drill_container="mwanamke-drill-$(date +%s)-$$"
cleanup() { docker rm -f "$drill_container" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker run --detach --name "$drill_container" \
  -e POSTGRES_USER=drill -e POSTGRES_PASSWORD=local-drill-only \
  -e POSTGRES_DB=clean -p 127.0.0.1::5432 postgres:16-alpine >/dev/null
ready=false
for attempt in $(seq 1 60); do
  if docker exec "$drill_container" pg_isready -U drill -d clean >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
if [ "$ready" != true ]; then echo 'Disposable PostgreSQL failed readiness'; exit 1; fi
drill_port=$(docker port "$drill_container" 5432/tcp | awk -F: '{print $NF}')
export DATABASE_URL="postgresql://drill:local-drill-only@127.0.0.1:${drill_port}/clean"
export ALLOW_DESTRUCTIVE_TEST_DATABASE=true
npm run prisma:generate -w @mwanamke/api
npm run prisma:migrate -w @mwanamke/api
npm run test:integration -w @mwanamke/api

docker exec "$drill_container" createdb -U drill upgraded
export DATABASE_URL="postgresql://drill:local-drill-only@127.0.0.1:${drill_port}/upgraded"
for migration in 202609050001_init 202609050002_production_persistence; do
  docker exec -i "$drill_container" psql -v ON_ERROR_STOP=1 -U drill -d upgraded < "apps/api/prisma/migrations/$migration/migration.sql" >/dev/null
  npm exec -w @mwanamke/api -- prisma migrate resolve --applied "$migration"
done
npm run prisma:migrate -w @mwanamke/api
npm run test:integration -w @mwanamke/api

docker exec "$drill_container" createdb -U drill restored
docker exec "$drill_container" pg_dump -U drill -d upgraded -Fc | \
  docker exec -i "$drill_container" pg_restore -U drill -d restored --exit-on-error
# Compare complete logical table data, including ciphertext and audit/outbox state.
# Only digests are printed; the fixture database is never exported to the repository.
source_digest=$(docker exec "$drill_container" pg_dump -U drill -d upgraded --data-only --inserts --no-owner --no-privileges | sed '/^\\restrict /d; /^\\unrestrict /d' | shasum -a 256 | awk '{print $1}')
restored_digest=$(docker exec "$drill_container" pg_dump -U drill -d restored --data-only --inserts --no-owner --no-privileges | sed '/^\\restrict /d; /^\\unrestrict /d' | shasum -a 256 | awk '{print $1}')
if [ "$source_digest" != "$restored_digest" ]; then echo 'FAIL: restored logical data digest differs'; exit 1; fi
echo "PASS: clean migration, previous-schema upgrade, integration tests, and logical restore ($restored_digest)"
echo 'Scope: disposable local PostgreSQL with synthetic records; not production PITR or disaster-recovery approval.'
