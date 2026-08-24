/**
 * KF-S0-RLS-001 (TR-10) — worker parity probes. Spike-only.
 *
 * Runs probes 1-3 through a REAL BullMQ queue against the REAL Redis in the dev
 * stack (decision D-21). A simulated async boundary would not answer the actual
 * question, which is whether AsyncLocalStorage survives a genuine BullMQ
 * processor — a job is deserialised on a different tick, on a different call
 * stack, with no relationship to the enqueuing context.
 *
 * Run: node --experimental-strip-types apps/api/src/spike/worker-probes.ts
 */
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { makeSpikeClient } from '../shared-kernel/tenancy/spike-db.ts';
import { withTenancy } from '../shared-kernel/tenancy/prisma-tenancy.ts';
import { tenantProcessor, MissingJobTenantError } from '../shared-kernel/tenancy/worker-tenancy.ts';
import { getTenantStore } from '../shared-kernel/tenancy/tenant-context.ts';
import { TenantContextMissingError } from '../shared-kernel/tenancy/tenancy-errors.ts';

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const QUEUE = 'kf-spike-tenancy';

const redisUrl = process.env.KF_REDIS_URL ?? 'redis://localhost:16379';
const url = new URL(redisUrl);
// BullMQ 6 requires an explicitly constructed ioredis client under native ESM.
// Passing plain connection options throws "could not load the optional
// 'ioredis' package". Recorded for KF-S0-API-002.
const connection = new IORedis({
  host: url.hostname,
  port: Number(url.port || 6379),
  maxRetriesPerRequest: null,
});

interface SpikeDelegate {
  count: (args?: unknown) => Promise<number>;
  findMany: (args?: unknown) => Promise<unknown[]>;
}
interface Db {
  spikeChild: SpikeDelegate;
}

const results: { id: string; ok: boolean; detail: string }[] = [];
function record(id: string, ok: boolean, detail: string) {
  results.push({ id, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`);
}
const section = (t: string) => console.log(`\n########## ${t} ##########`);

interface JobResult {
  tenantId: string;
  contextTenant: string | undefined;
  rowTenants: string[];
  unscopedThrew: string | null;
}

async function main() {
  console.log('KF-S0-RLS-001 — worker parity probes (real BullMQ + real Redis)');
  console.log(`  redis: ${redisUrl}`);

  const base = makeSpikeClient({ max: 8 });
  const db = withTenancy(base as never) as unknown as Db;

  const queue = new Queue(QUEUE, { connection });
  await queue.obliterate({ force: true }).catch(() => undefined);

  const worker = new Worker<{ tenantId: string }, JobResult>(
    QUEUE,
    tenantProcessor(base, async (job): Promise<JobResult> => {
      const store = getTenantStore();

      const rows = (await db.spikeChild.findMany({ select: { tenantId: true } })) as {
        tenantId: string;
      }[];

      return {
        tenantId: job.data.tenantId,
        contextTenant: store?.tenantId,
        rowTenants: [...new Set(rows.map((r) => r.tenantId))],
        unscopedThrew: null,
      };
    }),
    { connection, concurrency: 8 },
  );

  await worker.waitUntilReady();

  // --- W1: context is established from the job payload ----------------------
  section('WORKER PROBE 1 — tenant context established inside a real processor');
  const j1 = await queue.add('read', { tenantId: TENANT_A });

  // Poll rather than waitUntilFinished: that helper needs a separate
  // QueueEvents instance in BullMQ 6, and the spike does not need one.
  async function awaitJob(id: string, ms = 60_000): Promise<JobResult> {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const fresh = await queue.getJob(id);
      const state = await fresh?.getState();
      if (state === 'completed') return fresh!.returnvalue as JobResult;
      if (state === 'failed') throw new Error(`job failed: ${fresh?.failedReason}`);
      await new Promise((res) => setTimeout(res, 200));
    }
    throw new Error('timed out waiting for job');
  }

  const r1 = await awaitJob(j1.id!);

  record(
    'W1.1-context-in-worker',
    r1.contextTenant === TENANT_A,
    `AsyncLocalStorage inside processor saw "${r1.contextTenant}"`,
  );
  record(
    'W1.2-worker-scoped-read',
    r1.rowTenants.length === 1 && r1.rowTenants[0] === TENANT_A,
    `rows visible to the job: [${r1.rowTenants.join(', ')}]`,
  );

  // --- W2: alternating tenants across concurrent jobs -----------------------
  section('WORKER PROBE 2 — interleaved mixed-tenant jobs, zero cross-tenant');
  const N = 200;
  const jobs = await Promise.all(
    Array.from({ length: N }, (_u, i) =>
      queue.add('read', { tenantId: i % 2 === 0 ? TENANT_A : TENANT_B }),
    ),
  );

  const collected: JobResult[] = [];
  const deadline = Date.now() + 120_000;
  while (collected.length < N && Date.now() < deadline) {
    collected.length = 0;
    for (const j of jobs) {
      const fresh = await queue.getJob(j.id!);
      const state = await fresh?.getState();
      if (state === 'completed') collected.push(fresh!.returnvalue as JobResult);
      if (state === 'failed') throw new Error(`job failed: ${fresh?.failedReason}`);
    }
    if (collected.length < N) await new Promise((res) => setTimeout(res, 300));
  }

  const cross = collected.filter(
    (r) => r.rowTenants.some((t) => t !== r.tenantId) || r.contextTenant !== r.tenantId,
  );
  record(
    'W2.1-zero-cross-tenant-jobs',
    collected.length === N && cross.length === 0,
    `${collected.length}/${N} jobs completed, ${cross.length} with cross-tenant rows or wrong context`,
  );

  // --- W3: a job with no tenant must fail, not run unscoped ------------------
  section('WORKER PROBE 3 — job without tenantId fails loudly');
  let missingErr = '';
  const bad = tenantProcessor(base, async () => 'should not run');
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await bad({ name: 'no-tenant', data: {} } as any);
  } catch (e) {
    missingErr = (e as Error).name;
  }
  record(
    'W3.1-missing-tenant-job-throws',
    missingErr === 'MissingJobTenantError',
    `threw ${missingErr || 'nothing'}`,
  );
  void MissingJobTenantError;

  // --- W4: outside any processor, the guard still bites ---------------------
  let outsideErr = '';
  try {
    await db.spikeChild.count();
  } catch (e) {
    outsideErr = (e as Error).name;
  }
  record(
    'W4.1-unscoped-in-worker-process-throws',
    outsideErr === 'TenantContextMissingError',
    `threw ${outsideErr || 'nothing'}`,
  );
  void TenantContextMissingError;

  section('SUMMARY');
  const failed = results.filter((r) => !r.ok);
  for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.id}`);
  console.log(`\n  ${results.length - failed.length}/${results.length} worker probes passed`);

  await worker.close();
  await queue.obliterate({ force: true }).catch(() => undefined);
  await queue.close();
  await base.$disconnect();

  if (failed.length > 0) process.exitCode = 1;
}

await main();
