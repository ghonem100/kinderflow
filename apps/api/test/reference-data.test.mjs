/**
 * KF-S0-API-003 — assertions that need no database.
 *
 * The suite is split deliberately. Everything here runs on any machine with a
 * checkout: the enum parity test, the role-permission derivation, the shape of
 * the migration SQL, the manifest. `migration-seed.integration.test.mjs` holds
 * what genuinely needs PostgreSQL — migrate from empty, seed twice, role
 * privileges — and is a separate `test:integration` script so the everyday
 * `pnpm test` cannot go green by skipping the parts that matter.
 *
 * Run: pnpm --filter @kf/api test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { ALL_PERMISSIONS, ENUMS, ENUMS_PENDING_DEFINITION } from '@kf/contracts';

import { MATRIX, ROLE_CODES, derivePairs } from '../prisma/seed-data/role-permission-matrix.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(here, '..');
const repoRoot = path.resolve(apiRoot, '..', '..');

const schemaText = fs.readFileSync(path.join(apiRoot, 'prisma', 'schema.prisma'), 'utf8');

const migrationDir = path.join(apiRoot, 'prisma', 'migrations');
const migrationFiles = fs
  .readdirSync(migrationDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => path.join(migrationDir, e.name, 'migration.sql'));
const migrationSql = migrationFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

/**
 * SQL with its `--` comments removed.
 *
 * Needed because the prose in these files deliberately NAMES the statements it
 * forbids — the migration explains why there is no FORCE, and bootstrap.sql
 * explains why kf_migrator must stay NOCREATEROLE. Asserting against the raw
 * text would match the explanation and fail on a file that is correct, which is
 * the same class of mistake as a linter matching its own documentation.
 */
const sqlOnly = (text) =>
  text
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');

const M001_TABLES = [
  'subscription_plans',
  'roles',
  'permissions',
  'role_permissions',
  'feature_flags',
  'prompt_versions',
];

const run = (cmd, args, cwd = repoRoot) =>
  spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' });

// ===========================================================================
// Roles — B-2's decision, and the spellings it rules out
// ===========================================================================

test('eight roles are seeded, in the RBAC §2.1 spelling', () => {
  assert.deepEqual(ROLE_CODES, [
    'OWNER',
    'BRANCH_MANAGER',
    'TEACHER',
    'RECEPTIONIST',
    'ACCOUNTANT',
    'PARENT',
    'SUPER_ADMIN',
    'SYSTEM',
  ]);
});

test('the spellings the documents disagree on are not used', () => {
  // RBAC §3's column header abbreviates, SAD §5 uses PascalCase and calls the
  // platform role PlatformAdmin. roles.code is unique and seeded, so picking
  // one of these later is a data migration (DISC-022).
  assert.equal(ROLE_CODES.includes('BRANCH_MGR'), false, '§3 column header is an abbreviation');
  assert.equal(ROLE_CODES.includes('PlatformAdmin'), false, 'SAD §5 naming is superseded');
  assert.equal(ROLE_CODES.includes('BranchManager'), false);
  assert.ok(ROLE_CODES.includes('SYSTEM'), 'the §3 SYSTEM column carries real grants');
});

// ===========================================================================
// role_permissions derivation
// ===========================================================================

test('the derivation table committed alongside the matrix is current', () => {
  const result = run(
    process.execPath,
    ['prisma/seed-data/render-derivation.mjs', '--check'],
    apiRoot,
  );
  assert.equal(
    result.status,
    0,
    `the derivation table is stale; regenerate it:\n${result.stdout}${result.stderr}`,
  );
});

test('every derived code exists in the contract map', () => {
  // The authorization vocabulary is @kf/contracts, which transcribes API
  // Contract §2. A code here that is not there would be invented.
  const { pairs } = derivePairs(ALL_PERMISSIONS);
  const known = new Set(ALL_PERMISSIONS);
  const invented = pairs.filter((p) => !known.has(p.code));
  assert.deepEqual(invented, []);
  assert.ok(pairs.length > 200, `expected the whole matrix, derived only ${pairs.length} pairs`);
});

test('no scope superscript reaches a seeded code — RBAC §2.3', () => {
  const { pairs } = derivePairs(ALL_PERMISSIONS);
  for (const { code } of pairs) {
    assert.doesNotMatch(code, /[ᵀᴮᶜᴼ]/, `${code} carries scope`);
  }
  // The raw cells DO keep their superscripts, so a reviewer can check them.
  const rawCells = MATRIX.flatMap((m) => Object.values(m.cells).map((c) => c.raw)).join(' ');
  assert.match(rawCells, /[ᵀᴮᶜᴼ]/, 'raw cells must preserve the matrix text verbatim');
});

test('SUPER_ADMIN holds the platform plane and no tenant data — B-3', () => {
  const { pairs } = derivePairs(ALL_PERMISSIONS);
  const superAdmin = pairs.filter((p) => p.role === 'SUPER_ADMIN').map((p) => p.code);

  assert.ok(superAdmin.length > 0, 'SUPER_ADMIN must hold its platform codes');
  for (const code of superAdmin) {
    assert.ok(
      code.startsWith('platform:') || code.startsWith('breakglass:') || code.startsWith('ai:'),
      `${code} is tenant data; RBAC §3's header makes SUPER_ADMIN break-glass only`,
    );
  }
  // The ones that would be most tempting to grant:
  for (const forbidden of ['child:read', 'invoice:read', 'medical:read', 'audit:read']) {
    assert.equal(
      superAdmin.includes(forbidden),
      false,
      `${forbidden} would be a standing tenant grant`,
    );
  }
});

test('permissions with zero grants are present and expected', () => {
  const { pairs } = derivePairs(ALL_PERMISSIONS);
  const granted = new Set(pairs.map((p) => p.code));
  const ungranted = ALL_PERMISSIONS.filter((c) => !granted.has(c));

  // Both are registered outcomes, not oversights. `activity:delete` is the
  // reverse discrepancy in DISC-015 (§2.7 has the code, §3 gives D to no role).
  // `role:read` is newly found: RBAC §3 has no row for roles at all, so the
  // endpoint that lists them is callable by nobody (DISC-023).
  assert.deepEqual(ungranted.sort(), ['activity:delete', 'role:read']);
});

test('the SYSTEM role has real grants, which is why it is seeded', () => {
  const { pairs } = derivePairs(ALL_PERMISSIONS);
  const system = pairs.filter((p) => p.role === 'SYSTEM').map((p) => p.code);

  assert.ok(system.length > 20, `SYSTEM holds ${system.length} codes; the §3 column is not empty`);
  for (const expected of [
    'attendance:create',
    'invoice:create',
    'media:create',
    'message:create',
  ]) {
    assert.ok(system.includes(expected), `SYSTEM must hold ${expected}`);
  }
});

// ===========================================================================
// Enum parity — Testing Requirements
// ===========================================================================

/** Enum blocks in schema.prisma, as name → members. */
function parseSchemaEnums(text) {
  const out = {};
  const re = /^enum\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)^\}/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    out[m[1]] = m[2]
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('//') && !l.startsWith('@@'));
  }
  return out;
}

test('every enum in schema.prisma matches @kf/contracts exactly', () => {
  const schemaEnums = parseSchemaEnums(schemaText);

  for (const [name, members] of Object.entries(schemaEnums)) {
    assert.ok(name in ENUMS, `schema.prisma defines ${name}, which @kf/contracts does not`);
    assert.deepEqual(
      members,
      [...ENUMS[name]],
      `${name} members differ between schema.prisma and @kf/contracts`,
    );
  }
});

test('the two enums awaiting DISC-017 are absent from the schema', () => {
  const schemaEnums = parseSchemaEnums(schemaText);

  assert.deepEqual([...ENUMS_PENDING_DEFINITION].sort(), ['NotificationChannel', 'SyncStatus']);
  for (const pending of ENUMS_PENDING_DEFINITION) {
    assert.equal(
      pending in schemaEnums,
      false,
      `${pending} has no approved member set; PostgreSQL cannot hold a valueless enum`,
    );
  }
});

test('every other Part 8 enum IS in the schema — Blueprint §4 says "all"', () => {
  const schemaEnums = parseSchemaEnums(schemaText);
  const pending = new Set(ENUMS_PENDING_DEFINITION);
  const expected = Object.keys(ENUMS).filter((n) => !pending.has(n));

  assert.equal(expected.length, 14);
  for (const name of expected) {
    assert.ok(name in schemaEnums, `${name} is missing from schema.prisma`);
  }
});

test('MediaStatus uses the corrected spelling — DISC-018', () => {
  assert.match(schemaText, /enum MediaStatus \{/);
  assert.doesNotMatch(schemaText, /enum Media Status/);
});

// ===========================================================================
// Migration shape — the parts provable without applying it
// ===========================================================================

test('the migration chain starts at M-001 and creates no role — B-1', () => {
  assert.equal(migrationFiles.length, 1, 'M-001 is the only migration in this task');
  assert.match(migrationFiles[0], /m001_reference_data/);

  // The three statements that cannot work as kf_migrator (NOCREATEROLE) or at
  // all from a migration. Their home is infrastructure/postgres/bootstrap.sql.
  const sql = sqlOnly(migrationSql);
  assert.doesNotMatch(sql, /CREATE\s+ROLE/i);
  assert.doesNotMatch(sql, /CREATE\s+EXTENSION/i);
  assert.doesNotMatch(sql, /ALTER\s+ROLE/i);
});

test('every M-001 table declares GLOBAL_READ, enables RLS, and has a policy', () => {
  for (const table of M001_TABLES) {
    assert.match(
      migrationSql,
      new RegExp(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`),
      `${table} does not enable RLS`,
    );
    assert.match(
      migrationSql,
      new RegExp(`CREATE POLICY global_read ON "${table}"`),
      `${table} has no policy`,
    );
  }
  const annotations = migrationSql.match(/-- @kf-rls GLOBAL_READ/g) ?? [];
  assert.equal(annotations.length, M001_TABLES.length);
});

test('no GLOBAL_READ table is FORCED — the T-1 trap, ADR-010 §7', () => {
  // FORCE would subject kf_migrator to its own read-only policy and turn the
  // tier-1 seed into a silent no-op. The linter encodes this as a class rule.
  //
  // Comments are stripped first: the migration's own prose explains why FORCE is
  // absent, and naming it there must not read as using it.
  assert.doesNotMatch(sqlOnly(migrationSql), /FORCE\s+ROW\s+LEVEL\s+SECURITY/i);
});

test('the migration revokes no isolation — KF-S0-CI-003 R2.2', () => {
  const sql = sqlOnly(migrationSql);
  assert.doesNotMatch(sql, /DROP\s+POLICY/i);
  assert.doesNotMatch(sql, /DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
  assert.doesNotMatch(sql, /NO\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/i);
});

test('updated_at is maintained by a trigger, not only by Prisma Client', () => {
  // Prisma's @updatedAt is client-side. The seed writes raw SQL, so without the
  // trigger and the default the column would be wrong or the insert would fail.
  assert.match(migrationSql, /CREATE OR REPLACE FUNCTION set_updated_at\(\)/);
  for (const table of M001_TABLES) {
    assert.match(
      migrationSql,
      new RegExp(`CREATE TRIGGER ${table}_set_updated_at`),
      `${table} has no updated_at trigger`,
    );
    assert.match(
      migrationSql,
      new RegExp(`ALTER TABLE "${table}" ALTER COLUMN "updated_at" SET DEFAULT now\\(\\);`),
    );
  }
});

test('the annotation sits where the linter requires it — KF-S0-CI-003 R2.3', () => {
  // Last non-blank line before CREATE TABLE, i.e. directly under Prisma's own
  // marker. Checked structurally rather than by trusting the linter alone.
  const lines = migrationSql.split('\n');
  const creates = lines
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => /^CREATE TABLE "/.test(l.trim()));

  assert.equal(creates.length, M001_TABLES.length);
  for (const { l, i } of creates) {
    let j = i - 1;
    while (j >= 0 && lines[j].trim() === '') j -= 1;
    assert.equal(
      lines[j].trim(),
      '-- @kf-rls GLOBAL_READ',
      `the line above ${l.trim()} must be the class annotation, found: ${lines[j]}`,
    );
    assert.equal(
      lines[j - 1].trim(),
      '-- CreateTable',
      "Prisma's marker goes above the annotation",
    );
  }
});

test('the migration linter passes without --allow-empty', () => {
  const result = run('pnpm', ['lint:migrations']);
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  assert.match(result.stdout, /tables inspected: 6/);
  assert.match(result.stdout, /cross-check ACTIVE/, 'the manifest must no longer be inert');
  assert.match(result.stdout, /PASS/);
});

// ===========================================================================
// Manifest — DISC-012 closure
// ===========================================================================

test('the committed manifest is exactly what the generator emits', () => {
  const result = run(process.execPath, ['tooling/tenancy-manifest/generate.mjs', '--check']);
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
});

test('the manifest lists the six M-001 tables as global', () => {
  const manifest = fs.readFileSync(
    path.join(apiRoot, 'src', 'shared-kernel', 'tenancy', 'model-manifest.generated.ts'),
    'utf8',
  );
  for (const table of M001_TABLES) {
    assert.match(manifest, new RegExp(`'${table}'`), `${table} missing from the manifest`);
  }
  // Nothing is tenant-scoped yet; M-002 is the first.
  assert.match(manifest, /TENANT_SCOPED_TABLES: ReadonlySet<string> = new Set\(\[\]\)/);
});

test('the manifest carries no hand-written prose — DISC-012', () => {
  const manifest = fs.readFileSync(
    path.join(apiRoot, 'src', 'shared-kernel', 'tenancy', 'model-manifest.generated.ts'),
    'utf8',
  );
  assert.doesNotMatch(
    manifest,
    /EMPTY ON PURPOSE/,
    'the rationale moved into generate.mjs, where regeneration cannot delete it',
  );
  const generator = fs.readFileSync(
    path.join(repoRoot, 'tooling', 'tenancy-manifest', 'generate.mjs'),
    'utf8',
  );
  assert.match(generator, /SpikeChild/, 'the spike note must survive in the generator');
});

// ===========================================================================
// Provisioning — B-1's implementation
// ===========================================================================

test('bootstrap.sql is the single source for M-000, and dev calls it', () => {
  const bootstrap = fs.readFileSync(
    path.join(repoRoot, 'infrastructure', 'postgres', 'bootstrap.sql'),
    'utf8',
  );
  for (const ext of ['pgcrypto', 'pg_trgm', 'unaccent', 'pg_stat_statements']) {
    assert.match(bootstrap, new RegExp(`CREATE EXTENSION IF NOT EXISTS ${ext};`));
  }
  for (const role of ['kf_api', 'kf_worker', 'kf_migrator', 'kf_audit_writer']) {
    assert.match(bootstrap, new RegExp(`CREATE ROLE ${role} `));
  }
  assert.match(bootstrap, /uuid_generate_v7/, 'the v7 fallback must be defined before any table');

  // The dev init hook must delegate rather than hold its own copy.
  const initScript = fs.readFileSync(
    path.join(repoRoot, 'infrastructure', 'compose', 'postgres', 'init', '01-init-kinderflow.sh'),
    'utf8',
  );
  assert.match(initScript, /bootstrap\.sh/);
  assert.doesNotMatch(initScript, /CREATE ROLE/, 'dev must not keep a second copy of the DDL');
});

test('bootstrap.sql grants kf_migrator CREATE on the database, narrowly', () => {
  const bootstrap = sqlOnly(
    fs.readFileSync(path.join(repoRoot, 'infrastructure', 'postgres', 'bootstrap.sql'), 'utf8'),
  );

  // Required: without it `CREATE SCHEMA IF NOT EXISTS "public"` from
  // `prisma migrate deploy` fails 42501, because PostgreSQL checks CREATE on the
  // DATABASE before IF NOT EXISTS short-circuits.
  assert.match(
    bootstrap,
    /GRANT CREATE ON DATABASE %I TO kf_migrator/,
    'kf_migrator needs CREATE on the database for migrate deploy to work',
  );

  // And narrowly: ownership would also confer DROP DATABASE and ALTER DATABASE,
  // and in staging/production the provider owns the database, so reassigning it
  // may be impossible. The grant works everywhere; ownership does not.
  assert.doesNotMatch(
    bootstrap,
    /ALTER DATABASE[\s\S]*OWNER TO/i,
    'use the CREATE grant, not database ownership',
  );

  // The grant is for the DDL role alone.
  assert.doesNotMatch(bootstrap, /GRANT CREATE ON DATABASE %I TO kf_api/);
  assert.doesNotMatch(bootstrap, /GRANT CREATE ON DATABASE %I TO kf_worker/);
});

test('no role is granted more privilege to make a migration work', () => {
  const bootstrap = fs.readFileSync(
    path.join(repoRoot, 'infrastructure', 'postgres', 'bootstrap.sql'),
    'utf8',
  );
  // The least-privilege model is what makes RLS a real backstop in dev
  // (ADR-008, Sprint 0 Guide §2.1). B-1 was resolved by moving M-000, not by
  // relaxing this. Comments are stripped: the header says "RUN AS A SUPERUSER",
  // which describes the operator, not a grant.
  const sql = sqlOnly(bootstrap);

  // Every role attribute in the file must be a NO- form. Anything else would be
  // a privilege grant hiding in a role definition.
  for (const match of sql.matchAll(/\b(?<!NO)(SUPERUSER|CREATEROLE|CREATEDB|BYPASSRLS)\b/g)) {
    assert.fail(`bootstrap.sql grants ${match[1]} — B-1 must not be solved by escalation`);
  }

  for (const role of ['kf_api', 'kf_worker', 'kf_migrator', 'kf_audit_writer']) {
    assert.match(
      sql,
      new RegExp(`ALTER ROLE ${role}\\s+NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;`),
      `${role}'s attributes must be re-asserted on every run`,
    );
  }
});
