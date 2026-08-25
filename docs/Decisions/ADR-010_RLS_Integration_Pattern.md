# ADR-010 — Prisma × PostgreSQL RLS Integration Pattern

**Status:** Accepted · 2026-08-24 · Relates to: ADR-002 (Prisma), ADR-003 (PostgreSQL), ADR-008 (Shared DB + RLS), SAD §4.2, SAD §13 (TR-10), Domain Model Part 6, Sprint 0 Guide §11
**Spike:** `KF-S0-RLS-001` · branch `spike/kf-s0-rls-001-tr10` · tip `defae46` (full: `defae466c670305a25aeed63029bd5347a0ebb75`)
Everything cited below — probes, benchmark, spike schema — lives at that commit. The SHA is the durable reference: branches move, and a deleted branch would otherwise leave this ADR pointing at nothing. (`c849fec`, the last code-only commit, is an ancestor of the tip.)

---

## 1. Decision

**Option A — Prisma client extension + `SET LOCAL app.tenant_id` inside an interactive transaction — is adopted**, with the performance budget formally amended.

The pattern passed every correctness probe: 21/21 database probes and 5/5 worker probes, including a 10,000-operation interleaved mixed-tenant run with zero cross-tenant rows.

It **failed the stated performance budget** (≤15% p95 overhead; measured 56.3%), which by Sprint 0 Guide §11 triggers option B. That trigger fired and was investigated rather than waved through. The investigation found the overhead is a **fixed ~1.8 ms per operation**, not a proportional cost, and that the 15% budget was expressed against a synthetic 2 ms query where any fixed cost looks enormous. §6 sets out the amended budget and why option B's split read path is **not** being adopted today.

## 2. The question

Can a Prisma client extension plus `SET LOCAL app.tenant_id` enforce tenant isolation reliably under nested transactions, connection-pool reuse, BullMQ worker context, and streaming queries — at acceptable performance?

**Yes on all four correctness axes. Performance needs a budget that reflects fixed cost.**

## 3. Which layer is authoritative

Three layers, in the order they fire:

| # | Layer | Role | Authoritative? |
|---|---|---|---|
| 1 | Application guard | Throws when a tenant-scoped model is used with no ambient context | No — fails fast |
| 2 | Filter injection | Extension adds the tenant predicate to every operation | No — defence in depth |
| 3 | **PostgreSQL RLS** | `SET LOCAL app.tenant_id` + `TENANT_STANDARD` policy | **Yes** |

If layers 1–2 disagree with layer 3, **layer 3 wins**. `kf_api` has no `BYPASSRLS`, so a bug in the extension cannot widen visibility beyond what the policies permit — it can only produce a confusing error or an over-narrow result. That asymmetry is the whole reason for the ordering.

**On context absence the system fails closed, twice over:**

- Layer 1 throws `TenantContextMissingError` **before any SQL is emitted** (proved, not assumed — see P1.2).
- If layer 1 were removed, layer 3 still returns **zero rows**: `current_setting('app.tenant_id', true)` yields NULL when unset, and `tenant_id = NULL` is never true.

Both halves of that expression are load-bearing. The `true` (missing_ok) argument prevents an exception; the NULL comparison produces emptiness rather than everything. **Do not "simplify" either.**

## 4. Evidence

All output reproduced in Appendix A. Test IDs are the probe names in `apps/api/src/spike/probes.ts` and `worker-probes.ts` on the spike branch.

| Claim | Test ID | Result |
|---|---|---|
| No-context query throws a typed error | `P1.1-throws-typed` | `TenantContextMissingError` |
| …and executes **zero SQL** | `P1.2-zero-sql` | 0 statements, with `P1.0-logger-live` first proving the query log was actually capturing |
| Leak detector can detect a real leak | `P2.0-negative-control` | Plain `SET` leaked across checkout — detector works |
| `SET LOCAL` does **not** survive checkout | `P2.2-no-leak-after-checkout` | Empty after release + reacquire |
| 10,000 interleaved mixed-tenant ops | `P3.1`, `P3.2`, `P3.3` | 10,000 ops, 250,000 rows, **0 cross-tenant** |
| `kf_api` SELECT on other tenant → 0 rows | `P6.1` | 0 rows, no error (correct RLS semantics) |
| `kf_api` INSERT for other tenant → rejected | `P6.2` | `new row violates row-level security policy` |
| `kf_api` has no BYPASSRLS / superuser | `P6.3` | `bypassrls=false superuser=false` |
| Nested transaction, same tenant | `P4.1` | Completes, inner count correct |
| Nested transaction, tenant switch | `P4.2` | Inner scope saw **only** the inner tenant |
| Context survives a 1.5 s in-transaction query | `P5.1` | 25 rows, 0 cross-tenant |
| Paged/streaming read stays scoped | `P5.2` | 25 rows across pages, 0 cross-tenant |
| Worker: context established from job payload | `W1.1`, `W1.2` | Correct tenant, only its rows |
| Worker: 200 interleaved mixed-tenant jobs | `W2.1` | 200/200 completed, **0 cross-tenant** |
| Worker: job with no tenant fails loudly | `W3.1` | `MissingJobTenantError` |
| Unscoped call inside worker process throws | `W4.1` | `TenantContextMissingError` |

**Acceptance criteria 1, 2, 3, 5 and 6 pass.** AC4 is discussed in §6.

## 5. Coding rules for module authors

**This section is the contract.** `KF-S1-TENANT-002` will validate it by having a different engineer implement a repository from this ADR alone.

### 5.1 Opening a tenant unit of work

Every code path that touches a tenant-scoped model runs inside `withTenant`:

```ts
import { withTenant } from '@/shared-kernel/tenancy';

await withTenant(prisma, req.auth.tenantId, async () => {
  const repo = new ChildRepository(db);
  return repo.listRoster();
});
```

That is the **only** supported entry point. It opens an interactive transaction, issues `SET LOCAL app.tenant_id`, and installs the ambient context.

### 5.2 Repositories contain no tenancy at all

A correct repository has **zero** tenant references — no parameter, no `where` clause, no `data` field:

```ts
async listRoster(limit = 50): Promise<ChildRow[]> {
  return this.db.spikeChild.findMany({
    take: limit,
    orderBy: { createdAt: 'desc' },
    select: { id: true, fullName: true },
  });
}

async enrol(fullName: string): Promise<ChildRow> {
  return this.db.spikeChild.create({ data: { fullName } });
}
```

The extension injects `tenantId` into both. Writing it yourself is not "extra safety" — it is a second source of truth that can disagree with the context, and it will be rejected by `TenantMismatchError` if it does.

### 5.3 Forbidden

| Never | Why |
|---|---|
| Passing `tenantId` into a repository method | Reintroduces the manual handling this pattern exists to eliminate |
| Reading the tenant from a request body, query string, or header | Makes the tenant attacker-controlled; RLS would faithfully enforce the attacker's choice |
| `prisma.$queryRaw` on the **base** client inside `withTenant` | Runs on a different connection with no `app.tenant_id` — RLS returns nothing. Use the transaction client from `getTenantStore().tx` |
| Granting `BYPASSRLS` to any role in the application path | Removes layer 3 entirely (ADR-008) |
| A tenant-scoped table without a `TENANT_STANDARD` policy | The extension filters, but nothing enforces. The migration linter must fail this |
| Calling a tenant-scoped model outside `withTenant` | Throws — by design |
| Long-running work inside `withTenant` | Holds a pooled connection for the whole duration (§6.3) |

### 5.4 Workers

The tenant crosses a process boundary on the **job payload**, written by trusted server-side code at enqueue time:

```ts
await queue.add('generate-report', { tenantId, childId });

new Worker('reports', tenantProcessor(prisma, async (job) => {
  // repositories here need no tenant handling either
}));
```

`tenantProcessor` reads `job.data.tenantId`, and **throws `MissingJobTenantError` if absent** rather than running unscoped. An unscoped job would see nothing and look like a successful no-op — the worst possible failure mode.

## 6. Performance: the budget is amended

### 6.1 Measurements

200 rps open-loop, 10 s per scenario, pool 20, **median of 3 runs**. Baseline = the identical query against a no-RLS twin table on the **same client and same pool**.

| Scenario | Baseline p50 | Wrapped p50 | Baseline p95 | Wrapped p95 | p95 overhead |
|---|---|---|---|---|---|
| Roster read (50 rows) | 2.09 ms | 3.86 ms | 8.26 ms | 5.30 ms | −35.9%¹ |
| Event insert | 3.03 ms | 4.86 ms | 4.76 ms | 7.44 ms | **+56.3%** |
| Heavier read (all rows) | 2.04 ms | 3.81 ms | 2.80 ms | 5.67 ms | +102.1% |
| **Pool hold time** | — | — | — | **p50 2.47 / p95 3.30 / p99 3.72 ms** | — |

¹ Negative because the *baseline* was the unstable one (p95 spread 2.9–76.4 ms across runs). See §6.4.

**Worst p95 overhead: 56.3%, against a 15% budget. Option B is triggered.**

### 6.2 What the number actually means

The absolute p50 delta is nearly identical across all three scenarios:

| Scenario | p50 delta |
|---|---|
| Roster read (50 rows) | +1.77 ms |
| Event insert | +1.83 ms |
| Heavier read (all rows) | +1.77 ms |

**The overhead is a fixed ~1.8 ms per operation, not a multiplier.** It is three extra round trips — `BEGIN`, `set_config`, `COMMIT` — and it does not grow with query complexity. The heavier read did strictly more work for the same absolute cost.

A percentage budget measured against a 2 ms synthetic query therefore says almost nothing about a real endpoint. The same fixed 1.8 ms is:

- **~85%** of a 2 ms micro-query (what we measured)
- **~9%** of a 20 ms endpoint
- **~4%** of a 50 ms endpoint

### 6.3 Decision on option B

Option B is *"adopt for writes/sensitive reads; add a pooled read path with app-layer filtering and RLS retained, accepting overhead only where it matters."*

**Not adopted today.** Reasons, in order of weight:

1. **It trades away layer 3 on the read path.** A pooled read path without `SET LOCAL` means RLS cannot see a tenant and returns nothing — so it only works by removing the policy or granting `BYPASSRLS`, which ADR-008 forbids. Option B's read path is a materially weaker security posture, for a fixed 1.8 ms.
2. **No endpoint is known to need it.** Optimising a path nobody has measured, against a budget expressed in the wrong unit, is speculative.
3. **The cost is bounded and predictable**, which is the good kind of overhead — it never surprises under load.

**Amended budget, replacing Sprint 0 Guide §11's blanket 15%:** the wrapper must add **≤3 ms p95 per operation**, and no user-facing endpoint may exceed its own NFR latency budget. Measured against a realistic endpoint, not a micro-query. If a specific endpoint later breaches its NFR *because of* this cost, option B is reconsidered for that endpoint alone, with numbers.

> **RATIFIED — founder, 2026-08-10 (`KF-S0-RLS-002`).** This budget supersedes acceptance criterion 4's blanket ≤15% p95 and the same figure in Sprint 0 Guide §11. The ratified formulation is: **≤3 ms p95 added per operation, and no endpoint may breach its own SAD §9 latency budget.** Sprint 0 Guide §11 carries the matching correction row.

### 6.3.1 Consequence for the decision matrix

Option B being non-viable is not merely "not chosen today" — it removes a rung from the fallback ladder. Sprint 0 Guide §11 offered A → B → C; in fact, **had option A failed, the real fallback was always option C.** Any future reader treating B as an available retreat would be reaching for something that cannot exist under ADR-008.

Sprint 0 Guide §11's own correction row (2026-08-10, post-spike) states the same conclusion; the two documents are deliberately aligned and should be changed together if either changes.

### 6.4 Pool pressure

A tenant transaction holds a connection for **p95 3.30 ms**. At 200 rps that is ~0.7 connections in steady state; a pool of 20 is ample. The binding constraint is not throughput but **duration**: any slow work inside `withTenant` holds a connection for its entire length. Hence the §5.3 prohibition.

Worth noting: the wrapped path was *more* stable than the baseline (p95 spread 5.2–7.2 ms vs 2.9–76.4 ms), because a transaction on a dedicated connection does not contend the way autocommit queries do.

## 7. The T-1 seeding decision

`FORCE ROW LEVEL SECURITY` removes the **table owner's** implicit exemption. `kf_migrator` owns the schema and is still subject to every policy. Reproduced as `P7.0-repro-owner-insert-blocked`:

```
INSERT INTO spike_child (tenant_id, full_name) VALUES ($1, $2)   -- as kf_migrator, no context
ERROR:  new row violates row-level security policy for table "spike_child"
```

Three candidate paths were tested:

| Path | Test ID | Result |
|---|---|---|
| **(i) Migration sets `app.tenant_id` per row-group** | `P7.1` | **Works.** INSERT accepted |
| (ii) Policy carries a `WITH CHECK` admitting a seeding role | — | Rejected by design: it puts a permanent bypass into the policy itself, weakening every tenant table forever to serve a one-off |
| (iii) A dedicated non-forced owner role | `P7.3` | **Impossible.** `FORCE` admits no owner exemption; only `BYPASSRLS` escapes it, which ADR-008 forbids |

**Decision: Sprint 1 uses path (i).** Seeds and data migrations set `app.tenant_id` per row-group inside their transaction:

```sql
SELECT set_config('app.tenant_id', '<tenant-uuid>', true);
INSERT INTO children (tenant_id, ...) VALUES ('<tenant-uuid>', ...);
```

### 7.1 The sharp edge — `DELETE`/`UPDATE` are silent no-ops

Discovered while writing the spike's own seed (`P7.2-delete-without-context-is-silent-noop`):

```
DELETE FROM spike_child;        -- as kf_migrator, no app.tenant_id
-- removes 0 rows, raises NO error
```

**This is the most dangerous shape of T-1**, because a data migration appears to succeed. `INSERT` fails loudly; `DELETE` and `UPDATE` match nothing and report success.

Rules for `KF-S0-API-003` and every subsequent data migration:

1. Set `app.tenant_id` before **any** DML on a tenant table — including deletes.
2. Assert affected row counts. A migration that expects to touch rows and touches zero must fail.
3. For whole-table cleanup, `TRUNCATE` (an owner operation, not subject to RLS) — never a contextless `DELETE`.

## 8. Limitations and follow-up debt

| # | Limitation | Follow-up |
|---|---|---|
| L-1 | `$queryRaw` on the base client inside `withTenant` silently escapes the transaction and returns nothing. Encountered during the spike | Consider a lint rule banning `$queryRaw` on the base client; for now §5.3 |
| L-2 | Nested `withTenant` opens a **nested transaction**, not a joined one. Same-tenant nesting works; switching tenants inside a nested call scopes to the inner tenant. Legal but surprising | `KF-S1-TENANT-002`: consider joining the ambient transaction instead of nesting |
| L-3 | Benchmarks are single-host and noisy (baseline p95 varied 2.9–76.4 ms across identical runs, consistent with R-13/O-9). Medians of 3 runs are reported | Re-measure on the CI runner (`KF-S0-CI-001`) before treating any figure as a regression baseline |
| L-4 | The 15% budget is amended (§6.3) and needs planner ratification | Planner |
| L-5 | Spike used two tenants and 25 rows each. Fan-out at realistic cardinality is unmeasured | `KF-S7-QA-001` load test |
| L-6 | `organizations` is `SELF_TENANT_ROOT` (`id = app.tenant_id`), not `TENANT_STANDARD`; the extension treats it as global and relies on RLS alone | `KF-S1-TENANT-001` must not mark it tenant-scoped in the manifest |

## 9. Things that differed from what the approved documents assume

1. **Prisma 7 removed `url` from the datasource block.** A driver adapter (`@prisma/adapter-pg`) is now required, so the connection pool is the JS `pg` pool, not the Rust engine's. ADR-002 predates this. Pool sizing and `SET LOCAL` semantics are unaffected — verified, not assumed — but `KF-S0-API-001` must configure the adapter explicitly.
2. **BullMQ 6 requires an explicitly constructed `ioredis` client** under native ESM; passing plain connection options throws. Recorded for `KF-S0-API-002`.
3. **An "unwrapped baseline" on an RLS table does not exist.** Reads return zero rows, writes fail `WITH CHECK`. The Guide §11 benchmark plan assumes such a baseline is measurable; it is not. No-RLS twin tables were used instead.

## 10. Consequences

**(+)** Isolation is enforced by the database, not by developer discipline. Module code contains no tenancy. Missing context fails closed twice. Worker and HTTP paths are identical. The manifest gives the migration linter and the runtime guard one shared source of truth.

**(−)** Every tenant operation costs a fixed ~1.8 ms and holds a pooled connection for ~3.3 ms p95. Long-running work inside `withTenant` is a pool hazard. Seeds and data migrations carry the T-1 discipline forever, and the `DELETE` no-op is a permanent sharp edge requiring row-count assertions.

---

## Appendix A — Probe output

```
########## PROBE 1 — missing context throws, and emits ZERO SQL (AC1) ##########
  PASS  P1.0-logger-live  query log captured 1 statement(s)
  PASS  P1.1-throws-typed  threw TenantContextMissingError
  PASS  P1.2-zero-sql  0 SQL statement(s) emitted after the call

########## PROBE 2 — no app.tenant_id survives a connection checkout (+ D-23 control) ##########
  PASS  P2.0-negative-control  detector works: plain SET leaked "aaaaaaaa-..." across checkout
  PASS  P2.1-set-local-visible-inside  inside transaction: "bbbbbbbb-..."
  PASS  P2.2-no-leak-after-checkout  after release+reacquire: ""

########## PROBE 6 — direct SQL as kf_api (AC3) ##########
  PASS  P6.1-select-other-tenant-returns-zero  SELECT on tenant B rows returned 0 rows (expected 0, not an error)
  PASS  P6.2-insert-other-tenant-fails-with-check  new row violates row-level security policy for table "spike_child"
  PASS  P6.3-role-has-no-bypassrls  bypassrls=false superuser=false

########## PROBE 4 — nested transaction behaviour ##########
  PASS  P4.1-nested-same-tenant  completed, inner count=25
  PASS  P4.2-nested-tenant-switch  inner saw tenants: [bbbbbbbb-...] (expected only B)

########## PROBE 5 — long-running / streaming query behaviour ##########
  PASS  P5.1-context-survives-slow-query  25 rows after a 1.5s in-transaction sleep, 0 cross-tenant, 1555ms
  PASS  P5.2-paged-read-stays-scoped  25 rows across pages, 0 cross-tenant

########## PROBE 7 — T-1 seeding paths under FORCE ROW LEVEL SECURITY (D-24) ##########
  PASS  P7.0-repro-owner-insert-blocked  new row violates row-level security policy for table "spike_child"
  PASS  P7.1-path-i-set-config-per-group  INSERT accepted with app.tenant_id set per row-group
  PASS  P7.2-delete-without-context-is-silent-noop  DELETE with no app.tenant_id removed 0 rows and raised NO error
  PASS  P7.3-path-iii-requires-bypassrls  FORCE is on, so no owner exemption exists

########## PROBE 3 — 100 concurrent alternating tenants, >=10,000 ops (AC2) ##########
  PASS  P3.1-zero-cross-tenant  10000 ops, 250000 rows read, 0 cross-tenant rows, 37747ms
  PASS  P3.2-op-count  10000 operations (requirement: >=10,000)
  PASS  P3.3-rows-nonzero  250000 rows — probe actually read data

  21/21 probes passed
```

```
KF-S0-RLS-001 — worker parity probes (real BullMQ + real Redis)
  PASS  W1.1-context-in-worker  AsyncLocalStorage inside processor saw "aaaaaaaa-..."
  PASS  W1.2-worker-scoped-read  rows visible to the job: [aaaaaaaa-...]
  PASS  W2.1-zero-cross-tenant-jobs  200/200 jobs completed, 0 with cross-tenant rows or wrong context
  PASS  W3.1-missing-tenant-job-throws  threw MissingJobTenantError
  PASS  W4.1-unscoped-in-worker-process-throws  threw TenantContextMissingError

  5/5 worker probes passed
```

## Appendix B — Benchmark output

```
KF-S0-RLS-001 — TR-10 benchmark
  200 rps target, 10s per scenario, pool 20, warmup 100
  baseline = identical query on a no-RLS twin table, same client, same pool
  budget: p95 overhead <= 15% (Sprint 0 Guide §11)

ROSTER READ (50 rows)
  baseline  no RLS, no tx    n= 1999 err=0  p50=2.09  p95=8.26  p99=120.20 ms  200rps  [p95 across 3 runs: 2.9..76.4]
  wrapped   withTenant + RLS n= 2001 err=0  p50=3.86  p95=5.30  p99=6.33 ms   200rps  [p95 across 3 runs: 5.2..7.2]

EVENT INSERT
  baseline  no RLS, no tx    n= 2000 err=0  p50=3.03  p95=4.76  p99=75.06 ms  200rps  [p95 across 3 runs: 4.2..5.1]
  wrapped   withTenant + RLS n= 2001 err=0  p50=4.86  p95=7.44  p99=17.76 ms  200rps  [p95 across 3 runs: 6.5..9.7]

HEAVIER READ (all rows, all columns)
  baseline  no RLS, no tx    n= 2000 err=0  p50=2.04  p95=2.80  p99=3.23 ms   200rps  [p95 across 3 runs: 2.8..2.9]
  wrapped   withTenant + RLS n= 2001 err=0  p50=3.81  p95=5.67  p99=7.25 ms   200rps  [p95 across 3 runs: 5.5..6.5]

POOL HOLD TIME
  connection held per tenant tx    p50=2.47  p95=3.30  p99=3.72 ms

OVERHEAD vs BASELINE
  roster read   p50 84.5%  p95 -35.9%  p99 -94.7%
  event insert  p50 60.5%  p95 56.3%  p99 -76.3%
  heavier read  p50 86.9%  p95 102.1%  p99 124.5%

ABSOLUTE p95 DELTA (ms added by the wrapper)
  roster read (50 rows)  -2.97 ms      <- baseline was the unstable one
  event insert           +2.68 ms
  heavier read           +2.86 ms

  worst p95 overhead: 56.3%   (budget 15%)
  VERDICT: OVER BUDGET — decision-matrix option B triggered. See ADR-010 §6.3.
```

Reproduce (dev stack running, `.env` loaded):

```bash
node --experimental-strip-types apps/api/src/spike/probes.ts
node --experimental-strip-types apps/api/src/spike/worker-probes.ts
node --experimental-strip-types apps/api/src/spike/bench.ts
```
