# ADR-009 — PWA-First Mobile Strategy

**Status:** Accepted · 2026-07-18 · Relates to: DR-001 D3, Architecture §8.2, TD-02

## Context
Teachers and parents are mobile-first users; the gate needs offline tolerance; the team cannot build and maintain three codebases at MVP. Founder decision D3 fixed PWA-first with native apps in V2.

## Decision
Teacher and parent surfaces ship as installable Next.js PWAs: service-worker offline queue for check-in/out and activity logging (§8.2), web push where supported, responsive RTL-first UI.

## Alternatives Considered
- **React Native/Expo at MVP:** best push/biometrics, but doubles surface area and adds app-store review latency to every release — deferred to V2 by D3.
- **Flutter:** same tradeoff plus a second language (Dart) against our TS-only strategy.

## Consequences
(+) One codebase, instant updates (critical during early iteration), no store gatekeeping, offline queue satisfies gate reliability (BRD R-06).
(−) iOS web push/background limits (TD-02): mitigated via in-app inbox + SMS/WhatsApp for critical alerts (unauthorized pickup, incidents). Native V2 planned once product is stable.
