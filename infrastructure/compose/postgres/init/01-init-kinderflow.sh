#!/usr/bin/env bash
# KF-S0-OPS-002 — PostgreSQL bootstrap for the development stack.
#
# Runs ONCE, on first initialization of an empty data volume, via the postgres
# image's docker-entrypoint-initdb.d hook. Re-running `dev-setup.sh` does not
# re-execute it; to force a rebuild use `scripts/dev-setup.sh --reset`.
#
# Creates the M-000 extensions and the four least-privilege roles from
# Blueprint 4. Dev deliberately mirrors the production trust model from day one
# (Sprint 0 Guide 2.1): kf_api has no BYPASSRLS and cannot create tables, so
# PostgreSQL RLS is a real backstop locally and not just in production
# (ADR-008). A spike or test that passes here means something.
#
# Every statement is idempotent. See infrastructure/compose/README.md for why
# migration M-000 must be idempotent too.
set -euo pipefail

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set api_password="${KF_DB_API_PASSWORD:?KF_DB_API_PASSWORD is required}" \
  --set worker_password="${KF_DB_WORKER_PASSWORD:?KF_DB_WORKER_PASSWORD is required}" \
  --set migrator_password="${KF_DB_MIGRATOR_PASSWORD:?KF_DB_MIGRATOR_PASSWORD is required}" \
  --set audit_writer_password="${KF_DB_AUDIT_WRITER_PASSWORD:?KF_DB_AUDIT_WRITER_PASSWORD is required}" \
  <<-'EOSQL'
	-- ---------------------------------------------------------------
	-- Extensions (M-000)
	-- ---------------------------------------------------------------
	CREATE EXTENSION IF NOT EXISTS pgcrypto;
	CREATE EXTENSION IF NOT EXISTS pg_trgm;
	CREATE EXTENSION IF NOT EXISTS unaccent;
	CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

	-- ---------------------------------------------------------------
	-- Roles (M-000). NOBYPASSRLS is the default; it is stated
	-- explicitly because it is the whole point of ADR-008.
	-- ---------------------------------------------------------------
	DO $$
	BEGIN
	  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kf_api') THEN
	    CREATE ROLE kf_api LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
	  END IF;
	  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kf_worker') THEN
	    CREATE ROLE kf_worker LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
	  END IF;
	  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kf_migrator') THEN
	    CREATE ROLE kf_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
	  END IF;
	  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kf_audit_writer') THEN
	    CREATE ROLE kf_audit_writer LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
	  END IF;
	END
	$$;
EOSQL

# Passwords are applied separately so they never appear in the here-document
# above, which psql would otherwise echo on error.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOSQL
	ALTER ROLE kf_api           WITH PASSWORD '${KF_DB_API_PASSWORD}';
	ALTER ROLE kf_worker        WITH PASSWORD '${KF_DB_WORKER_PASSWORD}';
	ALTER ROLE kf_migrator      WITH PASSWORD '${KF_DB_MIGRATOR_PASSWORD}';
	ALTER ROLE kf_audit_writer  WITH PASSWORD '${KF_DB_AUDIT_WRITER_PASSWORD}';
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-'EOSQL'
	-- ---------------------------------------------------------------
	-- Schema privileges.
	--
	-- kf_migrator owns the schema and is the only role permitted to DDL.
	-- kf_api / kf_worker / kf_audit_writer get USAGE only: no CREATE, so
	-- they cannot define a table that quietly escapes an RLS policy.
	-- PostgreSQL 15+ already withholds CREATE on `public` from PUBLIC;
	-- the REVOKE is explicit so the intent survives a version change.
	-- ---------------------------------------------------------------
	REVOKE ALL ON SCHEMA public FROM PUBLIC;

	ALTER SCHEMA public OWNER TO kf_migrator;
	GRANT ALL ON SCHEMA public TO kf_migrator;

	GRANT USAGE ON SCHEMA public TO kf_api, kf_worker, kf_audit_writer;
	GRANT CONNECT ON DATABASE :"DBNAME" TO kf_api, kf_worker, kf_migrator, kf_audit_writer;

	-- Objects created later by kf_migrator are readable/writable by the
	-- runtime roles without a further grant per migration.
	ALTER DEFAULT PRIVILEGES FOR ROLE kf_migrator IN SCHEMA public
	  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kf_api, kf_worker;
	ALTER DEFAULT PRIVILEGES FOR ROLE kf_migrator IN SCHEMA public
	  GRANT USAGE, SELECT ON SEQUENCES TO kf_api, kf_worker;
	-- Append-only: the audit writer may INSERT and nothing else.
	ALTER DEFAULT PRIVILEGES FOR ROLE kf_migrator IN SCHEMA public
	  GRANT INSERT ON TABLES TO kf_audit_writer;
EOSQL

echo "KinderFlow: M-000 extensions and roles created (dev)."
