# ADR-007 — Modular Monolith over Microservices

**Status:** Accepted · 2026-07-18 · Relates to: Architecture §1, §3

## Context
A small team must ship an MVP fast, evolve safely, and keep infrastructure lean — while the domain (11 modules) is broad and boundaries are still stabilizing.

## Decision
One deployable NestJS application composed of strictly bounded modules (public interfaces + domain events only; no cross-module table access). Workers share the codebase. Boundaries are CI-enforced (dependency-cruiser).

## Alternatives Considered
- **Microservices from day one:** distributed-systems tax (network failures, sagas, observability, N deploy pipelines) with zero current scaling need; boundary mistakes become network contracts — expensive to fix.
- **Unstructured monolith:** fastest week one, unmaintainable month twelve.

## Consequences
(+) One deploy, one DB transaction scope, refactoring across boundaries is a compiler-checked operation; extraction path preserved — a module with stable events + interface can become a service without rewrite (§1.5 Phase D).
(−) Requires discipline: boundary erosion is the #2 technical risk (TR-02); mitigated by lint rules, PR template checks, and ADR gates on the Shared Kernel.
