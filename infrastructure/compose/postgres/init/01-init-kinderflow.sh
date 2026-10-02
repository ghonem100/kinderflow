#!/usr/bin/env bash
# KF-S0-OPS-002 — PostgreSQL bootstrap for the development stack.
#
# Runs ONCE, on first initialization of an empty data volume, via the postgres
# image's docker-entrypoint-initdb.d hook. Re-running `dev-setup.sh` does not
# re-execute it; to force a rebuild use `scripts/dev-setup.sh --reset`.
#
# This file is deliberately thin. The M-000 statements it used to contain now
# live in `infrastructure/postgres/bootstrap.sql`, mounted here at
# /kf-bootstrap, so dev and production run the SAME SQL rather than two copies
# that drift (KF-S0-API-003). Dev mirrors the production trust model from day
# one (Sprint 0 Guide §2.1): kf_api has no BYPASSRLS and cannot create tables,
# so PostgreSQL RLS is a real backstop locally and not just in production
# (ADR-008). A spike or test that passes here means something.
set -euo pipefail

# The init hook runs as the superuser over the local socket; hand libpq the
# database and user the entrypoint set up so bootstrap.sh needs no special case.
export PGUSER="${POSTGRES_USER}"
export PGDATABASE="${POSTGRES_DB}"

exec /kf-bootstrap/bootstrap.sh
