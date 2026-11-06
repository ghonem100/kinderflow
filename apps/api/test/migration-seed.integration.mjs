/**
 * KF-S0-API-003 — integration proof. NEEDS POSTGRESQL.
 *
 * Acceptance criteria 1, 2, 3, 4 and 11 are all claims about a real database:
 * that `migrate deploy` works on an empty one, that the seed is idempotent, that
 * the permission rows equal the contract map, and that `kf_api` cannot escape
 * RLS. None of that can be proved by reading files, so this suite is separate
 * from `reference-data.test.mjs` and runs under `test:integration`.
 *
 * It does NOT skip when no database is reachable — it fails. A suite that goes
 * green by not running is the failure mode this project's gates exist to stop;
 * `KF-S0-CI-001` must wire this as a blocking job against its postgres service.
 *
 * EACH RUN OWNS A SCRATCH DATABASE. "Migrate from empty" is only meaningful
 * against an empty database, and `kf_dev` stops being empty after the first run.
 * So the suite creates `kf_test_<random>` as the superuser, bootstraps it, and
 * drops it at the end. That also exercises `infrastructure/postgres/bootstrap.sql`
 * for real, which is the implementation of the M-000 decision (DISC-021) — it is
 * the only place that file is executed by anything other than the compose hook.
 *
 * ---------------------------------------------------------------------------
 * KF-S0-CI-001 MUST SET `KF_POSTGRES_PORT` EXPLICITLY.
 *
 * The constants below fall back to 5432, which is PostgreSQL's default and the
 * value in `.env.example` — but NOT the port the dev stack publishes. A
 * developer whose machine already runs PostgreSQL remaps it (the compose README
 * says "you will hit one"), and on this machine `.env` sets 15432. The fallback
 * exists so the suite runs with no `.env` at all against a default server; it
 * is not a value CI should inherit by accident.
 *
 * In CI, pass the port of the postgres service rather than relying on the
 * fallback. Getting it wrong does not produce a wrong result — the `before`
 * hook fails with an actionable message naming host and port — but it fails the
 * job for a reason that has nothing to do with the code under test.
 * ---------------------------------------------------------------------------
 * Run: pnpm --filter @kf/api test:integration
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

import { ALL_PERMISSIONS } from '@kf/contracts';

import { ROLE_CODES, derivePairs } from '../prisma/seed-data/role-permission-matrix.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(here, '..');
const repoRoot = path.resolve(apiRoot, '..', '..');

const envFile = path.join(repoRoot, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const HOST = process.env.KF_POSTGRES_HOST ?? 'localhost';
const PORT = process.env.KF_POSTGRES_PORT ?? '5432';
const SUPER_USER = process.env.KF_POSTGRES_USER ?? 'postgres';
const SUPER_PASSWORD = process.env.KF_POSTGRES_PASSWORD;
const MIGRATOR_PASSWORD = process.env.KF_DB_MIGRATOR_PASSWORD;
const API_PASSWORD = process.env.KF_DB_API_PASSWORD;

const SCRATCH_DB = `kf_test_${crypto.randomBytes(6).toString('hex')}`;

const M001_TABLES = [
  'subscription_plans',
  'roles',
  'permissions',
  'role_permissions',
  'feature_flags',
  'prompt_versions',
];

const url = (user, password, database) =>
  `postgresql://${user}:${encodeURIComponent(password)}@${HOST}:${PORT}/${database}?schema=public`;

const superUrl = (database) => url(SUPER_USER, SUPER_PASSWORD, database);
const migratorUrl = (database) => url('kf_migrator', MIGRATOR_PASSWORD, database);
const apiUrl = (database) => url('kf_api', API_PASSWORD, database);

async function withClient(connectionString, fn) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Runs a CLI step with the scratch database injected, and fails loudly. */
function runStep(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: apiRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      KF_DATABASE_MIGRATION_URL: migratorUrl(SCRATCH_DB),
      // A shadow database would need CREATEDB, which kf_migrator deliberately
      // lacks. `migrate deploy` does not use one.
      KF_DATABASE_SHADOW_URL: '',
    },
  });
  assert.equal(result.status, 0, `${label} failed:\n${result.stdout}\n${result.stderr}`);
  return `${result.stdout}${result.stderr}`;
}

/**
 * Every reference row, ordered, as comparable JSON. Includes `updated_at` on
 * purpose: the idempotency claim is that a second run changes nothing, and the
 * M-001 trigger would move that column if the seed rewrote a row it did not
 * need to.
 */
async function snapshot(client) {
  const out = {};
  for (const table of M001_TABLES) {
    const { rows } = await client.query(
      `SELECT to_jsonb(t) - 'id' AS row FROM "${table}" t ORDER BY to_jsonb(t)::text`,
    );
    out[table] = rows.map((r) => r.row);
  }
  return out;
}

before(async () => {
  for (const [name, value] of Object.entries({
    KF_POSTGRES_PASSWORD: SUPER_PASSWORD,
    KF_DB_MIGRATOR_PASSWORD: MIGRATOR_PASSWORD,
    KF_DB_API_PASSWORD: API_PASSWORD,
  })) {
    assert.ok(
      value,
      `${name} is not set — copy .env.example to .env (scripts/dev-setup.sh does it)`,
    );
  }

  // Fail with something actionable rather than a raw ECONNREFUSED.
  try {
    await withClient(superUrl('postgres'), async (client) => {
      await client.query(`CREATE DATABASE "${SCRATCH_DB}"`);
    });
  } catch (error) {
    assert.fail(
      `could not reach PostgreSQL at ${HOST}:${PORT} as ${SUPER_USER}.\n` +
        '  Start the dev stack first:  scripts/dev-setup.sh\n' +
        `  Underlying error: ${error.message}`,
    );
  }

  // Bootstrap the scratch database exactly as an operator would. bootstrap.sql
  // is pure SQL, so a `pg` client can run it — no psql on PATH required.
  const bootstrapSql = fs.readFileSync(
    path.join(repoRoot, 'infrastructure', 'postgres', 'bootstrap.sql'),
    'utf8',
  );
  await withClient(superUrl(SCRATCH_DB), async (client) => {
    await client.query(bootstrapSql);
  });
});

after(async () => {
  await withClient(superUrl('postgres'), async (client) => {
    await client.query(`DROP DATABASE IF EXISTS "${SCRATCH_DB}" WITH (FORCE)`);
  });
});

// ===========================================================================
// AC1 — migrate deploy on an empty database
// ===========================================================================

test('AC1 — prisma migrate deploy succeeds on an empty database', async () => {
  const output = runStep('npx', ['prisma', 'migrate', 'deploy'], 'migrate deploy');
  assert.match(output, /m001_reference_data/);

  await withClient(migratorUrl(SCRATCH_DB), async (client) => {
    const { rows } = await client.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    );
    const tables = rows.map((r) => r.tablename);
    for (const table of M001_TABLES) {
      assert.ok(tables.includes(table), `${table} was not created`);
    }
  });
});

test('AC1 — the migration linter passes against the applied chain', () => {
  const result = spawnSync('pnpm', ['lint:migrations'], {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  assert.match(result.stdout, /cross-check ACTIVE/);
});

test('the fourteen enums exist as PostgreSQL types', async () => {
  await withClient(migratorUrl(SCRATCH_DB), async (client) => {
    const { rows } = await client.query(
      `SELECT t.typname FROM pg_type t
         JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typtype = 'e'
        ORDER BY t.typname`,
    );
    const types = rows.map((r) => r.typname);
    assert.equal(types.length, 14, `expected 14 enum types, found ${types.length}: ${types}`);
    for (const expected of ['plan_code', 'invoice_status', 'media_status', 'consent_type']) {
      assert.ok(types.includes(expected), `${expected} is missing`);
    }
    // The two awaiting DISC-017 must NOT have been invented.
    assert.equal(types.includes('sync_status'), false);
    assert.equal(types.includes('notification_channel'), false);
  });
});

test('every reference table has RLS enabled and is not FORCED', async () => {
  await withClient(migratorUrl(SCRATCH_DB), async (client) => {
    const { rows } = await client.query(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])`,
      [M001_TABLES],
    );
    assert.equal(rows.length, M001_TABLES.length);
    for (const row of rows) {
      assert.equal(row.relrowsecurity, true, `${row.relname} has RLS disabled`);
      assert.equal(
        row.relforcerowsecurity,
        false,
        `${row.relname} is FORCED — that breaks the tier-1 seed (ADR-010 §7, T-1)`,
      );
    }
  });
});

test('the UUIDv7 fallback produces version-7 uuids, not version 4', async () => {
  // A v4 fallback would silently lose the time ordering Domain Part 9's keyset
  // pagination and index-locality argument both rest on.
  await withClient(migratorUrl(SCRATCH_DB), async (client) => {
    const { rows } = await client.query('SELECT uuid_generate_v7()::text AS id');
    assert.match(rows[0].id, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-/);
  });
});

// ===========================================================================
// AC2 + AC11 — seed twice, compare state
// ===========================================================================

test('AC2 + AC11 — running the seed twice leaves identical state', async () => {
  runStep(process.execPath, ['prisma/seed.mjs'], 'first seed');
  const first = await withClient(migratorUrl(SCRATCH_DB), snapshot);

  runStep(process.execPath, ['prisma/seed.mjs'], 'second seed');
  const second = await withClient(migratorUrl(SCRATCH_DB), snapshot);

  // Compared including updated_at: the trigger would move it if the second run
  // had rewritten a row it did not need to.
  assert.deepEqual(second, first, 'the seed is not idempotent');

  for (const table of M001_TABLES) {
    const expected = { role_permissions: derivePairs(ALL_PERMISSIONS).pairs.length }[table];
    if (expected !== undefined) {
      assert.equal(first[table].length, expected, `${table} row count drifted`);
    }
  }
});

// ===========================================================================
// AC3 — permission rows equal the contract map, in both directions
// ===========================================================================

test('AC3 — permission rows exactly equal @kf/contracts, both directions', async () => {
  await withClient(migratorUrl(SCRATCH_DB), async (client) => {
    const { rows } = await client.query('SELECT code FROM "permissions" ORDER BY code');
    const inDb = rows.map((r) => r.code);
    assert.deepEqual(inDb, [...ALL_PERMISSIONS].sort());
  });
});

test('all eight roles are seeded, and only those', async () => {
  await withClient(migratorUrl(SCRATCH_DB), async (client) => {
    const { rows } = await client.query('SELECT code FROM "roles" ORDER BY code');
    assert.deepEqual(
      rows.map((r) => r.code),
      [...ROLE_CODES].sort(),
    );
  });
});

test('role_permissions matches the derivation, and SUPER_ADMIN holds no tenant data', async () => {
  const { pairs } = derivePairs(ALL_PERMISSIONS);
  await withClient(migratorUrl(SCRATCH_DB), async (client) => {
    const { rows } = await client.query(
      `SELECT r.code AS role, p.code AS permission
         FROM "role_permissions" rp
         JOIN "roles" r ON r.id = rp.role_id
         JOIN "permissions" p ON p.id = rp.permission_id`,
    );
    assert.equal(rows.length, pairs.length);

    const actual = new Set(rows.map((r) => `${r.role}\u0000${r.permission}`));
    for (const p of pairs) {
      assert.ok(actual.has(`${p.role}\u0000${p.code}`), `missing grant ${p.role} → ${p.code}`);
    }

    for (const row of rows.filter((r) => r.role === 'SUPER_ADMIN')) {
      assert.ok(
        /^(platform:|breakglass:|ai:)/.test(row.permission),
        `SUPER_ADMIN holds ${row.permission} as a standing grant; RBAC §3 says break-glass only`,
      );
    }
  });
});

test('the three plans seed with TODO-F1 limits', async () => {
  await withClient(migratorUrl(SCRATCH_DB), async (client) => {
    const { rows } = await client.query(
      'SELECT code, limits FROM "subscription_plans" ORDER BY code',
    );
    // Declaration order, not alphabetical: PostgreSQL sorts an enum column by
    // the order its members were declared. Worth knowing rather than working
    // around — for capacity tiers it is the order you actually want, and any
    // report that does `ORDER BY code` gets small-to-large for free.
    assert.deepEqual(
      rows.map((r) => r.code),
      ['SMALL', 'MEDIUM', 'LARGE'],
    );
    for (const row of rows) {
      assert.equal(row.limits._todo, 'F1', 'the marker belongs in the data, per DISC-006');
    }
  });
});

test('no feature flag was invented — DISC-026', async () => {
  await withClient(migratorUrl(SCRATCH_DB), async (client) => {
    const { rows } = await client.query('SELECT count(*)::int AS n FROM "feature_flags"');
    assert.equal(rows[0].n, 0, 'no approved document names a flag key');
  });
});

// ===========================================================================
// AC4 — kf_api's privileges
// ===========================================================================

test('kf_migrator has CREATE on the database, and kf_api does not', async () => {
  // The defect this pins: `prisma migrate deploy` emits
  // `CREATE SCHEMA IF NOT EXISTS "public"`, and PostgreSQL checks CREATE on the
  // DATABASE before IF NOT EXISTS short-circuits. bootstrap.sql granted CONNECT
  // but not CREATE, so the first deploy died with 42501 — on a database the
  // migrator already owned the schema of. A scratch database has no OWNER, so
  // the superuser keeps it and the grant is the only route.
  await withClient(superUrl(SCRATCH_DB), async (client) => {
    const { rows } = await client.query(
      `SELECT has_database_privilege('kf_migrator', current_database(), 'CREATE') AS migrator,
              has_database_privilege('kf_api',      current_database(), 'CREATE') AS api,
              has_database_privilege('kf_worker',   current_database(), 'CREATE') AS worker`,
    );
    assert.equal(
      rows[0].migrator,
      true,
      'kf_migrator cannot CREATE — migrate deploy will fail 42501',
    );
    assert.equal(rows[0].api, false, 'kf_api must not be able to create schemas');
    assert.equal(rows[0].worker, false, 'kf_worker must not be able to create schemas');
  });
});

test('AC4 — kf_api has no BYPASSRLS', async () => {
  await withClient(migratorUrl(SCRATCH_DB), async (client) => {
    const { rows } = await client.query(
      `SELECT rolname, rolbypassrls, rolsuper, rolcreatedb, rolcreaterole
         FROM pg_roles WHERE rolname = ANY($1::text[]) ORDER BY rolname`,
      [['kf_api', 'kf_worker', 'kf_migrator', 'kf_audit_writer']],
    );
    assert.equal(rows.length, 4);
    for (const row of rows) {
      assert.equal(row.rolbypassrls, false, `${row.rolname} can bypass RLS`);
      assert.equal(row.rolsuper, false, `${row.rolname} is a superuser`);
      assert.equal(row.rolcreatedb, false, `${row.rolname} can create databases`);
      assert.equal(row.rolcreaterole, false, `${row.rolname} can create roles`);
    }
  });
});

test('AC4 — kf_api cannot CREATE TABLE', async () => {
  await withClient(apiUrl(SCRATCH_DB), async (client) => {
    await assert.rejects(
      () => client.query('CREATE TABLE kf_api_should_not_manage_this (id uuid PRIMARY KEY)'),
      /permission denied/i,
      'kf_api must not be able to define a table that escapes an RLS policy',
    );
  });
});

test('kf_api can READ the reference tables and cannot write them', async () => {
  await withClient(apiUrl(SCRATCH_DB), async (client) => {
    // GLOBAL_READ: readable by all authenticated roles.
    const { rows } = await client.query('SELECT count(*)::int AS n FROM "permissions"');
    assert.equal(rows[0].n, ALL_PERMISSIONS.length, 'kf_api must be able to read reference data');

    // "Writes platform-only" is implemented as no write policy at all, so RLS
    // rejects the insert. This is the assertion that proves the seed had to run
    // as the owner.
    await assert.rejects(
      () => client.query(`INSERT INTO "permissions" (code) VALUES ('smuggled:code')`),
      /row-level security|permission denied/i,
      'kf_api must not be able to add a permission',
    );
  });
});

test('the two-tier feature-flag policy hides other tenants and shows global rows', async () => {
  const tenantA = crypto.randomUUID();
  const tenantB = crypto.randomUUID();

  await withClient(migratorUrl(SCRATCH_DB), async (client) => {
    await client.query(
      `INSERT INTO "feature_flags" (key, tenant_id, is_enabled)
       VALUES ('kf_test_global', NULL, true), ('kf_test_override', $1, true), ('kf_test_override', $2, false)`,
      [tenantA, tenantB],
    );
  });

  try {
    await withClient(apiUrl(SCRATCH_DB), async (client) => {
      // No tenant context: only the global row is visible.
      const none = await client.query('SELECT key, tenant_id FROM "feature_flags"');
      assert.deepEqual(
        none.rows.map((r) => r.tenant_id),
        [null],
        'a connection with no tenant context must see only global rows',
      );

      // Tenant A sees the global row plus its own override, never tenant B's.
      await client.query(`SELECT set_config('app.tenant_id', $1, false)`, [tenantA]);
      const a = await client.query(
        'SELECT key, tenant_id FROM "feature_flags" ORDER BY tenant_id NULLS FIRST',
      );
      assert.equal(a.rows.length, 2);
      assert.deepEqual(new Set(a.rows.map((r) => r.tenant_id)), new Set([null, tenantA]));
      assert.equal(
        a.rows.some((r) => r.tenant_id === tenantB),
        false,
        "tenant A must never see tenant B's override",
      );
    });
  } finally {
    await withClient(migratorUrl(SCRATCH_DB), async (client) => {
      await client.query(`DELETE FROM "feature_flags" WHERE key LIKE 'kf_test_%'`);
    });
  }
});
