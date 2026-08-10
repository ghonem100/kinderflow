# ADR-008 — Multi-Tenancy: Shared Database + Shared Schema + RLS

**Status:** Accepted · 2026-07-18 · Relates to: Architecture §4 (full decision matrix), BR-16, TR-01

## Context
Serving thousands of small nursery tenants with a small team. Isolation is existential (child data, BR-16); operations must stay single-migration simple.

## Decision
One PostgreSQL database, one schema. Every tenant-scoped table carries `tenant_id`. Isolation is layered: JWT-derived tenant context → Prisma client-extension filter injection → **PostgreSQL RLS policies as the engine-level backstop** (API role without BYPASSRLS, session variable per transaction) → tenant-prefixed S3 keys → CI cross-tenant test suite.

## Alternatives Considered
- **Schema-per-tenant:** 1,000 schemas × every migration = release risk explosion; poor Prisma fit. Scored 5.9/10 (§4.1).
- **Database-per-tenant:** best isolation, prohibitive fleet operations and connection management at our tenant count/size. Scored 5.1/10.

## Consequences
(+) One migration per release; uniform tooling; per-tenant cost near zero; proven pattern at scale.
(−) RLS coverage must be complete — a new table without a policy is a vulnerability: mitigated by migration linter + CI isolation suite (TR-01). Per-tenant restore is a runbook, not a command (§4.3). Escape hatch: dedicated single-tenant deployment of the same stack for enterprise/residency cases.
