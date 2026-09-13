#!/usr/bin/env bash
# Restore a provider-managed encrypted PostgreSQL archive into an isolated target.
# The target must be disposable and separate from production; this script refuses a
# production-looking hostname and never runs against DATABASE_URL.
set -euo pipefail
if [[ -z "${BACKUP_ARTIFACT_PATH:-}" || -z "${RESTORE_DATABASE_URL:-}" ]]; then
  echo 'Set BACKUP_ARTIFACT_PATH and RESTORE_DATABASE_URL for an isolated restore target.' >&2
  exit 2
fi
if [[ "${RESTORE_DATABASE_URL}" == *"prod"* || "${RESTORE_DATABASE_URL}" == *"production"* ]]; then
  echo 'Refusing a production-looking restore target.' >&2
  exit 2
fi
if [[ ! -r "${BACKUP_ARTIFACT_PATH}" ]]; then echo 'Backup artifact is not readable.' >&2; exit 2; fi
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/mwanamke-restore.XXXXXX")"
cleanup() { rm -rf "$work_dir"; }
trap cleanup EXIT
sha256sum "${BACKUP_ARTIFACT_PATH}" | tee "$work_dir/source.sha256"
pg_restore --list "${BACKUP_ARTIFACT_PATH}" > "$work_dir/catalog.txt"
pg_restore --exit-on-error --no-owner --no-privileges --dbname="${RESTORE_DATABASE_URL}" "${BACKUP_ARTIFACT_PATH}"
restored_tables="$(psql "${RESTORE_DATABASE_URL}" -Atqc "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public'")"
audit_trigger="$(psql "${RESTORE_DATABASE_URL}" -Atqc "SELECT count(*) FROM pg_trigger WHERE tgname = 'audit_event_append_only'")"
if [[ "${restored_tables}" -lt 1 || "${audit_trigger}" -ne 1 ]]; then echo 'Restore verification failed: schema or audit append-only trigger missing.' >&2; exit 1; fi
echo "PASS: encrypted provider archive restored into isolated target; public tables=${restored_tables}; audit trigger=${audit_trigger}"
echo 'Record provider backup ID, KMS key ID, source/restore regions, restore timestamp, measured RPO/RTO and checksum in restricted release evidence.'
