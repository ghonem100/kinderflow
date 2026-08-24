/**
 * KF-S0-RLS-001 (TR-10) — benchmark. Spike deliverable, requirement 6 / AC4.
 *
 * Measures the cost of the tenancy wrapper on the two hot paths named in the
 * Sprint 0 Guide: a roster read and an event insert.
 *
 * FAIRNESS — this took two attempts and the first was wrong, so the design is
 * spelled out:
 *
 *  - Baseline and wrapped run on the SAME PrismaClient and the SAME pool. A
 *    first version compared a bare `pg` pool against Prisma's pool and produced
 *    nonsense (baseline p95 1085ms vs wrapped 16ms) because it was measuring
 *    two different queues, not the wrapper.
 *  - The baseline targets no-RLS TWIN TABLES of identical shape. An unwrapped
 *    baseline against an RLS table is impossible: reads return zero rows and
 *    writes fail WITH CHECK. That is fail-closed working correctly, and it
 *    means "unwrapped on the real table" is not a measurable state.
 *  - Both paths are warmed before measurement so connection establishment does
 *    not land inside the samples.
 *
 * So the number reported is: transaction + SET LOCAL + extension dispatch + RLS
 * policy evaluation, versus the same query with none of it.
 *
 * Budget (Guide §11): <=15% p95 overhead. Exceeding it triggers decision-matrix
 * option B and must be reported, not rounded away.
 *
 * Run: node --experimental-strip-types apps/api/src/spike/bench.ts
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { makeSpikeClient } from '../shared-kernel/tenancy/spike-db.ts';
import { withTenancy, withTenant } from '../shared-kernel/tenancy/prisma-tenancy.ts';

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MIGRATOR_URL =
  process.env.KF_DATABASE_MIGRATION_URL ??
  'postgresql://kf_migrator:dev_only_migrator@localhost:15432/kf_dev';

const TARGET_RPS = 200;
const DURATION_MS = 10_000;
const POOL = 20;
const WARMUP = 100;
/** Repetitions per scenario; the median p95 is reported. See measure(). */
const REPS = 3;

interface Delegate {
  findMany: (args?: unknown) => Promise<unknown[]>;
  create: (args?: unknown) => Promise<unknown>;
}
interface Db {
  spikeChild: Delegate;
  spikeAttendanceEvent: Delegate;
  spikeChildNoRls: Delegate;
  spikeEventNoRls: Delegate;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx]!;
}

interface Stats {
  n: number;
  errors: number;
  p50: number;
  p95: number;
  p99: number;
  mean: number;
  rps: number;
}

function summarise(samples: number[], errors: number, elapsedMs: number): Stats {
  const s = [...samples].sort((a, b) => a - b);
  return {
    n: s.length,
    errors,
    p50: percentile(s, 50),
    p95: percentile(s, 95),
    p99: percentile(s, 99),
    mean: s.reduce((a, b) => a + b, 0) / (s.length || 1),
    rps: (s.length / elapsedMs) * 1000,
  };
}

/**
 * Runs a scenario REPS times and returns the median run by p95.
 *
 * A single run on this host is not reproducible: two consecutive runs of the
 * identical baseline produced p95 2.90ms and p95 287ms. That is the same
 * unexplained host I/O variance recorded as R-13/O-9, not a property of the
 * code under test. Reporting one run would be reporting noise, so each scenario
 * is repeated and the median taken, with the spread printed so the reader can
 * see how much to trust the figure.
 */
async function measure(label: string, op: () => Promise<void>): Promise<Stats> {
  const runs: Stats[] = [];
  for (let r = 0; r < REPS; r += 1) runs.push(await drive(op));
  runs.sort((a, b) => a.p95 - b.p95);
  const med = runs[Math.floor(runs.length / 2)]!;
  const spread = `${runs[0]!.p95.toFixed(1)}..${runs[runs.length - 1]!.p95.toFixed(1)}`;
  console.log(
    `  ${label.padEnd(32)} n=${String(med.n).padStart(5)} err=${String(med.errors).padStart(3)}  ` +
      `p50=${med.p50.toFixed(2)}  p95=${med.p95.toFixed(2)}  p99=${med.p99.toFixed(2)} ms  ` +
      `${med.rps.toFixed(0)}rps   [p95 across ${REPS} runs: ${spread}]`,
  );
  return med;
}

/** Open-loop driver: launches on a schedule so queueing shows up as latency. */
async function drive(op: () => Promise<void>): Promise<Stats> {
  for (let i = 0; i < WARMUP; i += 1) await op();

  const samples: number[] = [];
  const inFlight: Promise<void>[] = [];
  let errors = 0;
  const intervalMs = 1000 / TARGET_RPS;
  const started = Date.now();
  let scheduled = 0;

  while (Date.now() - started < DURATION_MS) {
    const due = started + scheduled * intervalMs;
    const wait = due - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    scheduled += 1;

    const t0 = process.hrtime.bigint();
    inFlight.push(
      op()
        .then(() => {
          samples.push(Number(process.hrtime.bigint() - t0) / 1e6);
        })
        .catch(() => {
          errors += 1;
        }),
    );
  }
  await Promise.all(inFlight);
  return summarise(samples, errors, Date.now() - started);
}

const pct = (wrapped: number, base: number) => ((wrapped - base) / base) * 100;

async function main() {
  console.log('KF-S0-RLS-001 — TR-10 benchmark');
  console.log(
    `  ${TARGET_RPS} rps target, ${DURATION_MS / 1000}s per scenario, pool ${POOL}, warmup ${WARMUP}`,
  );
  console.log('  baseline = identical query on a no-RLS twin table, same client, same pool');
  console.log('  budget: p95 overhead <= 15% (Sprint 0 Guide §11)\n');

  // Fresh state: a previous run's inserts must not skew the next one. Done as
  // kf_migrator because TRUNCATE is an owner operation (and, on the RLS table,
  // a DELETE with no tenant context would silently remove nothing — probe P7.2).
  const admin = new pg.Client({ connectionString: MIGRATOR_URL });
  await admin.connect();
  await admin.query('TRUNCATE spike_event_norls, spike_attendance_event');
  await admin.end();

  const prisma = makeSpikeClient({ max: POOL });
  const db = withTenancy(prisma as never) as unknown as Db;

  console.log('ROSTER READ (50 rows)');
  const baseRead = await measure('baseline  no RLS, no tx', async () => {
    await db.spikeChildNoRls.findMany({
      where: { tenantId: TENANT_A },
      take: 50,
      select: { id: true, fullName: true },
    });
  });
  const wrapRead = await measure('wrapped   withTenant + RLS', async () => {
    await withTenant(prisma as never, TENANT_A, async () => {
      await db.spikeChild.findMany({ take: 50, select: { id: true, fullName: true } });
    });
  });

  console.log('\nEVENT INSERT');
  const baseWrite = await measure('baseline  no RLS, no tx', async () => {
    await db.spikeEventNoRls.create({
      data: { tenantId: TENANT_A, childId: randomUUID(), direction: 'CHECK_IN' },
    });
  });
  const wrapWrite = await measure('wrapped   withTenant + RLS', async () => {
    await withTenant(prisma as never, TENANT_A, async () => {
      await db.spikeAttendanceEvent.create({
        data: { childId: randomUUID(), direction: 'CHECK_IN' },
      });
    });
  });

  // Is the overhead a FIXED per-operation cost (extra round trips for BEGIN /
  // set_config / COMMIT) or does it scale with the work done? This decides
  // whether the percentage above is alarming or merely an artefact of a very
  // cheap baseline — and therefore what option B should actually do.
  console.log('\nHEAVIER READ (all rows, all columns) — same comparison');
  const baseHeavy = await measure('baseline  no RLS, no tx', async () => {
    await db.spikeChildNoRls.findMany({ where: { tenantId: TENANT_A } });
  });
  const wrapHeavy = await measure('wrapped   withTenant + RLS', async () => {
    await withTenant(prisma as never, TENANT_A, async () => {
      await db.spikeChild.findMany({});
    });
  });

  console.log('\nPOOL HOLD TIME (how long a tenant tx keeps a connection out of the pool)');
  const holds: number[] = [];
  for (let i = 0; i < 300; i += 1) {
    const t0 = process.hrtime.bigint();
    await withTenant(prisma as never, TENANT_A, async () => {
      await db.spikeChild.findMany({ take: 50, select: { id: true } });
    });
    holds.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  const hold = summarise(holds, 0, 1000);
  console.log(
    `  ${'connection held per tenant tx'.padEnd(32)} ` +
      `p50=${hold.p50.toFixed(2)}  p95=${hold.p95.toFixed(2)}  p99=${hold.p99.toFixed(2)} ms`,
  );

  const readP95 = pct(wrapRead.p95, baseRead.p95);
  const writeP95 = pct(wrapWrite.p95, baseWrite.p95);
  const worst = Math.max(readP95, writeP95);

  console.log('\nOVERHEAD vs BASELINE');
  console.log(
    `  roster read   p50 ${pct(wrapRead.p50, baseRead.p50).toFixed(1)}%  ` +
      `p95 ${readP95.toFixed(1)}%  p99 ${pct(wrapRead.p99, baseRead.p99).toFixed(1)}%`,
  );
  console.log(
    `  event insert  p50 ${pct(wrapWrite.p50, baseWrite.p50).toFixed(1)}%  ` +
      `p95 ${writeP95.toFixed(1)}%  p99 ${pct(wrapWrite.p99, baseWrite.p99).toFixed(1)}%`,
  );
  console.log(
    `  heavier read  p50 ${pct(wrapHeavy.p50, baseHeavy.p50).toFixed(1)}%  ` +
      `p95 ${pct(wrapHeavy.p95, baseHeavy.p95).toFixed(1)}%  ` +
      `p99 ${pct(wrapHeavy.p99, baseHeavy.p99).toFixed(1)}%`,
  );

  // Absolute deltas matter more than ratios when the baseline is ~3ms.
  console.log('\nABSOLUTE p95 DELTA (ms added by the wrapper)');
  console.log(`  roster read (50 rows)  +${(wrapRead.p95 - baseRead.p95).toFixed(2)} ms`);
  console.log(`  event insert           +${(wrapWrite.p95 - baseWrite.p95).toFixed(2)} ms`);
  console.log(`  heavier read           +${(wrapHeavy.p95 - baseHeavy.p95).toFixed(2)} ms`);
  console.log(
    '  If these deltas are similar, the cost is FIXED per operation (BEGIN +\n' +
      '  set_config + COMMIT round trips), not proportional to the work done.',
  );

  console.log(`\n  worst p95 overhead: ${worst.toFixed(1)}%   (budget 15%)`);
  console.log(
    worst <= 15
      ? '  VERDICT: within budget — decision-matrix option A stands.'
      : '  VERDICT: OVER BUDGET — decision-matrix option B triggered. See ADR-010.',
  );

  await prisma.$disconnect();
}

await main();
