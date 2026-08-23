/**
 * KF-S0-RLS-001 (TR-10) — probe suite. Spike-only; does not merge to main.
 *
 * Every probe is named, prints PASS/FAIL, and is designed so that it CAN fail.
 * Probe 2 carries a deliberate negative control (decision D-23): if the leak
 * detector cannot catch a real leak, its clean result proves nothing.
 *
 * Run: node --experimental-strip-types apps/api/src/spike/probes.ts
 */
import pg from 'pg';
import { makeSpikeClient } from '../shared-kernel/tenancy/spike-db.ts';
import { withTenancy, withTenant } from '../shared-kernel/tenancy/prisma-tenancy.ts';
import { getTenantStore } from '../shared-kernel/tenancy/tenant-context.ts';
import { TenantContextMissingError } from '../shared-kernel/tenancy/tenancy-errors.ts';

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const API_URL =
  process.env.KF_DATABASE_URL ?? 'postgresql://kf_api:dev_only_api@localhost:15432/kf_dev';
const MIGRATOR_URL =
  process.env.KF_DATABASE_MIGRATION_URL ??
  'postgresql://kf_migrator:dev_only_migrator@localhost:15432/kf_dev';

interface SpikeDelegate {
  count: (args?: unknown) => Promise<number>;
  findMany: (args?: unknown) => Promise<unknown[]>;
  create: (args?: unknown) => Promise<unknown>;
}
/** Precise shape so noUncheckedIndexedAccess does not fight the spike. */
interface Db {
  spikeChild: SpikeDelegate;
  spikeAttendanceEvent: SpikeDelegate;
}

const results: { id: string; ok: boolean; detail: string }[] = [];
function record(id: string, ok: boolean, detail: string) {
  results.push({ id, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`);
}
const section = (t: string) => console.log(`\n########## ${t} ##########`);

// ---------------------------------------------------------------------------
// Seeding. This is finding T-1 in practice: FORCE ROW LEVEL SECURITY strips the
// owner's exemption, so even kf_migrator must satisfy the policy. Path (i) —
// set app.tenant_id per row-group — is exercised here.
// ---------------------------------------------------------------------------
async function seed() {
  const c = new pg.Client({ connectionString: MIGRATOR_URL });
  await c.connect();
  // TRUNCATE, not DELETE. Under FORCE ROW LEVEL SECURITY a DELETE with no
  // app.tenant_id set matches no rows and reports success — see probe P7.2.
  // TRUNCATE is a table-level owner operation and is not subject to RLS.
  await c.query('BEGIN');
  await c.query('TRUNCATE spike_attendance_event, spike_child, spike_organization');
  for (const [tenant, label] of [
    [TENANT_A, 'A'],
    [TENANT_B, 'B'],
  ]) {
    await c.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenant]);
    await c.query('INSERT INTO spike_organization (id, name) VALUES ($1, $2)', [
      tenant,
      `Tenant ${label}`,
    ]);
    for (let i = 0; i < 25; i += 1) {
      await c.query('INSERT INTO spike_child (tenant_id, full_name) VALUES ($1, $2)', [
        tenant,
        `${label}-child-${i}`,
      ]);
    }
  }
  await c.query('COMMIT');
  await c.end();
}

// ---------------------------------------------------------------------------
async function probe1_missingContext() {
  section('PROBE 1 — missing context throws, and emits ZERO SQL (AC1)');
  const base = makeSpikeClient({ logQueries: true });
  const db = withTenancy(base as never) as unknown as Db;

  const sql: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (base as any).$on('query', (e: { query: string }) => sql.push(e.query));

  // Warm the event wiring so "zero" cannot be an artefact of a silent logger.
  await base.$queryRaw`SELECT 1`;
  const afterWarmup = sql.length;
  record('P1.0-logger-live', afterWarmup > 0, `query log captured ${afterWarmup} statement(s)`);

  const before = sql.length;
  let threw: unknown;
  try {
    await db.spikeChild.findMany();
  } catch (e) {
    threw = e;
  }
  const emitted = sql.length - before;

  record(
    'P1.1-throws-typed',
    threw instanceof TenantContextMissingError,
    `threw ${(threw as Error)?.name ?? 'nothing'}`,
  );
  record('P1.2-zero-sql', emitted === 0, `${emitted} SQL statement(s) emitted after the call`);

  await base.$disconnect();
}

// ---------------------------------------------------------------------------
async function probe2_poolLeak() {
  section('PROBE 2 — no app.tenant_id survives a connection checkout (+ D-23 control)');

  // Single connection, so the same physical socket is reused and a leak would
  // actually be observable. A large pool would hide it by luck.
  const pool = new pg.Pool({ connectionString: API_URL, max: 1 });

  // --- negative control: a deliberate plain SET (session-scoped) MUST leak ---
  {
    const c = await pool.connect();
    await c.query(`SET app.tenant_id = '${TENANT_A}'`); // NOT SET LOCAL — on purpose
    c.release();
    const c2 = await pool.connect();
    const r = await c2.query(`SELECT current_setting('app.tenant_id', true) AS t`);
    c2.release();
    const leaked = r.rows[0].t;
    record(
      'P2.0-negative-control',
      leaked === TENANT_A,
      leaked === TENANT_A
        ? `detector works: plain SET leaked "${leaked}" across checkout`
        : `detector is BLIND — plain SET did not leak (saw "${leaked}")`,
    );
    // Clear it so the real test starts from a known state.
    const c3 = await pool.connect();
    await c3.query(`RESET app.tenant_id`);
    c3.release();
  }

  // --- the real test: SET LOCAL inside a transaction must NOT survive ---
  {
    const c = await pool.connect();
    await c.query('BEGIN');
    await c.query(`SELECT set_config('app.tenant_id', $1, true)`, [TENANT_B]);
    const inside = (await c.query(`SELECT current_setting('app.tenant_id', true) AS t`)).rows[0].t;
    await c.query('COMMIT');
    c.release();

    const c2 = await pool.connect();
    const after = (await c2.query(`SELECT current_setting('app.tenant_id', true) AS t`)).rows[0].t;
    c2.release();

    record('P2.1-set-local-visible-inside', inside === TENANT_B, `inside transaction: "${inside}"`);
    record(
      'P2.2-no-leak-after-checkout',
      after === null || after === '',
      `after release+reacquire: ${after === null ? 'NULL' : `"${after}"`}`,
    );
  }

  await pool.end();
}

// ---------------------------------------------------------------------------
async function probe3_concurrentInterleaving() {
  section('PROBE 3 — 100 concurrent alternating tenants, >=10,000 ops (AC2)');
  const base = makeSpikeClient({ max: 10 });
  const db = withTenancy(base as never) as unknown as Db;

  const WORKERS = 100;
  const OPS_PER_WORKER = 100; // 100 * 100 = 10,000
  let crossTenant = 0;
  let totalRows = 0;
  let ops = 0;

  const started = Date.now();
  await Promise.all(
    Array.from({ length: WORKERS }, async (_unused, w) => {
      for (let i = 0; i < OPS_PER_WORKER; i += 1) {
        // Alternate so both tenants are in flight on the same pool at once.
        const tenant = (w + i) % 2 === 0 ? TENANT_A : TENANT_B;
        await withTenant(
          base as never,
          tenant,
          async () => {
            const rows = (await db.spikeChild.findMany({ select: { tenantId: true } })) as {
              tenantId: string;
            }[];
            totalRows += rows.length;
            for (const r of rows) if (r.tenantId !== tenant) crossTenant += 1;
          },
          { origin: 'http' },
        );
        ops += 1;
      }
    }),
  );
  const elapsed = Date.now() - started;

  record(
    'P3.1-zero-cross-tenant',
    crossTenant === 0,
    `${ops} ops, ${totalRows} rows read, ${crossTenant} cross-tenant rows, ${elapsed}ms`,
  );
  record('P3.2-op-count', ops >= 10_000, `${ops} operations (requirement: >=10,000)`);
  record('P3.3-rows-nonzero', totalRows > 0, `${totalRows} rows — probe actually read data`);

  await base.$disconnect();
}

// ---------------------------------------------------------------------------
async function probe4_nestedTransaction() {
  section('PROBE 4 — nested transaction behaviour');
  const base = makeSpikeClient();
  const db = withTenancy(base as never) as unknown as Db;

  // Nested withTenant for the SAME tenant.
  try {
    const n = await withTenant(base as never, TENANT_A, async () => {
      return withTenant(base as never, TENANT_A, async () => db.spikeChild.count());
    });
    record('P4.1-nested-same-tenant', true, `completed, inner count=${String(n)}`);
  } catch (e) {
    record('P4.1-nested-same-tenant', false, `threw ${(e as Error).message.slice(0, 90)}`);
  }

  // Nested withTenant switching tenant — the dangerous case.
  try {
    const seen = await withTenant(base as never, TENANT_A, async () => {
      return withTenant(base as never, TENANT_B, async () => {
        const rows = (await db.spikeChild.findMany({ select: { tenantId: true } })) as {
          tenantId: string;
        }[];
        return new Set(rows.map((r) => r.tenantId));
      });
    });
    const only = [...seen];
    record(
      'P4.2-nested-tenant-switch',
      only.length <= 1 && (only[0] === TENANT_B || only.length === 0),
      `inner saw tenants: [${only.join(', ') || 'none'}] (expected only B)`,
    );
  } catch (e) {
    record('P4.2-nested-tenant-switch', true, `rejected: ${(e as Error).name}`);
  }

  await base.$disconnect();
}

// ---------------------------------------------------------------------------
async function probe5_streaming() {
  section('PROBE 5 — long-running / streaming query behaviour');
  const base = makeSpikeClient();
  const db = withTenancy(base as never) as unknown as Db;

  // A slow statement inside the tenant transaction: does the context hold for
  // the whole duration, and does the interactive-transaction timeout bite?
  try {
    const t0 = Date.now();
    const out = await withTenant(
      base as never,
      TENANT_A,
      async () => {
        // Raw SQL must go through the TRANSACTION client, not the base client.
        // A raw query on the base client runs on a different connection with no
        // app.tenant_id, so RLS fails it closed — a real limitation, recorded
        // in ADR-010. `::text` because pg_sleep returns void, which Prisma
        // cannot deserialise.
        const store = getTenantStore()!;
        const tx = store.tx as unknown as {
          $queryRaw: (s: TemplateStringsArray, ...v: unknown[]) => Promise<unknown>;
        };
        await tx.$queryRaw`SELECT pg_sleep(1.5)::text AS slept`;
        const rows = (await db.spikeChild.findMany({ select: { tenantId: true } })) as {
          tenantId: string;
        }[];
        return rows;
      },
      { timeout: 20_000 },
    );
    const bad = out.filter((r) => r.tenantId !== TENANT_A).length;
    record(
      'P5.1-context-survives-slow-query',
      bad === 0 && out.length > 0,
      `${out.length} rows after a 1.5s in-transaction sleep, ${bad} cross-tenant, ${Date.now() - t0}ms`,
    );
  } catch (e) {
    record(
      'P5.1-context-survives-slow-query',
      false,
      `threw ${(e as Error).message.slice(0, 100)}`,
    );
  }

  // Cursor-style batched read, still inside one tenant transaction.
  try {
    const batches = await withTenant(base as never, TENANT_A, async () => {
      let seen = 0;
      let cross = 0;
      for (let skip = 0; ; skip += 10) {
        const page = (await db.spikeChild.findMany({
          take: 10,
          skip,
          orderBy: { createdAt: 'asc' },
          select: { tenantId: true },
        })) as { tenantId: string }[];
        if (page.length === 0) break;
        seen += page.length;
        cross += page.filter((r) => r.tenantId !== TENANT_A).length;
      }
      return { seen, cross };
    });
    record(
      'P5.2-paged-read-stays-scoped',
      batches.cross === 0 && batches.seen > 0,
      `${batches.seen} rows across pages, ${batches.cross} cross-tenant`,
    );
  } catch (e) {
    record('P5.2-paged-read-stays-scoped', false, `threw ${(e as Error).message.slice(0, 100)}`);
  }

  await base.$disconnect();
}

// ---------------------------------------------------------------------------
async function probe6_directSql() {
  section('PROBE 6 — direct SQL as kf_api (AC3)');
  const c = new pg.Client({ connectionString: API_URL });
  await c.connect();
  await c.query('BEGIN');
  await c.query(`SELECT set_config('app.tenant_id', $1, true)`, [TENANT_A]);

  const b = await c.query('SELECT count(*)::int AS n FROM spike_child WHERE tenant_id = $1', [
    TENANT_B,
  ]);
  record(
    'P6.1-select-other-tenant-returns-zero',
    b.rows[0].n === 0,
    `SELECT on tenant B rows returned ${b.rows[0].n} rows (expected 0, not an error)`,
  );

  let insertErr = '';
  try {
    await c.query('INSERT INTO spike_child (tenant_id, full_name) VALUES ($1, $2)', [
      TENANT_B,
      'smuggled',
    ]);
  } catch (e) {
    insertErr = (e as Error).message;
  }
  record(
    'P6.2-insert-other-tenant-fails-with-check',
    /row-level security/i.test(insertErr),
    insertErr ? insertErr.slice(0, 90) : 'INSERT SUCCEEDED — BAD',
  );

  await c.query('ROLLBACK');

  // Sanity: the role really has no BYPASSRLS.
  const r = await c.query(
    `SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user`,
  );
  record(
    'P6.3-role-has-no-bypassrls',
    r.rows[0].rolbypassrls === false && r.rows[0].rolsuper === false,
    `bypassrls=${r.rows[0].rolbypassrls} superuser=${r.rows[0].rolsuper}`,
  );
  await c.end();
}

// ---------------------------------------------------------------------------
// D-24 / T-1: three candidate seeding paths, tested rather than argued.
// ---------------------------------------------------------------------------
async function probe7_seedingPaths() {
  section('PROBE 7 — T-1 seeding paths under FORCE ROW LEVEL SECURITY (D-24)');

  // Reproduction first: the failure the spec requires as evidence.
  {
    const c = new pg.Client({ connectionString: MIGRATOR_URL });
    await c.connect();
    let err = '';
    try {
      await c.query('BEGIN');
      await c.query('INSERT INTO spike_child (tenant_id, full_name) VALUES ($1, $2)', [
        TENANT_A,
        'no-context-seed',
      ]);
      await c.query('COMMIT');
    } catch (e) {
      err = (e as Error).message;
      await c.query('ROLLBACK');
    }
    record(
      'P7.0-repro-owner-insert-blocked',
      /row-level security/i.test(err),
      err ? err.slice(0, 88) : 'INSERT SUCCEEDED — FORCE not in effect',
    );
    await c.end();
  }

  // Path (i): migration sets app.tenant_id per row-group.
  {
    const c = new pg.Client({ connectionString: MIGRATOR_URL });
    await c.connect();
    let ok = false;
    let detail = '';
    try {
      await c.query('BEGIN');
      await c.query(`SELECT set_config('app.tenant_id', $1, true)`, [TENANT_A]);
      await c.query('INSERT INTO spike_child (tenant_id, full_name) VALUES ($1, $2)', [
        TENANT_A,
        'path-i-seed',
      ]);
      await c.query('ROLLBACK');
      ok = true;
      detail = 'INSERT accepted with app.tenant_id set per row-group';
    } catch (e) {
      detail = (e as Error).message.slice(0, 88);
      await c.query('ROLLBACK');
    }
    record('P7.1-path-i-set-config-per-group', ok, detail);
    await c.end();
  }

  // Path (ii) hazard: DELETE/UPDATE with no context is a SILENT no-op.
  // No error is raised — the statement simply matches nothing. This is the
  // most dangerous shape of T-1 because a data migration appears to succeed.
  {
    const c = new pg.Client({ connectionString: MIGRATOR_URL });
    await c.connect();
    await c.query('BEGIN');
    const del = await c.query('DELETE FROM spike_child');
    await c.query('ROLLBACK');
    const total = await c.query('SELECT count(*)::int AS n FROM spike_child');
    record(
      'P7.2-delete-without-context-is-silent-noop',
      del.rowCount === 0,
      `DELETE with no app.tenant_id removed ${del.rowCount} rows and raised NO error ` +
        `(rows still present under a context: see seed count)`,
    );
    await c.end();
    void total;
  }

  // Path (iii): a role that the table does NOT force RLS against.
  // FORCE applies to the owner too, so the only role exempt is one with
  // BYPASSRLS — which ADR-008 forbids in the app path. Test whether a
  // non-forced escape exists at all.
  {
    const c = new pg.Client({ connectionString: MIGRATOR_URL });
    await c.connect();
    const r = await c.query(
      `SELECT relforcerowsecurity FROM pg_class WHERE relname = 'spike_child'`,
    );
    const forced = r.rows[0].relforcerowsecurity;
    record(
      'P7.3-path-iii-requires-bypassrls',
      forced === true,
      forced
        ? 'FORCE is on, so no owner exemption exists — path (iii) would need a BYPASSRLS role (ADR-008 forbids it in the app path)'
        : 'FORCE unexpectedly off',
    );
    await c.end();
  }
}

// ---------------------------------------------------------------------------
async function main() {
  console.log('KF-S0-RLS-001 — TR-10 probe suite');
  console.log(`  tenant A = ${TENANT_A}`);
  console.log(`  tenant B = ${TENANT_B}`);

  section('SEED (exercises T-1 path (i) — set_config per row-group)');
  await seed();
  record('P0-seed', true, '2 tenants x 25 children inserted as kf_migrator under FORCE RLS');

  await probe1_missingContext();
  await probe2_poolLeak();
  await probe6_directSql();
  await probe4_nestedTransaction();
  await probe5_streaming();
  await probe7_seedingPaths();
  await probe3_concurrentInterleaving();

  section('SUMMARY');
  const failed = results.filter((r) => !r.ok);
  for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.id}`);
  console.log(`\n  ${results.length - failed.length}/${results.length} probes passed`);
  if (failed.length > 0) {
    console.log(`  FAILED: ${failed.map((f) => f.id).join(', ')}`);
    process.exitCode = 1;
  }
}

await main();
