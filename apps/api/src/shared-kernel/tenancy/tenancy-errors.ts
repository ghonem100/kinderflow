/**
 * Typed failures for the tenancy layer (KF-S0-RLS-001 / ADR-010).
 *
 * These are deliberately distinct classes rather than a generic Error: the
 * isolation suite asserts on the type, and an operator reading a log needs to
 * tell "the developer forgot the wrapper" apart from "the database rejected
 * the row".
 *
 * Fields are declared and assigned explicitly rather than using TypeScript
 * constructor parameter properties. Parameter properties are a TS-only
 * construct that Node's type stripping cannot erase, and shared-kernel code
 * should stay runnable without a build step.
 */

/**
 * Thrown when a tenant-scoped model is used with no ambient tenant context.
 *
 * The whole point is that this throws BEFORE any SQL is emitted. An unscoped
 * query that reached PostgreSQL would return zero rows (RLS fails closed,
 * finding T-2) — safe, but silent, and a silent empty result is the kind of bug
 * that ships. Failing loudly in the application layer turns a data-leak class
 * of mistake into an obvious crash during development.
 */
export class TenantContextMissingError extends Error {
  readonly code = 'TENANT_CONTEXT_MISSING';
  readonly model: string;
  readonly operation: string;

  constructor(model: string, operation: string) {
    super(
      `No tenant context for ${model}.${operation}(). Tenant-scoped work must run inside ` +
        `withTenant(...) — see docs/Decisions/ADR-010_RLS_Integration_Pattern.md.`,
    );
    this.name = 'TenantContextMissingError';
    this.model = model;
    this.operation = operation;
  }
}

/**
 * Thrown when caller-supplied data names a different tenant than the ambient
 * context. RLS would reject it anyway via WITH CHECK; catching it here gives a
 * precise error instead of a generic constraint violation, and proves the
 * application layer is not the thing being relied upon.
 */
export class TenantMismatchError extends Error {
  readonly code = 'TENANT_MISMATCH';
  readonly model: string;
  readonly expected: string;
  readonly received: string;

  constructor(model: string, expected: string, received: string) {
    super(
      `Refusing to write ${model} for tenant ${received} while the ambient context is ${expected}.`,
    );
    this.name = 'TenantMismatchError';
    this.model = model;
    this.expected = expected;
    this.received = received;
  }
}
