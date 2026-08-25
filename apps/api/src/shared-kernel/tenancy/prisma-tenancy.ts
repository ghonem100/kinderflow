/**
 * Prisma × PostgreSQL RLS integration (KF-S0-RLS-001 / ADR-010).
 *
 * Three layers, in the order they fire:
 *
 *   1. APPLICATION GUARD — a tenant-scoped model used with no ambient context
 *      throws before any SQL leaves the process.
 *   2. FILTER INJECTION — the tenant predicate is added to every operation as
 *      defence in depth, so a policy gap does not immediately become a leak.
 *   3. POSTGRESQL RLS — the authoritative layer. `SET LOCAL app.tenant_id`
 *      inside the interactive transaction; policies decide what the row-level
 *      truth is. Layers 1 and 2 are convenience and early failure, not trust.
 *
 * Which layer is authoritative matters: if 1 and 2 disagree with 3, 3 wins, and
 * that is the design. `kf_api` has no BYPASSRLS, so a mistake in this file
 * cannot widen visibility beyond what the policies allow — it can only produce
 * a confusing error or an over-narrow result.
 *
 * The operation is re-issued on the transaction client held in the context.
 * That is the load-bearing detail: `SET LOCAL` is transaction-scoped, so an
 * operation running on the base client would be outside its effect and would
 * see nothing (RLS fails closed). Routing onto the same transaction is what
 * connects the application call to the session variable that authorises it.
 */
import { TENANT_SCOPED_MODELS, TENANT_FIELD } from './model-manifest.generated.ts';
import { getTenantStore, runWithTenantStore, type TenantStore } from './tenant-context.ts';
import { TenantContextMissingError, TenantMismatchError } from './tenancy-errors.ts';

/** `SpikeChild` -> `spikeChild`, matching the client's property names. */
const clientKey = (model: string): string => model.charAt(0).toLowerCase() + model.slice(1);

/** Operations that carry a `where` we can narrow. */
const WHERE_OPS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'updateMany',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'delete',
]);

/**
 * `findUnique` rejects a `where` containing non-unique fields, so injecting the
 * tenant predicate into it is a type error. Rewriting to `findFirst` keeps the
 * predicate and returns the same shape.
 */
const UNIQUE_OPS: Record<string, string> = {
  findUnique: 'findFirst',
  findUniqueOrThrow: 'findFirstOrThrow',
};

/**
 * Prisma operation arguments are structurally dynamic — their shape depends on
 * the model and the operation. `unknown` values with narrow casts at the point
 * of use keep Blueprint §12's no-`any` rule intact while still letting this
 * layer rewrite argument objects it cannot statically describe.
 */
type AnyArgs = Record<string, unknown>;

/** A model delegate on a client, e.g. `tx.spikeChild`. */
type Delegate = Record<string, (args: AnyArgs) => Promise<unknown>>;

/** What Prisma hands the `$allOperations` hook. */
interface TenancyHookArgs {
  model: string;
  operation: string;
  args: unknown;
  query: (args: unknown) => Promise<unknown>;
}

/** Minimal surface of an interactive transaction client. */
type TxLike = Record<string, unknown> & {
  $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<number>;
};

/** Minimal surface of a PrismaClient, so the kernel avoids generated types. */
interface PrismaLike {
  $transaction: <T>(
    fn: (tx: TxLike) => Promise<T>,
    options?: { timeout?: number; maxWait?: number },
  ) => Promise<T>;
}

const asArgs = (value: unknown): AnyArgs => (value ?? {}) as AnyArgs;

function assertTenant(model: string, tenantId: string, row: AnyArgs): void {
  const supplied = row?.[TENANT_FIELD];
  if (supplied !== undefined && supplied !== tenantId) {
    throw new TenantMismatchError(model, tenantId, String(supplied));
  }
}

function stampWrite(model: string, tenantId: string, data: unknown): unknown {
  if (Array.isArray(data)) {
    return data.map((row) => {
      const r = asArgs(row);
      assertTenant(model, tenantId, r);
      return { ...r, [TENANT_FIELD]: tenantId };
    });
  }
  const row = asArgs(data);
  assertTenant(model, tenantId, row);
  return { ...row, [TENANT_FIELD]: tenantId };
}

/**
 * Rewrites one operation so it is tenant-scoped, and returns the operation name
 * to invoke (which may differ, see UNIQUE_OPS).
 */
function scopeArgs(
  model: string,
  operation: string,
  args: AnyArgs,
  tenantId: string,
): { operation: string; args: AnyArgs } {
  const next: AnyArgs = { ...asArgs(args) };

  if (operation in UNIQUE_OPS) {
    next.where = { ...asArgs(next.where), [TENANT_FIELD]: tenantId };
    return { operation: UNIQUE_OPS[operation]!, args: next };
  }

  if (WHERE_OPS.has(operation)) {
    next.where = { ...asArgs(next.where), [TENANT_FIELD]: tenantId };
  }

  if (operation === 'create' || operation === 'createMany' || operation === 'createManyAndReturn') {
    next.data = stampWrite(model, tenantId, next.data);
  }

  if (operation === 'upsert') {
    next.where = { ...asArgs(next.where), [TENANT_FIELD]: tenantId };
    next.create = stampWrite(model, tenantId, next.create);
  }

  return { operation, args: next };
}

/**
 * Wraps a base PrismaClient with the tenancy extension.
 *
 * Global (non-tenant-scoped) models pass straight through — reference data such
 * as subscription_plans is GLOBAL_READ and has no tenant column.
 */
export function withTenancy<T extends { $extends: (ext: unknown) => unknown }>(prisma: T): T {
  return prisma.$extends({
    name: 'kf-tenancy',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: TenancyHookArgs) {
          if (!TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }

          // Layer 1. Throws before any SQL is emitted (acceptance criterion 1).
          const store = getTenantStore();
          if (!store) {
            throw new TenantContextMissingError(model, operation);
          }

          // Layer 2.
          const scoped = scopeArgs(model, operation, asArgs(args), store.tenantId);

          // Route onto the transaction that issued SET LOCAL, so layer 3 applies.
          const delegate = (store.tx as Record<string, Delegate>)[clientKey(model)];
          if (!delegate) throw new TenantContextMissingError(model, operation);
          return delegate[scoped.operation]!(scoped.args);
        },
      },
    },
  }) as unknown as T;
}

export interface WithTenantOptions {
  /** Diagnostics only. Never a trust boundary — see ADR-010. */
  origin?: TenantStore['origin'];
  /** Interactive transaction ceiling, ms. */
  timeout?: number;
  maxWait?: number;
}

/**
 * Opens a tenant unit of work.
 *
 * Everything inside `fn` — however deep — is scoped to `tenantId` with no
 * further ceremony. This is the ONLY supported way to touch a tenant-scoped
 * model; see ADR-010 for the rules.
 *
 * `set_config(..., true)` is the function form of `SET LOCAL`: transaction-
 * scoped, so it is discarded when the transaction ends and cannot survive a
 * connection returning to the pool. It is parameterised rather than
 * interpolated — a tenant id reaching SQL as a literal would be an injection
 * point on the one value the whole isolation model depends on.
 */
export async function withTenant<T>(
  prisma: PrismaLike,
  tenantId: string,
  fn: () => Promise<T>,
  options: WithTenantOptions = {},
): Promise<T> {
  return prisma.$transaction(
    async (tx: TxLike) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}::text, true)`;
      return runWithTenantStore({ tenantId, tx, origin: options.origin ?? 'system' }, fn);
    },
    { timeout: options.timeout ?? 15_000, maxWait: options.maxWait ?? 5_000 },
  );
}
