# infrastructure/compose/

The local development stack (KF-S0-OPS-002). Backing services only — the API, worker, and web app run on the host so they hot-reload (Sprint 0 Guide §2.1).

## Use it

```bash
scripts/dev-setup.sh            # up, wait for health, print URLs and credentials
scripts/dev-setup.sh --tools    # also start pgAdmin
scripts/dev-setup.sh --reset    # destroy data volumes, rebuild from scratch
scripts/dev-setup.sh --down     # stop, keep data
```

The script is the supported entry point: it checks prerequisites, creates `.env` from `.env.example` on first run, waits for real healthchecks instead of sleeping, and fails with an actionable message rather than a cryptic one.

## Services

| Service  | Port(s)                | Notes                                                                         |
| -------- | ---------------------- | ----------------------------------------------------------------------------- |
| postgres | 5432                   | `kf_dev` database, M-000 extensions and roles, `pg_stat_statements` preloaded |
| redis    | 6379                   | AOF on, so queued jobs survive a restart                                      |
| mailpit  | 8025 UI, 1025 SMTP     | Captures all dev email; nothing leaves the machine                            |
| minio    | 9000 API, 9001 console | Buckets `kf-media` and `kf-backups` created on boot                           |
| pgadmin  | 5050                   | **Only** with `--profile tools` / `--tools`                                   |

Every port is overridable from `.env`. See "Port collisions" below — you will hit one.

> **Anything automated must pass the port, not assume it.** `KF_POSTGRES_PORT` defaults to 5432 in `.env.example` and is commonly remapped — this machine uses 15432. `apps/api`'s integration suite falls back to 5432 when nothing is set, so **`KF-S0-CI-001` must set `KF_POSTGRES_PORT` explicitly** for its postgres service rather than inheriting that fallback. A wrong port fails the job with a message about reaching the database, which reads like a broken test rather than a misconfigured runner.

## The database trust model

Dev mirrors production from day one (Sprint 0 Guide §2.1). The init script creates the four M-000 roles from Blueprint §4:

| Role              | Rights                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| `kf_api`          | Runtime. **No BYPASSRLS**, no CREATE on `public`. Cannot define a table that escapes an RLS policy |
| `kf_worker`       | Background jobs, same trust level as `kf_api`                                                      |
| `kf_migrator`     | Owns the schema. The only role permitted to DDL                                                    |
| `kf_audit_writer` | INSERT only — the audit chain is append-only                                                       |

This matters because ADR-008 makes PostgreSQL RLS the engine-level backstop. If local development ran as a superuser, RLS would be inert locally and every isolation test would be theatre — passing locally and proving nothing. Connecting as `kf_api` means a policy gap fails on your machine, not in staging.

> ### ⚠️ M-000 is provisioning, not a migration
>
> The extensions and roles are created by `infrastructure/postgres/bootstrap.sql`, run as a superuser — **not** by a Prisma migration. The Prisma chain starts at **M-001**. Three independent reasons, any one of which is decisive (KF-S0-API-003, founder decision 2026-09-06, DISC-021):
>
> 1. `kf_migrator` is `NOCREATEROLE`, and migrations run as `kf_migrator`. A `CREATE ROLE` in a migration is refused. Granting it `CREATEROLE` would dismantle the very trust model described above.
> 2. `pg_stat_statements` needs superuser **and** `shared_preload_libraries`, a server setting requiring a restart. No migration can supply either — which is why it is on the `postgres` service `command` in `dev.yml`.
> 3. Extensions and roles are database furniture. They exist before the first table and outlive every migration.
>
> Every statement in `bootstrap.sql` is idempotent, so re-running it is safe and is the supported way to repair drift — a role that somehow acquired `BYPASSRLS`, for instance, has it taken back on the next run.
>
> | Environment          | How it runs                                                                                               |
> | -------------------- | --------------------------------------------------------------------------------------------------------- |
> | dev                  | Automatically, by this init hook on an empty volume                                                       |
> | staging / production | `infrastructure/postgres/bootstrap.sh` — an operator, or the Coolify pre-deploy job `KF-S0-OPS-004` wires |
>
> Earlier revisions of this README said migration M-000 "must be idempotent" and showed a guarded `CREATE ROLE` to put in it. That instruction was wrong and is withdrawn: no migration should contain `CREATE ROLE` at all. (Supersedes decision D-18's framing; the idempotency requirement itself survives, it just applies to the bootstrap script.)

The init script runs **once**, on first initialization of an empty data volume. Editing it has no effect on an existing stack — use `scripts/dev-setup.sh --reset` to re-run it.

## Port collisions

A developer with PostgreSQL, Redis, or something on :9000 already running will get `bind: address already in use`. This is expected and is why every port is a variable. Edit `.env`:

```dotenv
KF_POSTGRES_PORT=15432
KF_REDIS_PORT=16379
```

Then re-run `scripts/dev-setup.sh`. Remember to update `KF_DATABASE_URL` and `KF_REDIS_URL` in the same file — those are what host-run apps read, and nothing recomputes them for you.

Only the published host port changes. Containers still reach each other on the internal network by service name and default port, so `pgadmin` finds `postgres:5432` regardless.

## Data and resets

Named volumes (`kf_pg_data`, `kf_redis_data`, `kf_minio_data`, `kf_pgadmin_data`) persist across restarts.

To wipe everything and start clean:

```bash
scripts/dev-setup.sh --reset          # preferred
docker compose --env-file .env -f infrastructure/compose/dev.yml down -v   # equivalent
```

## Image pinning

Images are pinned by tag **and** digest (ADR-006). The digest is what actually determines the bytes; the tag is there so a human can read the file. Change both together, and say why in the commit message.

## Not here, on purpose

- **Migrations and seeds.** `dev-setup.sh` documents the hand-off: they arrive in `KF-S0-OPS-002a`, after `KF-S0-API-003`. The script does not stub them — a stub that prints "seeding…" and does nothing makes a broken environment look healthy.
- **API, worker, and web containers.** They run on the host for hot reload (Sprint 0 Guide §2.1).
- **Staging and production topology.** Coolify config-as-code, `KF-S0-OPS-004`.
