/**
 * Ambient tenant context (KF-S0-RLS-001 / ADR-010).
 *
 * AsyncLocalStorage carries the tenant across awaits without threading it
 * through every function signature — which is what lets module authors write
 * repositories containing no tenant handling at all (acceptance criterion 6).
 *
 * The store holds the interactive transaction client as well as the id. That is
 * deliberate: `SET LOCAL` is scoped to a transaction, so the only way an
 * operation can be covered by it is to run on that same transaction client.
 * Keeping both together makes it impossible to have a tenant id in scope while
 * silently querying outside the transaction that authorises it.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantStore {
  /** The tenant this unit of work is authorised for. */
  readonly tenantId: string;
  /**
   * The interactive transaction that issued `SET LOCAL app.tenant_id`.
   * Typed loosely on purpose — the shared kernel must not depend on generated
   * Prisma types, which change shape with the schema.
   */
  readonly tx: Record<string, unknown>;
  /** Where the context came from. Diagnostics only; never a trust boundary. */
  readonly origin: 'http' | 'worker' | 'system';
}

const storage = new AsyncLocalStorage<TenantStore>();

export const tenantStorage = storage;

/** The active context, or undefined outside any tenant unit of work. */
export function getTenantStore(): TenantStore | undefined {
  return storage.getStore();
}

/**
 * The active tenant id, or undefined. Callers that need to *enforce* presence
 * should let the Prisma extension throw rather than checking here — one
 * enforcement point is easier to audit than many.
 */
export function getTenantId(): string | undefined {
  return storage.getStore()?.tenantId;
}

export function runWithTenantStore<T>(store: TenantStore, fn: () => Promise<T>): Promise<T> {
  return storage.run(store, fn);
}
