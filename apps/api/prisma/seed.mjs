#!/usr/bin/env node
/* global console */
/**
 * Tier-1 system seed (KF-S0-API-003 requirement 4; Blueprint §4 "Seeds").
 *
 * Runs post-migrate on every deploy. Idempotent: roles, permissions,
 * role_permissions, subscription plans, global feature flags and prompt
 * versions converge to the same state however many times it runs.
 *
 * ---------------------------------------------------------------------------
 * WHY RAW `pg` AND NOT PRISMA CLIENT
 *
 * Three reasons, in order of weight:
 *
 *   1. Affected row counts. ADR-010's T-1 rules require every statement to
 *      assert what it touched, because spike finding P7.2 is that a contextless
 *      DELETE/UPDATE is a SILENT NO-OP — zero rows, no error. `pg` hands back
 *      `rowCount` directly.
 *   2. Prisma Client is KF-S0-API-001's to configure. Prisma 7 makes a driver
 *      adapter mandatory (ADR-010 finding 1), and standing that up here would
 *      pre-empt that task's decisions about pooling and the tenancy extension.
 *   3. The seed needs no model layer. It writes six reference tables from
 *      literal data; an ORM would add a generated client to the critical path
 *      of `migrate deploy && seed` for no benefit.
 *
 * ---------------------------------------------------------------------------
 * WHY IT RUNS AS `kf_migrator`
 *
 * The M-001 tables are RLS class GLOBAL_READ: `ENABLE ROW LEVEL SECURITY`, a
 * read-shaped policy, and deliberately NO `FORCE` (ADR-010 §7, the T-1 trap).
 * `kf_migrator` owns them, so it is exempt from its own policy and can write.
 *
 * Run this as `kf_api` and every INSERT matches no policy, affects zero rows,
 * and raises nothing. The seed would report success having written nothing.
 * That is precisely P7.2, so `assertOwnerConnection` below refuses to start
 * unless the connection can actually write.
 *
 * ---------------------------------------------------------------------------
 * IDEMPOTENCY IS BY CONVERGENCE, NOT BY `ON CONFLICT DO UPDATE`
 *
 * Every upsert carries `WHERE` on its `DO UPDATE`, so a row that already
 * matches is not rewritten. That matters because M-001 puts a BEFORE UPDATE
 * trigger on `updated_at`: an unconditional `DO UPDATE` would touch every row
 * on every deploy, and the table's state would differ run to run even though
 * nothing changed. With the guard, a second run performs zero writes and the
 * state is byte-identical — which is what makes the idempotency test a real
 * comparison rather than a row count.
 *
 * Usage:  node apps/api/prisma/seed.mjs         (or `prisma db seed`)
 *         node apps/api/prisma/seed.mjs --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

import { ALL_PERMISSIONS } from '@kf/contracts';

import { ROLE_CODES, derivePairs } from './seed-data/role-permission-matrix.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');

/** Prisma 7 stopped reading `.env`; Node 22 can do it without a dependency. */
const envFile = path.join(repoRoot, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const DRY_RUN = process.argv.includes('--dry-run');

/** The six M-001 tables, in FK-safe order. */
const TABLES = [
  'subscription_plans',
  'roles',
  'permissions',
  'role_permissions',
  'feature_flags',
  'prompt_versions',
];

/**
 * Subscription plans — exactly three (BRD D2), codes SMALL/MEDIUM/LARGE
 * (founder, 2026-09-06).
 *
 * `limits` is a TODO-F1 placeholder per DISC-006: F1 has not set price points
 * or capacity numbers. The marker is IN THE DATA, not in code logic, which is
 * what DISC-006 requires — a reader of the database can see the plan is
 * provisional, and no branch anywhere depends on it.
 */
const SUBSCRIPTION_PLANS = [
  {
    code: 'SMALL',
    limits: { _todo: 'F1', max_children: null, storage_gb: null, ai_tokens_daily: null },
  },
  {
    code: 'MEDIUM',
    limits: { _todo: 'F1', max_children: null, storage_gb: null, ai_tokens_daily: null },
  },
  {
    code: 'LARGE',
    limits: { _todo: 'F1', max_children: null, storage_gb: null, ai_tokens_daily: null },
  },
];

/**
 * Global feature flags — deliberately NONE.
 *
 * Requirement 4 says "global feature flags", and no approved document names a
 * single flag key. A flag is reference data: inventing `ai_drafting_enabled`
 * here would put a switch in production that no specification authorises, and
 * something would come to depend on it. An empty `feature_flags` table is
 * meaningful and correct — no flags are defined yet — in a way an empty `roles`
 * table would not be. Registered as DISC-026.
 */
const FEATURE_FLAGS = [];

/**
 * Prompt versions — the one template the MVP has.
 *
 * Blueprint §5: templates live in code (`apps/api/src/modules/ai/prompts/`) and
 * register themselves here at boot, named `daily-report@1.x.y`. That module does
 * not exist yet, and `report_drafts` (M-005) needs a valid FK target before it
 * does, so the placeholder row is seeded with `is_active = false` and a sentinel
 * hash. The AI task replaces the hash with the real digest and activates it.
 */
const PROMPT_VERSIONS = [
  {
    promptId: 'daily-report',
    version: '1.0.0',
    // 64 zeros: a valid-shaped SHA-256 that no real template can produce, so an
    // unreplaced placeholder is obvious rather than plausible.
    contentHash: '0'.repeat(64),
    isActive: false,
  },
];

// ---------------------------------------------------------------------------

const log = (msg) => console.log(`seed: ${msg}`);

/**
 * Refuses to run unless this connection can actually write the reference
 * tables. The failure this prevents is silent: RLS denies a write with no
 * policy by affecting zero rows, not by raising (spike finding P7.2).
 */
async function assertOwnerConnection(client) {
  const { rows } = await client.query(
    `SELECT c.relname               AS table_name,
            pg_get_userbyid(c.relowner) AS owner,
            c.relrowsecurity        AS rls_enabled,
            c.relforcerowsecurity   AS rls_forced
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])`,
    [TABLES],
  );

  const missing = TABLES.filter((t) => !rows.some((r) => r.table_name === t));
  if (missing.length > 0) {
    throw new Error(
      `seed: these tables do not exist: ${missing.join(', ')}. ` +
        'Run the migrations first — `prisma migrate deploy`.',
    );
  }

  const { rows: who } = await client.query('SELECT current_user AS user');
  const currentUser = who[0].user;

  const notOwned = rows.filter((r) => r.owner !== currentUser);
  if (notOwned.length > 0) {
    throw new Error(
      `seed: connected as "${currentUser}", which does not own ` +
        `${notOwned.map((r) => r.table_name).join(', ')} (owner: ${notOwned[0].owner}).\n` +
        '  GLOBAL_READ tables carry a read-only policy and no FORCE, so the OWNER is the\n' +
        '  only role that can write them. A non-owner connection would insert nothing and\n' +
        '  raise nothing — spike finding P7.2. Use KF_DATABASE_MIGRATION_URL (kf_migrator).',
    );
  }

  const forced = rows.filter((r) => r.rls_forced);
  if (forced.length > 0) {
    throw new Error(
      `seed: FORCE ROW LEVEL SECURITY is set on ${forced.map((r) => r.table_name).join(', ')}.\n` +
        '  That subjects the owner to its own read-only policy and turns this seed into a\n' +
        '  silent no-op. It is the T-1 trap in ADR-010 §7, and GLOBAL_READ must not use it.',
    );
  }

  const unprotected = rows.filter((r) => !r.rls_enabled);
  if (unprotected.length > 0) {
    throw new Error(
      `seed: RLS is not enabled on ${unprotected.map((r) => r.table_name).join(', ')}. ` +
        'M-001 must enable it on every reference table.',
    );
  }

  log(`connected as ${currentUser}; owns all ${TABLES.length} reference tables, no FORCE`);
}

/**
 * Asserts a table holds exactly `expected` values of `column` — in both
 * directions, so a stray row fails as loudly as a missing one. This is the
 * convergence check that makes the seed's idempotency real: if writes silently
 * affected nothing, the set would not match.
 */
async function assertExactSet(client, table, column, expected, label) {
  const { rows } = await client.query(`SELECT ${column} AS value FROM "${table}"`);
  const actual = new Set(rows.map((r) => String(r.value)));
  const want = new Set(expected.map(String));

  const missing = [...want].filter((v) => !actual.has(v));
  const extra = [...actual].filter((v) => !want.has(v));

  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `seed: ${label} does not match the source of truth.\n` +
        (missing.length > 0
          ? `  missing from the database (${missing.length}): ${missing.slice(0, 10).join(', ')}\n`
          : '') +
        (extra.length > 0
          ? `  present but not expected (${extra.length}): ${extra.slice(0, 10).join(', ')}\n`
          : ''),
    );
  }
  log(`${label}: ${want.size} row(s) verified in both directions`);
}

async function seedRoles(client) {
  const result = await client.query(
    `INSERT INTO "roles" (code)
     SELECT unnest($1::text[])
     ON CONFLICT (code) DO NOTHING`,
    [ROLE_CODES],
  );
  log(`roles: ${result.rowCount} inserted, ${ROLE_CODES.length - result.rowCount} already present`);
  await assertExactSet(client, 'roles', 'code', ROLE_CODES, 'roles');
}

async function seedPermissions(client) {
  const result = await client.query(
    `INSERT INTO "permissions" (code)
     SELECT unnest($1::text[])
     ON CONFLICT (code) DO NOTHING`,
    [ALL_PERMISSIONS],
  );
  log(
    `permissions: ${result.rowCount} inserted, ` +
      `${ALL_PERMISSIONS.length - result.rowCount} already present`,
  );
  // AC3: the database must equal the contract map, failing on drift either way.
  await assertExactSet(client, 'permissions', 'code', ALL_PERMISSIONS, 'permissions');
}

async function seedRolePermissions(client) {
  const { pairs, unmapped } = derivePairs(ALL_PERMISSIONS);

  const result = await client.query(
    `INSERT INTO "role_permissions" (role_id, permission_id)
     SELECT r.id, p.id
       FROM unnest($1::text[], $2::text[]) AS src(role_code, permission_code)
       JOIN "roles"       r ON r.code = src.role_code
       JOIN "permissions" p ON p.code = src.permission_code
     ON CONFLICT (role_id, permission_id) DO NOTHING`,
    [pairs.map((p) => p.role), pairs.map((p) => p.code)],
  );
  log(
    `role_permissions: ${result.rowCount} inserted, ${pairs.length - result.rowCount} already present`,
  );

  // The JOINs silently drop a pair whose role or permission is missing, so the
  // total is checked rather than trusted.
  const { rows } = await client.query('SELECT count(*)::int AS n FROM "role_permissions"');
  if (rows[0].n !== pairs.length) {
    throw new Error(
      `seed: role_permissions holds ${rows[0].n} rows, expected ${pairs.length}. ` +
        'A pair was dropped by its JOIN, which means a role or permission code is missing.',
    );
  }
  log(
    `role_permissions: ${pairs.length} rows verified (${unmapped.length} matrix cells map to no code — see ROLE_PERMISSIONS_DERIVATION.md)`,
  );
}

async function seedSubscriptionPlans(client) {
  // DO UPDATE guarded by a real difference, so an unchanged run writes nothing
  // and the updated_at trigger does not fire. See the header.
  const result = await client.query(
    `INSERT INTO "subscription_plans" (code, limits)
     SELECT src.code::plan_code, src.limits::jsonb
       FROM unnest($1::text[], $2::text[]) AS src(code, limits)
     ON CONFLICT (code) DO UPDATE
        SET limits = EXCLUDED.limits
      WHERE "subscription_plans".limits IS DISTINCT FROM EXCLUDED.limits`,
    [
      SUBSCRIPTION_PLANS.map((p) => p.code),
      SUBSCRIPTION_PLANS.map((p) => JSON.stringify(p.limits)),
    ],
  );
  log(`subscription_plans: ${result.rowCount} row(s) written`);
  await assertExactSet(
    client,
    'subscription_plans',
    'code',
    SUBSCRIPTION_PLANS.map((p) => p.code),
    'subscription_plans',
  );
}

async function seedFeatureFlags(client) {
  if (FEATURE_FLAGS.length === 0) {
    const { rows } = await client.query(
      'SELECT count(*)::int AS n FROM "feature_flags" WHERE tenant_id IS NULL',
    );
    log(
      `feature_flags: no global flags to seed — no approved document names one (DISC-026). ` +
        `${rows[0].n} global row(s) present.`,
    );
    return;
  }
  throw new Error('seed: FEATURE_FLAGS is non-empty but no insert path is implemented.');
}

async function seedPromptVersions(client) {
  const result = await client.query(
    `INSERT INTO "prompt_versions" (prompt_id, version, content_hash, is_active)
     SELECT src.prompt_id, src.version, src.content_hash, src.is_active
       FROM unnest($1::text[], $2::text[], $3::text[], $4::boolean[])
         AS src(prompt_id, version, content_hash, is_active)
     ON CONFLICT (prompt_id, version) DO NOTHING`,
    [
      PROMPT_VERSIONS.map((p) => p.promptId),
      PROMPT_VERSIONS.map((p) => p.version),
      PROMPT_VERSIONS.map((p) => p.contentHash),
      PROMPT_VERSIONS.map((p) => p.isActive),
    ],
  );
  log(`prompt_versions: ${result.rowCount} inserted`);
  await assertExactSet(
    client,
    'prompt_versions',
    'prompt_id || $$@$$ || version',
    PROMPT_VERSIONS.map((p) => `${p.promptId}@${p.version}`),
    'prompt_versions',
  );
}

async function main() {
  const url = process.env.KF_DATABASE_MIGRATION_URL;
  if (!url) {
    throw new Error(
      'KF_DATABASE_MIGRATION_URL is not set. The seed must connect as kf_migrator — ' +
        'it owns the GLOBAL_READ tables and is the only role that can write them. See .env.example.',
    );
  }

  // --dry-run answers "what would this write?" and deliberately needs no
  // database, so the derivation can be sanity-checked on a machine with no
  // stack running.
  if (DRY_RUN) {
    const { pairs, unmapped } = derivePairs(ALL_PERMISSIONS);
    log('--dry-run: no connection opened, nothing written. Would seed:');
    log(`  roles              ${ROLE_CODES.length}`);
    log(`  permissions        ${ALL_PERMISSIONS.length}`);
    log(`  role_permissions   ${pairs.length}  (${unmapped.length} matrix cells map to no code)`);
    log(`  subscription_plans ${SUBSCRIPTION_PLANS.length}`);
    log(`  feature_flags      ${FEATURE_FLAGS.length}  (none defined — DISC-026)`);
    log(`  prompt_versions    ${PROMPT_VERSIONS.length}`);
    return;
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();

  try {
    await assertOwnerConnection(client);

    // One transaction: a half-seeded reference set is worse than none, because
    // the guard pipeline would read it and deny things that should be allowed.
    await client.query('BEGIN');
    await seedRoles(client);
    await seedPermissions(client);
    await seedRolePermissions(client);
    await seedSubscriptionPlans(client);
    await seedFeatureFlags(client);
    await seedPromptVersions(client);
    await client.query('COMMIT');

    log('tier-1 seed complete.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

await main();
