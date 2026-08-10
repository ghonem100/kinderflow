# ADR-001 — NestJS for the Backend

**Status:** Accepted · 2026-07-18 · Relates to: Architecture §3, ADR-007

## Context
KinderFlow needs a backend framework supporting a modular monolith with Clean Architecture, DI, strong typing, and first-class support for guards/interceptors (RBAC, tenancy), OpenAPI, and BullMQ.

## Decision
Use NestJS with TypeScript strict mode.

## Alternatives Considered
- **Express/Fastify (bare):** maximum freedom, but we'd rebuild DI, module system, guards, OpenAPI — undisciplined structure risk for a growing team.
- **AdonisJS:** cohesive but smaller ecosystem, weaker DI for our port/adapter style.
- **Spring Boot / .NET:** excellent but breaks single-language (TS) strategy and team profile.

## Consequences
(+) Module system maps 1:1 to our module boundaries; decorators for guards/validation; mature integrations (Prisma, BullMQ, Swagger, Terminus health).
(−) Framework abstractions can leak into domain code — mitigated by Clean Architecture layering rules (domain never imports NestJS).
