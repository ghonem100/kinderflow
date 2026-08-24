/**
 * Worker tenant context (KF-S0-RLS-001 requirement 4 / ADR-010).
 *
 * A job crosses a process boundary, so AsyncLocalStorage cannot carry the
 * tenant with it — the context must be serialised onto the job payload and
 * re-established by the processor. This wrapper is the worker-side twin of
 * `withTenant`, so the HTTP and worker paths converge on the same enforcement.
 *
 * The tenant is read from the JOB PAYLOAD, which is written by trusted
 * server-side code when the job is enqueued. It is never taken from a request
 * body. That distinction is the whole trust boundary: a payload field that a
 * client could influence would make the tenant id attacker-controlled, and RLS
 * would faithfully enforce the attacker's choice.
 */
import { withTenant, type WithTenantOptions } from './prisma-tenancy.ts';

/** Every KinderFlow job payload carries its tenant. */
export interface TenantJobData {
  tenantId: string;
}

export class MissingJobTenantError extends Error {
  readonly code = 'JOB_TENANT_MISSING';
  readonly jobName: string;

  constructor(jobName: string) {
    super(
      `Job "${jobName}" carries no tenantId. Every tenant-scoped job must be enqueued with ` +
        `one — see docs/Decisions/ADR-010_RLS_Integration_Pattern.md.`,
    );
    this.name = 'MissingJobTenantError';
    this.jobName = jobName;
  }
}

/**
 * Wraps a BullMQ processor so its body runs inside a tenant unit of work.
 *
 * Usage:
 *   new Worker('attendance', tenantProcessor(prisma, async (job) => {
 *     // repositories here need no tenant handling at all
 *   }));
 */
export function tenantProcessor<J extends { name: string; data: TenantJobData }, R>(
  prisma: unknown,
  handler: (job: J) => Promise<R>,
  options: WithTenantOptions = {},
): (job: J) => Promise<R> {
  return async (job: J): Promise<R> => {
    const tenantId = job?.data?.tenantId;
    if (!tenantId) {
      // Fail the job loudly rather than running it unscoped. An unscoped job
      // would see nothing (RLS fails closed) and could look like a no-op.
      throw new MissingJobTenantError(job?.name ?? 'unknown');
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return withTenant(prisma as any, tenantId, () => handler(job), {
      ...options,
      origin: 'worker',
    });
  };
}
