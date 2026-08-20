#!/usr/bin/env bash
# KinderFlow — one-command local development environment (KF-S0-OPS-002).
#
#   scripts/dev-setup.sh              bring the stack up and wait for health
#   scripts/dev-setup.sh --tools      also start pgAdmin
#   scripts/dev-setup.sh --reset      destroy volumes first, then rebuild
#   scripts/dev-setup.sh --down       stop the stack, keep the data
#
# Idempotent: running it twice in a row is safe and leaves a working stack.
set -euo pipefail

# --- shell sanity (D-19) ---------------------------------------------------
# Running this under sh/dash silently breaks arrays and [[ ]]. Fail loudly.
if [ -z "${BASH_VERSION:-}" ]; then
  echo "ERROR: this script needs bash, but is running under a different shell." >&2
  echo "       Run it as:  bash scripts/dev-setup.sh" >&2
  echo "       On Windows use Git Bash or WSL — not cmd.exe or PowerShell." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Run everything from the repository root and hand docker only RELATIVE paths.
# Under Git Bash on Windows, `pwd` yields /e/kinderFlow; docker.exe is a native
# binary and reads that as E:\e\kinderFlow unless MSYS path conversion rewrites
# it first. Depending on that rewrite makes the script fail for anyone with
# MSYS_NO_PATHCONV set. Relative paths are never rewritten, so they work the
# same under Git Bash, WSL, macOS, and Linux.
cd "$ROOT"

COMPOSE_FILE="infrastructure/compose/dev.yml"
ENV_FILE=".env"
ENV_EXAMPLE=".env.example"

# Services with a healthcheck that must go green before the stack is usable.
CORE_SERVICES=(postgres redis mailpit minio)

WITH_TOOLS=0
DO_RESET=0
DO_DOWN=0
for arg in "$@"; do
  case "$arg" in
    --tools) WITH_TOOLS=1 ;;
    --reset) DO_RESET=1 ;;
    --down) DO_DOWN=1 ;;
    -h | --help)
      sed -n '2,9p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "ERROR: unknown option '$arg'. Try --help." >&2
      exit 1
      ;;
  esac
done

log() { printf '\033[0;36m==>\033[0m %s\n' "$*"; }
ok() { printf '\033[0;32m  ok\033[0m %s\n' "$*"; }
die() {
  printf '\033[0;31mERROR:\033[0m %s\n' "$*" >&2
  exit 1
}

# --- preflight (D-19) ------------------------------------------------------
log "Checking prerequisites"

command -v docker >/dev/null 2>&1 ||
  die "docker not found on PATH. Install Docker Desktop (or Docker Engine) and reopen this shell."

docker compose version >/dev/null 2>&1 ||
  die "'docker compose' is unavailable. You may have the old standalone 'docker-compose'; this stack needs Compose v2 or newer."

docker info >/dev/null 2>&1 ||
  die "The Docker daemon is not responding. Start Docker Desktop (or 'sudo systemctl start docker') and try again."

command -v pnpm >/dev/null 2>&1 ||
  die "pnpm not found on PATH. Install it, or run 'corepack enable' — this repository pins pnpm via the packageManager field."

[ -f "$COMPOSE_FILE" ] || die "Compose file missing: $COMPOSE_FILE"
ok "docker, docker compose, and pnpm are available"

# --- .env ------------------------------------------------------------------
if [ ! -f "$ENV_FILE" ]; then
  [ -f "$ENV_EXAMPLE" ] || die ".env.example is missing; cannot create .env."
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  ok "Created .env from .env.example (dev-only fake values)"
else
  ok ".env already present — leaving it alone"
fi

# shellcheck disable=SC1090
set -a
. "$ENV_FILE"
set +a

compose() {
  local profile_args=()
  [ "$WITH_TOOLS" -eq 1 ] && profile_args=(--profile tools)
  # No --project-directory on purpose. Compose resolves relative bind-mount
  # paths (./postgres/init, ./pgadmin) against the project directory, which
  # defaults to the compose file's own directory. Overriding it to the repo
  # root silently pointed those mounts at paths that do not exist — Postgres
  # then logged "ignoring /docker-entrypoint-initdb.d/*" and started with no
  # roles. Leaving it unset also means the documented raw `docker compose`
  # command behaves identically to this script.
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "${profile_args[@]}" "$@"
}

# --- down / reset ----------------------------------------------------------
if [ "$DO_DOWN" -eq 1 ]; then
  log "Stopping the stack (data volumes kept)"
  compose down
  ok "Stopped. Data survives; run this script again to bring it back."
  exit 0
fi

if [ "$DO_RESET" -eq 1 ]; then
  log "Resetting: destroying containers AND data volumes"
  compose down -v
  ok "Volumes removed — Postgres will re-run its init script on next start"
fi

# --- up --------------------------------------------------------------------
# Translate a port clash into something actionable. Docker reports only
# "Bind for 0.0.0.0:6379 failed: port is already allocated", which does not
# tell you which variable to change — and on a machine already running another
# Postgres or Redis this is the single most likely failure (D-19).
explain_port_conflict() {
  local log_file="$1"
  local port var

  port="$(grep -oE 'Bind for [0-9.]+:[0-9]+' "$log_file" | grep -oE '[0-9]+$' | head -1)"
  [ -n "$port" ] || return 1

  case "$port" in
    "${KF_POSTGRES_PORT:-5432}") var=KF_POSTGRES_PORT ;;
    "${KF_REDIS_PORT:-6379}") var=KF_REDIS_PORT ;;
    "${KF_MAILPIT_SMTP_PORT:-1025}") var=KF_MAILPIT_SMTP_PORT ;;
    "${KF_MAILPIT_UI_PORT:-8025}") var=KF_MAILPIT_UI_PORT ;;
    "${KF_MINIO_API_PORT:-9000}") var=KF_MINIO_API_PORT ;;
    "${KF_MINIO_CONSOLE_PORT:-9001}") var=KF_MINIO_CONSOLE_PORT ;;
    "${KF_PGADMIN_PORT:-5050}") var=KF_PGADMIN_PORT ;;
    *) var="" ;;
  esac

  echo >&2
  echo "Port $port on this machine is already in use by something else." >&2
  if [ -n "$var" ]; then
    echo "Fix it by picking a free port in .env:" >&2
    echo >&2
    echo "    $var=1$port" >&2
    echo >&2
    echo "Then re-run this script. If host-run apps read a URL built from that" >&2
    echo "port (KF_DATABASE_URL, KF_REDIS_URL), update those in .env too —" >&2
    echo "nothing recomputes them for you." >&2
  else
    echo "It is not one of this stack's configurable ports; find the owner with:" >&2
    echo "    docker ps --format '{{.Names}}\\t{{.Ports}}'" >&2
  fi
  echo >&2
  echo "Containers still reach each other on the internal network by service" >&2
  echo "name, so changing a published port breaks nothing inside the stack." >&2
  return 0
}

log "Starting services (first run pulls images; that is the slow part)"
UP_LOG="$(mktemp)"
trap 'rm -f "$UP_LOG"' EXIT
if ! compose up -d 2>&1 | tee "$UP_LOG"; then
  explain_port_conflict "$UP_LOG" || true
  die "Failed to start the stack. See the output above."
fi

# --- wait for health -------------------------------------------------------
# Poll the healthchecks. Never sleep a fixed interval and hope.
wait_healthy() {
  local service="$1"
  local deadline=$((SECONDS + 600))
  local cid status

  while :; do
    cid="$(compose ps -q "$service" 2>/dev/null || true)"
    if [ -n "$cid" ]; then
      status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null || echo unknown)"
      case "$status" in
        healthy)
          ok "$service is healthy"
          return 0
          ;;
        none)
          ok "$service is running (no healthcheck defined)"
          return 0
          ;;
        unhealthy)
          echo
          echo "--- last 40 log lines for $service ---" >&2
          compose logs --tail 40 "$service" >&2 || true
          die "$service reported unhealthy. See the log above."
          ;;
      esac
    fi
    if [ "$SECONDS" -ge "$deadline" ]; then
      echo
      echo "--- last 40 log lines for $service ---" >&2
      compose logs --tail 40 "$service" >&2 || true
      die "Timed out after 10 minutes waiting for $service to become healthy."
    fi
    sleep 3
  done
}

log "Waiting for services to report healthy"
for service in "${CORE_SERVICES[@]}"; do
  wait_healthy "$service"
done
[ "$WITH_TOOLS" -eq 1 ] && wait_healthy pgadmin

# --- bucket bootstrap ------------------------------------------------------
# The one-shot container runs to completion; surface a non-zero exit rather
# than letting a silent bucket failure show up much later as an upload bug.
log "Verifying object storage bootstrap"
bootstrap_cid="$(compose ps -aq minio-bootstrap 2>/dev/null || true)"
if [ -n "$bootstrap_cid" ]; then
  bootstrap_rc="$(docker inspect --format '{{.State.ExitCode}}' "$bootstrap_cid" 2>/dev/null || echo 1)"
  if [ "$bootstrap_rc" != "0" ]; then
    compose logs minio-bootstrap >&2 || true
    die "MinIO bucket bootstrap exited with code $bootstrap_rc."
  fi
  ok "Buckets '${KF_S3_BUCKET_MEDIA:-kf-media}' and '${KF_S3_BUCKET_BACKUPS:-kf-backups}' are present"
else
  die "The minio-bootstrap container did not run."
fi

# --- summary ---------------------------------------------------------------
cat <<BANNER

  KinderFlow development stack is up.

  ALL CREDENTIALS BELOW ARE DEV-ONLY FAKES from .env.example.
  They grant nothing outside this machine. Staging and production read
  from the Coolify secret store only.

  PostgreSQL   postgresql://localhost:${KF_POSTGRES_PORT:-5432}/${KF_POSTGRES_DB:-kf_dev}
                 superuser   ${KF_POSTGRES_USER:-postgres} / ${KF_POSTGRES_PASSWORD:-}
                 app role    kf_api / ${KF_DB_API_PASSWORD:-}   (no BYPASSRLS, cannot DDL)
                 migrations  kf_migrator / ${KF_DB_MIGRATOR_PASSWORD:-}
  Redis        redis://localhost:${KF_REDIS_PORT:-6379}          (AOF enabled)
  Mailpit      http://localhost:${KF_MAILPIT_UI_PORT:-8025}       SMTP on ${KF_MAILPIT_SMTP_PORT:-1025}
  MinIO API    http://localhost:${KF_MINIO_API_PORT:-9000}
  MinIO console http://localhost:${KF_MINIO_CONSOLE_PORT:-9001}
                 ${KF_MINIO_ROOT_USER:-} / ${KF_MINIO_ROOT_PASSWORD:-}
BANNER

if [ "$WITH_TOOLS" -eq 1 ]; then
  cat <<BANNER
  pgAdmin      http://localhost:${KF_PGADMIN_PORT:-5050}
                 ${KF_PGADMIN_EMAIL:-} / ${KF_PGADMIN_PASSWORD:-}
BANNER
else
  echo "  pgAdmin      not started. Add --tools to include it."
fi

cat <<'BANNER'

  Apps run on the host, not in Docker, so they hot-reload (Sprint 0 Guide 2.1).

  Reset the data:  scripts/dev-setup.sh --reset
  Stop, keep data: scripts/dev-setup.sh --down

BANNER

# ===========================================================================
# HAND-OFF: database migration and seeding
#
# The Sprint 0 Guide describes this script as
#     compose up -> migrate -> seed tier-1 -> seed demo tenant -> print URLs
# The three middle steps are NOT implemented here, and their absence is
# deliberate rather than forgotten (KF-S0-OPS-002, decision D-17).
#
# Nothing exists to run yet: Prisma, the schema, migrations M-000/M-001 and the
# seed scripts all arrive with KF-S0-API-003, which is itself blocked on ADR-010
# from the TR-10 spike (KF-S0-RLS-001) — and that spike needs this stack. The
# ordering is a genuine dependency chain, not an oversight.
#
# Adding them here is tracked as KF-S0-OPS-002a, to be executed immediately
# after KF-S0-API-003 lands. That task appends, after the health wait:
#     pnpm --filter @kf/api exec prisma migrate deploy
#     pnpm --filter @kf/api run seed:tier1
#     pnpm --filter @kf/api run seed:demo-tenant
#
# This script deliberately does NOT stub those steps. A stub that prints
# "seeding..." and does nothing is worse than an absence: it makes a broken
# environment look healthy.
# ===========================================================================
