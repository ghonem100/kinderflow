# ADR-004 — BullMQ for Background Jobs

**Status:** Accepted · 2026-07-18 · Relates to: ADR-005, Architecture §10

## Context
Notifications, invoice runs, AI drafting, media processing, and cleanup must run async with retries, scheduling, and DLQs — without adding a new broker to operate.

## Decision
BullMQ on Redis for all background work; workers run the same codebase in worker mode.

## Alternatives Considered
- **RabbitMQ:** richer routing semantics we don't need; another stateful service on VPS budget.
- **Kafka:** event-streaming scale we are nowhere near; heavy ops burden.
- **pg-boss (Postgres queues):** attractive simplicity, but repeatable-job ergonomics, rate limiting, and dashboard tooling are weaker; queue load would share the primary DB.

## Consequences
(+) TS-native, repeatable (cron) jobs, per-queue retry/backoff, DLQ patterns, existing Nest integration.
(−) At-least-once delivery → every handler must be idempotent (mandated in §10.2); Redis durability configured (AOF) since queues hold in-flight work — business truth still only in PG.
