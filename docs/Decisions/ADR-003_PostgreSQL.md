# ADR-003 — PostgreSQL as System of Record

**Status:** Accepted · 2026-07-18 · Relates to: ADR-008, Architecture §6

## Context
The platform needs ACID transactions (billing), engine-level multi-tenant isolation, JSON flexibility for evolving log payloads, and a growth path (replicas, partitioning) — on a lean budget.

## Decision
PostgreSQL 16 as the sole system of record.

## Alternatives Considered
- **MySQL/MariaDB:** no RLS equivalent of comparable maturity — disqualifying for our tenancy model.
- **MongoDB:** weak fit for relational billing/attendance integrity and cross-entity invariants.
- **Cloud-managed distributed SQL (Cockroach, Yugabyte):** over-engineered for tenant sizes; cost and ops overhead unjustified.

## Consequences
(+) RLS is the isolation backstop; `pg_stat_statements`, WAL-based PITR, range partitioning, JSONB — all standard.
(−) Single-writer ceiling eventually (TR-04) — mitigated by read replicas then partitioning; accepted for 3–5 year horizon.
