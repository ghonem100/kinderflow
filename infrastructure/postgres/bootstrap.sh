#!/usr/bin/env bash
# KinderFlow — run the M-000 bootstrap against any environment.
#
# KF-S0-API-003. One runner, one SQL file, every environment. The dev compose
# init hook calls this; staging and production call it from an operator shell or
# a Coolify pre-deploy job (KF-S0-OPS-004 wires that). Nothing here is
# dev-specific, which is the point: a second copy of these statements for
# production is a copy that drifts.
#
# Must run as a SUPERUSER — see the header of bootstrap.sql for why M-000 cannot
# be a Prisma migration.
#
# Idempotent. Re-running is safe and is the supported way to repair drift, such
# as a role that acquired a privilege it should not have.
#
# Required environment:
#   PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE   standard libpq (superuser)
#   KF_DB_API_PASSWORD
#   KF_DB_WORKER_PASSWORD
#   KF_DB_MIGRATOR_PASSWORD
#   KF_DB_AUDIT_WRITER_PASSWORD
#
# Usage:
#   infrastructure/postgres/bootstrap.sh
#   PGHOST=db.internal PGUSER=postgres PGDATABASE=kinderflow \
#     infrastructure/postgres/bootstrap.sh
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

: "${KF_DB_API_PASSWORD:?KF_DB_API_PASSWORD is required}"
: "${KF_DB_WORKER_PASSWORD:?KF_DB_WORKER_PASSWORD is required}"
: "${KF_DB_MIGRATOR_PASSWORD:?KF_DB_MIGRATOR_PASSWORD is required}"
: "${KF_DB_AUDIT_WRITER_PASSWORD:?KF_DB_AUDIT_WRITER_PASSWORD is required}"

echo "KinderFlow bootstrap: applying M-000 to ${PGDATABASE:-$USER} …"

# Structure: extensions, roles, ownership, grants. No secrets.
psql -v ON_ERROR_STOP=1 --no-psqlrc --file "${here}/bootstrap.sql"

# Passwords are applied separately and read from the environment by psql itself,
# never interpolated into SQL text — psql echoes the failing statement on error,
# and a password in that output would land in CI logs.
PGOPTIONS='--client-min-messages=warning' psql -v ON_ERROR_STOP=1 --no-psqlrc \
  -v api_password="${KF_DB_API_PASSWORD}" \
  -v worker_password="${KF_DB_WORKER_PASSWORD}" \
  -v migrator_password="${KF_DB_MIGRATOR_PASSWORD}" \
  -v audit_writer_password="${KF_DB_AUDIT_WRITER_PASSWORD}" \
  <<-'EOSQL'
	ALTER ROLE kf_api          WITH PASSWORD :'api_password';
	ALTER ROLE kf_worker       WITH PASSWORD :'worker_password';
	ALTER ROLE kf_migrator     WITH PASSWORD :'migrator_password';
	ALTER ROLE kf_audit_writer WITH PASSWORD :'audit_writer_password';
EOSQL

echo "KinderFlow bootstrap: M-000 extensions, roles and grants are in place."
echo "Next: apply the migration chain as kf_migrator — it starts at M-001."
