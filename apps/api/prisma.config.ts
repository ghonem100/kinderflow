/**
 * Prisma CLI configuration (KF-S0-API-003).
 *
 * Prisma 7 removed `url` from the `datasource` block in `schema.prisma`, so the
 * CLI's connection lives here instead (ADR-010 finding 1 — ADR-002 predates
 * this). This file configures ONLY what migrate and seed need. The runtime
 * client — the driver adapter, pool sizing, the tenancy extension — is
 * KF-S0-API-001's, and building it here would pre-empt that task.
 *
 * MIGRATIONS RUN AS `kf_migrator`, the only role permitted to DDL. The seed
 * runs as `kf_migrator` too, deliberately: the M-001 tables are GLOBAL_READ,
 * their policies are read-shaped, and `kf_migrator` owns them. Because the
 * class does not apply `FORCE ROW LEVEL SECURITY` (ADR-010 §7, the T-1 trap),
 * the owner is exempt from its own policy and the seed can write. Running the
 * seed as `kf_api` would produce a silent no-op — zero rows, no error — which
 * is spike finding P7.2 and the reason every seed statement asserts its
 * affected row count.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 no longer reads `.env` on its own, and the repo keeps one file at the
 * root rather than one per workspace. Node 22's own loader does the job, so
 * `dotenv` is not installed — no approved document authorizes it, and adding a
 * dependency to read a file Node can already read would be a poor trade.
 *
 * Values already in the environment win: CI and the Coolify runtime set them
 * directly and must not be overridden by a developer's committed defaults.
 */
const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const envFile = path.join(repoRoot, '.env');
if (fs.existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const migrationUrl = process.env.KF_DATABASE_MIGRATION_URL;
if (!migrationUrl) {
  throw new Error(
    'KF_DATABASE_MIGRATION_URL is not set. It must point at the kf_migrator role — ' +
      'see .env.example. Migrations run as kf_migrator because it is the only role ' +
      'permitted to DDL (infrastructure/postgres/bootstrap.sql).',
  );
}

// `migrate dev` needs a scratch database to detect drift; `migrate deploy` does
// not, so this stays optional and is unset in CI.
const shadowUrl = process.env.KF_DATABASE_SHADOW_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',

  datasource: {
    url: migrationUrl,
    ...(shadowUrl ? { shadowDatabaseUrl: shadowUrl } : {}),
  },

  migrations: {
    path: 'prisma/migrations',
    // Plain Node, no loader. See the header of seed.mjs for why the seed talks
    // to `pg` directly rather than through Prisma Client.
    seed: 'node prisma/seed.mjs',
  },
});
