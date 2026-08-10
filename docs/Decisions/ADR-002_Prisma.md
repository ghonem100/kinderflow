# ADR-002 — Prisma ORM

**Status:** Accepted · 2026-07-18 · Relates to: ADR-003, ADR-008, TR-10

## Context
Data access must be type-safe, support one shared schema across all tenants, integrate with PostgreSQL RLS, and keep migrations simple for a small team.

## Decision
Use Prisma as the ORM and migration tool. Tenant scoping enforced via a Prisma client extension that (a) injects `tenant_id` filters on tenant-scoped models and (b) sets the RLS session variable per transaction.

## Alternatives Considered
- **TypeORM:** weaker type safety, migration drift history, decorator-entity coupling.
- **Kysely / raw SQL:** excellent control, but loses schema-as-source-of-truth migrations and slows CRUD-heavy module delivery.
- **MikroORM:** capable, smaller community, higher onboarding cost.

## Consequences
(+) Generated types end-to-end; single `schema.prisma` = single migration per release for all tenants.
(−) Prisma has no native RLS awareness — the session-variable pattern requires an interactive-transaction wrapper; spike scheduled first sprint (TR-10). Raw SQL escape hatch reserved for read models and reports.
