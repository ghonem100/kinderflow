# ADR-005 — Redis for Cache, Sessions, Rate Limits, Queues

**Status:** Accepted · 2026-07-18 · Relates to: ADR-004, Architecture §5, §6

## Context
The platform needs low-latency caching, a session/JTI revocation registry, distributed rate limiting, and a queue backing store — with minimal operational surface.

## Decision
One Redis instance (AOF persistence) serving all four roles, with namespaced keyspaces (`t:{tenant}` prefixes) and independent eviction policies per keyspace where applicable.

## Alternatives Considered
- **Memcached:** cache only — no queues, no persistence, no sorted structures for rate limiting.
- **Separate systems per concern:** cleaner isolation, unaffordable ops overhead at MVP.
- **In-process cache:** breaks horizontal API scaling (state must be shared).

## Consequences
(+) Single dependency covers four concerns; battle-tested Nest/BullMQ integrations.
(−) Shared instance couples failure domains — accepted at MVP; split cache vs. queue instances at the multi-host milestone. Hard rule: Redis loss must never lose business data (only PG/S3 are durable stores).
