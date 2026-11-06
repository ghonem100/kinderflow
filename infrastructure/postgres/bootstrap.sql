-- KinderFlow — database bootstrap (Blueprint §4 M-000).
--
-- KF-S0-API-003. This is PROVISIONING, not a migration, and that distinction is
-- forced by the project's own role model rather than chosen for convenience:
--
--   1. `kf_migrator` is NOCREATEROLE. Prisma migrations run as `kf_migrator`, so
--      a `CREATE ROLE` inside a migration is refused. Granting it CREATEROLE
--      would dismantle the least-privilege model ADR-008 and Sprint 0 Guide
--      §2.1 make load-bearing — it is what makes RLS a real backstop in dev
--      instead of a production-only claim.
--   2. `pg_stat_statements` needs superuser AND `shared_preload_libraries`, a
--      server-level setting that requires a restart. No migration can supply
--      either.
--   3. Extensions and roles are cluster/database furniture. They exist before
--      the first table and outlive every migration; versioning them in the
--      migration chain would mean replaying them on every fresh database and
--      never being able to change them.
--
-- The Prisma migration chain therefore starts at M-001. Founder decision,
-- 2026-09-06; registered as DISC-021, which also proposes the amendments to
-- Blueprint §4's M-000 row and to KF-S0-API-003's Requirement 1.
--
-- ---------------------------------------------------------------------------
-- RUN AS A SUPERUSER, ONCE PER DATABASE. Every statement is idempotent, so
-- re-running is safe and is the supported way to repair drift.
--
--   dev         automatically, by the compose init hook on an empty volume
--   staging     `infrastructure/postgres/bootstrap.sh` (KF-S0-OPS-004 wires it
--   production  as a Coolify pre-deploy job; until then an operator runs it)
--
-- Both paths execute THIS file. There is deliberately no second copy of these
-- statements for production to drift away from.
--
-- PREREQUISITE the SQL cannot satisfy itself: the server must already run with
--   shared_preload_libraries = 'pg_stat_statements'
-- If it does not, the CREATE EXTENSION below fails with PostgreSQL's own error
-- and this script aborts. That is intended — a silently skipped extension is a
-- monitoring gap nobody notices (Domain Part 9 makes it a weekly ritual).
--
-- Passwords are NOT set here. They are environment secrets, and keeping them
-- out means this file is safe to read, diff and commit. `bootstrap.sh` applies
-- them from the environment after running this.
--
-- PURE SQL, deliberately: no psql meta-commands anywhere, so psql, a `pg`
-- client and any migration runner can all execute it unchanged.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Extensions (M-000)
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- ---------------------------------------------------------------------------
-- UUIDv7 generator.
--
-- Domain Part 5.4: "UUIDv7 (time-ordered → index locality, offline-generable
-- for sync, non-enumerable) generated app-side; DB default fallback."
--
-- The fallback has to be v7 too. PostgreSQL 16 ships no v7 generator, and
-- defaulting to `gen_random_uuid()` would hand out v4 — which is not merely a
-- different version but loses the time ordering that Part 9's keyset pagination
-- and index-locality argument both rest on. A row that fell back would sort
-- wrong forever, silently. So the function is defined here rather than the
-- invariant being quietly broken.
--
-- It lives in provisioning, not in a migration, for the same reason the
-- extensions do: every migration from M-001 onward references it in a column
-- default, so it must exist before the first `CREATE TABLE`. That also keeps
-- Prisma's convention intact — generated DDL first, hand-written blocks below
-- it — instead of forcing one function definition above the generated section.
--
-- Depends on pgcrypto for `gen_random_bytes`, created above.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.uuid_generate_v7()
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  ts_ms bigint := (extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  bytes bytea;
BEGIN
  -- 48-bit big-endian millisecond timestamp, then 80 random bits.
  bytes := substring(int8send(ts_ms) FROM 3 FOR 6) || gen_random_bytes(10);
  -- Version 7 in the high nibble of octet 6.
  bytes := set_byte(bytes, 6, (get_byte(bytes, 6) & 15) | 112);
  -- RFC 4122 variant (10xx) in the high bits of octet 8.
  bytes := set_byte(bytes, 8, (get_byte(bytes, 8) & 63) | 128);
  RETURN encode(bytes, 'hex')::uuid;
END
$$;

-- ---------------------------------------------------------------------------
-- Roles (M-000). NOBYPASSRLS is PostgreSQL's default; it is stated explicitly
-- because it is the entire point of ADR-008 and a future reader must not have
-- to know the default to know the intent.
--
-- NOCREATEROLE on kf_migrator is what makes this file necessary. Do not relax
-- it to move M-000 back into the migration chain.
-- ---------------------------------------------------------------------------
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

-- Re-assert the attributes on every run. A role created by hand, or by an
-- earlier version of this file, must not keep a privilege it should not have —
-- and this is the only place that can take one back.
ALTER ROLE kf_api           NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
ALTER ROLE kf_worker        NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
ALTER ROLE kf_migrator      NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
ALTER ROLE kf_audit_writer  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

-- ---------------------------------------------------------------------------
-- Schema privileges.
--
-- kf_migrator owns the schema and is the only role permitted to DDL.
-- kf_api / kf_worker / kf_audit_writer get USAGE only: no CREATE, so they
-- cannot define a table that quietly escapes an RLS policy. PostgreSQL 15+
-- already withholds CREATE on `public` from PUBLIC; the REVOKE is explicit so
-- the intent survives a version change.
-- ---------------------------------------------------------------------------
REVOKE ALL ON SCHEMA public FROM PUBLIC;

ALTER SCHEMA public OWNER TO kf_migrator;
GRANT ALL ON SCHEMA public TO kf_migrator;

GRANT USAGE ON SCHEMA public TO kf_api, kf_worker, kf_audit_writer;

-- Database-level grants.
--
-- `GRANT ... ON DATABASE` needs an identifier, not an expression, so the name is
-- interpolated at run time. This keeps the file PURE SQL: no psql
-- meta-commands, no `:"DBNAME"` variable. That matters because the file is run
-- three ways — by psql from bootstrap.sh, by the compose init hook, and by the
-- integration test through a plain `pg` client, which cannot execute psql
-- syntax. One file that every client can run beats three that drift.
--
-- CONNECT for every role. CREATE for `kf_migrator` ONLY, and it is not
-- optional: `prisma migrate deploy` emits `CREATE SCHEMA IF NOT EXISTS
-- "public"`, and PostgreSQL checks CREATE on the DATABASE before the
-- IF NOT EXISTS short-circuits. Without it the very first deploy dies with
-- `42501 permission denied for database`, even though the schema already
-- exists and kf_migrator already owns it. Found by the integration suite
-- against a scratch database; it would otherwise have surfaced on the first
-- staging deploy, which is precisely what one shared bootstrap file is for.
--
-- Deliberately NOT `ALTER DATABASE ... OWNER TO kf_migrator`. Ownership also
-- confers DROP DATABASE and ALTER DATABASE — far wider than the need — and in
-- staging and production the hosting provider owns the database, so reassigning
-- it may be impossible. The minimal grant works in every environment. kf_api,
-- kf_worker and kf_audit_writer gain nothing here: kf_migrator remains the only
-- role that can DDL, which is the invariant ADR-008 rests on.
DO $$
BEGIN
  EXECUTE format(
    'GRANT CONNECT ON DATABASE %I TO kf_api, kf_worker, kf_migrator, kf_audit_writer',
    current_database()
  );
  EXECUTE format('GRANT CREATE ON DATABASE %I TO kf_migrator', current_database());
END
$$;

-- Objects created later by kf_migrator are readable/writable by the runtime
-- roles without a further grant per migration.
ALTER DEFAULT PRIVILEGES FOR ROLE kf_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kf_api, kf_worker;
ALTER DEFAULT PRIVILEGES FOR ROLE kf_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO kf_api, kf_worker;
-- Append-only: the audit writer may INSERT and nothing else.
ALTER DEFAULT PRIVILEGES FOR ROLE kf_migrator IN SCHEMA public
  GRANT INSERT ON TABLES TO kf_audit_writer;

-- Enum types are created by M-001 as kf_migrator; the runtime roles need USAGE
-- on them to read a column that uses one.
ALTER DEFAULT PRIVILEGES FOR ROLE kf_migrator IN SCHEMA public
  GRANT USAGE ON TYPES TO kf_api, kf_worker, kf_audit_writer;

-- The generator is owned by kf_migrator like everything else in the schema, so
-- a later migration can replace it without a superuser.
ALTER FUNCTION public.uuid_generate_v7() OWNER TO kf_migrator;
GRANT EXECUTE ON FUNCTION public.uuid_generate_v7() TO kf_api, kf_worker;
