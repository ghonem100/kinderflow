# KinderFlow — Engineering & Delivery Blueprint

| Field | Value |
|-------|-------|
| Document | Engineering & Delivery Blueprint (Phase 7) |
| Version | 1.0 |
| Date | 2026-07-18 |
| Status | Pending Review — execution guide for the engineering team on approval |
| Inputs (all approved, unchanged) | BRD v1.1 · SAD v1.0 · ADR-001…009 · Domain Model v1.0 · RBAC v1.0 · API Contract v1.0 · Design System v1.0 |
| Rule | This document sequences and operationalizes. It introduces **zero** new architecture, rules, or scope |

---

# 1. Repository Architecture

**Decision: single monorepo** (pnpm workspaces + Turborepo) — one deployable API + one Next.js app + shared packages; matches modular monolith (ADR-007) and small-team velocity. Existing scaffold folders map as noted.

```
kinderflow/
├── apps/
│   ├── api/                  # NestJS modular monolith (maps from backend/)
│   │   └── src/modules/…     # §3 layout
│   └── web/                  # Next.js — ALL surfaces (maps from frontend/)
│       └── app/(console)/ (teacher)/ (parent)/ (gate)/ (platform)/
├── packages/
│   ├── contracts/            # OpenAPI spec (source of truth) + generated TS types + error-code catalog + event contracts
│   ├── ui/                   # KF component library (shadcn-based, tokens, §19 Design System)
│   ├── tokens/               # Design tokens → CSS vars + Tailwind preset (generated, single source)
│   ├── i18n/                 # ar/en message catalogs, locale utils, digit/date formatting (UXD-02/03)
│   └── shared/               # Isomorphic pure utils only (Money math, validation schemas shared FE/BE) — no framework imports
├── configs/                  # tsconfig/eslint/prettier/tailwind base configs (consumed by all packages)
├── tooling/
│   ├── depcruise/            # Module-boundary rules (TR-02 gate)
│   ├── migration-lint/       # RLS-class annotation checker (TR-01 gate)
│   └── generators/           # OpenAPI→types, Postman, token pipeline
├── infrastructure/           # Dockerfiles, compose, Coolify config-as-code, backup scripts (existing folder)
├── scripts/                  # Dev setup, seed runners, restore rehearsal (existing folder)
├── docs/                     # Phases 0–7 (existing) + runbooks/
└── mobile-parent/ mobile-teacher/   # Reserved for V2 native (ADR-009) — empty until then
```

Folder rules: `packages/*` never import from `apps/*`; `shared` has zero dependencies; `contracts` is generated + hand-authored spec — the only place API shapes live; UI imports tokens, never raw values.

---

# 2. Frontend Architecture (apps/web)

| Concern | Implementation plan |
|---------|--------------------|
| Route structure | App Router route groups per surface: `(console)`, `(teacher)`, `(parent)`, `(gate)`, `(platform)` — separate layouts/shells (Design §4.1), shared auth; middleware routes users to their surface by role; unauthorized routes → 404 (Design §06) |
| Server vs Client | RSC for console read views (dashboards, tables, invoice detail) — data fetched server-side with user's token; Client Components for all interactive/offline surfaces (teacher, gate, parent feed interactions, forms). Rule: PWA-critical paths are client-rendered + cached (offline must not depend on server render) |
| Data layer | TanStack Query as the single client cache: query keys namespaced `[surface, resource, params]`; `staleTime` per API cache policy (settings 60 s, balances 0, pickup lists 0); mutations invalidate by resource key; `persistQueryClient` (IndexedDB) for teacher/parent offline reads |
| API client | Generated from `packages/contracts` OpenAPI — typed endpoints, error-code discriminated unions, auto `Idempotency-Key`/`If-Match` injection per spec extensions; single fetch wrapper handles auth refresh, `X-Request-Id`, Accept-Language |
| Forms | React Hook Form + zod resolvers; zod schemas imported from `packages/contracts` (same rules as backend DTO validation — one definition; **amended 2026-08-10, DISC-011:** originally read `packages/shared`. DTO schemas are contract artifacts and must version with the OpenAPI spec they mirror, so they live in `@kf/contracts`. `@kf/shared` keeps framework-free pure utils only — Money math, domain primitives); server `errors[]` pointers mapped to fields (Design §16) |
| Local state | Zustand stores, deliberately few: `offlineQueueStore` (queued events, sync status), `gateModeStore`, `uiStore` (nav, density, theme). Server data never lives in Zustand |
| Offline strategy | Serwist service worker: app-shell precache; runtime caching (rosters, feed pages per API cache headers); **write queue** = offline events persisted in IndexedDB via `offlineQueueStore`, drained by Background Sync → `/sync` endpoints (batch, Idempotency-Key), per-item results reconciled into query cache (API §5); queue age cap 24 h (NFR) |
| Optimistic updates | Check-in/out, activity log, mark-read: apply locally with `queued`/`pending` visual state (Design §05 badges), reconcile on server ack; never optimistic: payments, approvals, publishing |
| Loading strategy | Route-level `loading.tsx` = layout-mirroring skeletons (Design §17); Suspense boundaries per widget on dashboard; no full-page spinners |
| Error boundaries | Per route group (surface-level fallback) + per widget (dashboard cards degrade independently); boundary UI from Design §16; trace_id surfaced |
| PWA | Manifest per surface entry (installable teacher/parent); install prompts per Design §14; iOS meta set; push: web push (Android) + in-app inbox fallback (TD-02) |
| RTL/i18n | `next-intl`; `dir` from locale on `<html>`; Tailwind logical utilities only (`ps-/pe-/ms-/me-`) enforced by ESLint rule; `dir="auto"` on user content (Design §03); digit/date formatting from `packages/i18n` |
| Styling | Tailwind preset from `packages/tokens`; no raw hex/px in app code (lint-enforced, Design QA) |

---

# 3. Backend Architecture (apps/api)

| Concern | Implementation plan |
|---------|--------------------|
| Module layout | One Nest module per bounded context (SAD §3.1): `src/modules/{iam,tenancy,children,attendance,activities,billing,communication,staff,ai,media,platform}` + `src/shared-kernel/`; each module: `domain/ application/ infrastructure/ presentation/` (Clean layers, SAD §3.2 rule 5) |
| Boundaries | Public surface per module = `index.ts` exporting application services + event contracts only; dependency-cruiser forbids deep imports and domain→nest imports (TR-02 CI gate) |
| Controllers | Thin: DTO validation (class-validator mirroring zod/OpenAPI), auth context extraction, call use case, map Result→HTTP; error filter maps domain errors→§4 error catalog (single mapping table in `contracts`) |
| Services | Application services = use cases (one class per command/query for core flows); domain services per DDD catalog (Domain §1.6) |
| Repositories | Ports in `application/ports`, Prisma implementations in `infrastructure`; one repo per aggregate root; query services (CQRS-lite) separate from repositories for dashboards/aging |
| Prisma + RLS | Client extension (TR-10 spike output): model manifest classifies tenant-scoped models; every tenant request runs `$transaction` with `SET LOCAL app.tenant_id`; extension injects tenant filter as defense-in-depth; workers use identical wrapper with job-carried tenant context (SAD §10.2) |
| Guards pipeline | Global order (RBAC §2.2): `JwtAuthGuard` (jti Redis check, ver claim) → `TenantContextInterceptor` → `PermissionGuard` (`@RequirePermission('invoice:issue')` — code must exist in contracts permission registry; startup assertion against OpenAPI `x-permission-code`) → `ScopeGuard` (branch/classroom/own-children resolvers) → policy checks in use cases |
| Transactions | Aggregate = transaction boundary; interactive transactions via a `UnitOfWork` port; no external calls inside transactions (Domain Part 10); serializable only for payment allocation |
| Outbox | Domain events appended to `outbox_events` in the same transaction; dispatcher (worker) polls → publishes to BullMQ → marks processed; consumers idempotent; event payloads versioned from `contracts` |
| BullMQ workers | Same codebase, separate Nest application context (`apps/api/src/worker.ts`), queue modules per SAD §10.1; every processor: tenant context wrapper, idempotency by natural key, retry per policy, DLQ handlers with alerting |
| Redis | Single client module: cache service (namespaced), session/jti registry, rate limiter (sliding window), BullMQ connection; AOF configured in infra |
| Audit | Shared-kernel `AuditWriter` port called by use cases per RBAC §6 catalog; hash chain computed in writer; interceptor adds trace/actor context automatically |
| Config | Typed config module validating all env vars at boot (Twelve-Factor); fail-fast on missing |
| OpenAPI parity | Decorators generate spec in CI; diffed against `packages/contracts` spec — divergence fails build (API §8) |

---
# 4. Database Migration Plan

| Step | Content |
|------|---------|
| M-000 | Extensions: `pgcrypto`, `pg_trgm`, `unaccent`, `pg_stat_statements`; DB roles: `kf_api` (no BYPASSRLS), `kf_worker`, `kf_migrator`, `kf_audit_writer` (INSERT-only on audit) |
| M-001 | Enums (all, Domain Part 8) + global reference tables: subscription_plans, roles, permissions, role_permissions, feature_flags, prompt_versions + `GLOBAL_READ` policies |
| M-002 | Tenancy core: organizations, branches, classrooms, subscriptions, tenant_settings + RLS (`SELF_TENANT_ROOT`, `TENANT_STANDARD`) |
| M-003 | IAM: users, user_roles, refresh_token_families, mfa_enrollments + RLS |
| M-004 | People: children, guardians, child_guardians, authorized_pickups, medical_records, medication_authorizations/administrations, consents, child_documents + RLS + tenant-composite FKs + constraint triggers (primary guardian) |
| M-005 | Operations: attendance_days/events/amendments (+ alternation trigger), activity_entries, daily_reports, report_drafts, incidents(+acks), media_assets, conversations, messages, announcements, notifications, notification_preferences + RLS |
| M-006 | Billing: fee_plans/components, discount_rules, fee_assignments, invoices(+total trigger), invoice_lines, payments, payment_allocations(+allocation trigger), credit_notes + RLS |
| M-007 | Platform: audit_log (**partitioned from day one**, monthly, hash-chain trigger), break_glass_grants, tenant_exports, outbox_events, ai_usage_daily, kpi_daily_snapshots + RLS |
| Ordering rules | RLS policies ship **in the same migration** as their table (linter-enforced, TR-01); indexes ship with tables; hand-written SQL blocks below generated DDL per Prisma convention (Domain Part 8) |
| Seeds | Tier-1 system seed (idempotent upsert: roles, permissions, plans, flags, prompts) runs post-migrate every deploy; tier-2 tenant template applied by provisioning workflow; tier-3 demo dataset (staging only, Arabic realistic data, load-test volumetrics) |
| Rollback | Expand-and-contract only — no destructive change in the same release as its replacement; every migration PR states its rollback (usually: deploy previous image, schema stays); tested restore path via staging rehearsal (monthly, §9) |

# 5. AI Implementation Plan

| Concern | Plan |
|---------|------|
| Provider | Primary: Anthropic Claude API (structured JSON output, AR/EN quality); adapter port per SAD §7 — secondary adapter interface implemented with a stub-fallback provider at MVP, second live provider before GCC scale (TD-09). Zero-retention/no-training terms required (F2 gate) |
| Prompt structure | Template per task (`daily-report@1.x.y`): system (role, tone rules, language target, safety constraints) + structured input (typed activity snapshot JSON — no free text from DB) + output JSON schema; templates in code (`apps/api/src/modules/ai/prompts/`), registered to `prompt_versions` at boot |
| Versioning | Semver; input/output schema changes bump minor+; every draft records prompt_version/model/input_hash (Domain table 29); A/B only via feature flag per tenant |
| Context building | `Activities` ACL snapshot builder (SAD §7): child first-name + pseudonym id, day's typed events, classroom language pref; medical data only if a logged event requires it; builder unit-tested against PII-leak assertions |
| Caching | Input-hash → draft cache (identical event sets, e.g., regenerate without changes = cache hit); batch per classroom |
| Quota | `ai_usage_daily` checked pre-enqueue; per-plan daily token budgets (BR-22); backpressure per tenant in queue processor |
| Cost monitoring | Tokens/cost recorded per draft; nightly rollup + per-tenant cost report; alert at plan-margin threshold (TR-09) |
| Fallback | Provider error/timeout (10 s) → retry once → template-based non-AI report (deterministic from same snapshot) + banner flag (Design §12); queue continues |
| Approval flow | Exactly BR-13/Design §12: drafts land `pending_review`; publish endpoint requires `report:approve` + report opened (UXD-04); edit-distance recorded for quality telemetry |

# 6. Sprint Plan (2-week sprints, team assumption: 2 BE, 2 FE, 1 full-stack lead, designer part-time)

| Sprint | Goals & deliverables | Acceptance criteria |
|--------|----------------------|---------------------|
| **S0 — Foundations** | Monorepo + CI/CD skeleton (lint/test/build/deploy to staging); Docker + Coolify envs; M-000/001 migrations; **TR-10 Prisma-RLS spike → pattern documented + isolation test harness running**; tokens package + UI shell scaffold; OpenAPI repo seeded from contract | Pipeline green end-to-end; spike report approved; cross-tenant test harness executes (red on seeded violation) |
| **S1 — Identity & Tenancy** | Auth endpoints (login/refresh/logout/invite/reset), session registry, guards pipeline, M-002/003; tenant provisioning workflow + minimal platform console (create tenant); audit writer + hash chain | RBAC suite passes for implemented endpoints; provisioning <5 min; SEC-AUTH/TOKEN events logged |
| **S2 — Children & Families** | M-004; admission flow (API + console UI); guardians, pickups (+approval), medical, consents, documents (media upload pipeline minimal); parent invite | Admission E2E (Playwright); FL-05/06 DTO variants verified; BR-04 enforced; isolation suite green |
| **S3 — Attendance & Gate** | M-005 (attendance part); check-in/out + amendments APIs; **offline sync endpoint + PWA queue**; gate mode UI; teacher Today roster; parent notifications (check-in/out) | Gate flow <10 s (measured); offline 24 h queue drains correctly (automated airplane-mode E2E); BR-01 block + takeover UX works; SEC-SAFE-001 alerting |
| **S4 — Activities, Media, Reports (non-AI)** | Activity quick-log (≤5 taps, batch), typed payloads; media pipeline full (quota, consent, variants); daily report state machine with template drafts; parent feed | 5-tap contract verified in usability test; consent engine blocks correctly; report approve→publish→feed E2E |
| **S5 — AI + Communication** | AI module (provider adapter, prompts, quotas, fallback); draft generation batch + teacher review UX; conversations/messages (quiet hours), announcements, notification center + preferences | AI drafts from structured events only (PII-leak tests green); BR-13 structural (no publish path without approval); quiet-hours queueing verified |
| **S6 — Billing** | M-006; fee plans/assignments; invoice cycle run (job + review + issue-batch); payments + allocations + receipts; parent payments view; aging | Cycle for 100-child tenant <10 min incl. review (O8 path); BR-06…10 enforced + trigger tests; accountant E2E; money math property-tested |
| **S7 — Analytics, Platform, Hardening** | KPI projections + owner dashboard; audit log UI + exports; platform console (lifecycle, break-glass with owner notify); rate limiting final; load test (5k concurrent check-ins) + index tuning; axe/a11y pass; restore rehearsal #1 | NFR targets met (p95<300 ms on load test); TR-03 verified; break-glass full flow audited; a11y zero criticals |
| **S8 — Beta readiness** | Bug triage; Arabic microcopy review complete; onboarding import tools (Excel) + CS console; PDPL checklist closure (F2); backup/DR runbook drills; pilot tenant seeded | Launch-gate checklist (§11) fully green; private beta tenants onboarded |

Definition of Done (every story): code + tests (per §8 pyramid) + OpenAPI parity + isolation suite green + audit events wired + Design QA checklist + docs updated + deployed to staging behind flag.

# 7. Development Order (rationale)

`Auth → Tenancy → Children → Attendance → Activities/Media → AI+Comms → Billing → Analytics/Platform`

Why: (1) nothing exists without identity + tenant context — and the RLS pattern (TR-10) must be proven before any tenant data ships; (2) Children is the upstream supplier context (Domain §1.2) — every core flow reads it; (3) Attendance next because the gate is the highest-risk surface (offline, safety) — earliest possible real-world feedback; (4) Activities before AI because AI consumes structured activity data — shipping template reports first de-risks the loop; (5) Billing after the daily loop exists (invoices need enrollment + attendance facts, and revenue features need stable child data); (6) Analytics last — projections read everything else. Communication co-ships with AI (S5) because report publishing is its main event source. This order also front-loads the two existential risks (isolation, gate) into S0–S3.

---
# 8. Testing Strategy

| Layer | Scope & tools | Gate |
|-------|---------------|------|
| Unit | Domain entities/VOs/services (money math property-based, discount engine, state machines, pickup authorization) — Vitest/Jest, no DB | ≥80% coverage domain+application layers (SAD §9); mutation testing on billing money paths |
| Integration | Use cases against real Postgres (Testcontainers): repositories, triggers (pgTAP for alternation/totals/hash-chain), outbox dispatch, guards pipeline | Per-module suite green; trigger behavior pinned |
| **Tenant isolation** | Dedicated suite: two seeded tenants, every endpoint × every role attempted cross-tenant (expects 404) + direct SQL probes as `kf_api` role (expects zero rows) | **Release-blocking; runs on every PR** (TR-01) |
| E2E | Playwright: 6 critical journeys (admission, gate check-in/out incl. unauthorized takeover, quick-log→AI report→parent feed, invoice cycle→payment→receipt, messaging quiet-hours, break-glass) × ar-RTL and en × mobile/desktop viewports | Green on staging before prod deploy |
| Offline | Playwright offline emulation: queue → airplane → reconnect → sync reconciliation incl. duplicate + conflict paths | S3 acceptance; regression thereafter |
| Performance | k6: morning spike scenario (5k concurrent check-ins, TR-03), invoice cycle batch, dashboard p95; query budget assertions via pg_stat_statements diff | NFR table (SAD §9) met before beta |
| Security | Dependency scanning (every PR), image scan, ZAP baseline on staging, authz matrix fuzz (role × endpoint generated from OpenAPI `x-permission-code`), secrets scan | Zero high findings for release |
| Accessibility | axe-core CI (zero criticals) + manual SR pass (ar VoiceOver/TalkBack) on 4 critical flows per release (Design §13) | Release gate |
| AI validation | Golden-set evals: 50 curated activity snapshots → drafts asserted for language, schema, no-PII-beyond-input, no-invented-events; regression on prompt version bump | Prompt version cannot ship with failing evals |

# 9. DevOps

| Concern | Plan |
|---------|------|
| Environments | Local (compose: PG/Redis/MinIO/mailpit) · Staging (Coolify, prod topology, anonymized demo seed) · Production (SAD §11.1); preview: PR-scoped frontend previews against staging API (no per-PR DBs at MVP — accepted) |
| Pipeline | SAD §11.2 exactly; additions: migration-lint, depcruise, OpenAPI diff, isolation suite, axe as named CI jobs; manual approval gate → prod; post-deploy smoke + auto-rollback |
| Docker | Multi-stage, non-root, pinned digests, healthcheck instructions; one image for api+worker (mode by command), one for web |
| Monitoring | Uptime Kuma (external), Prometheus node/postgres/redis exporters + Grafana (dashboards: API latency, queue depth, DLQ, DB connections, disk, backup age), Sentry FE+BE (release-tagged), BullMQ board admin-only |
| Logging | pino structured JSON → Loki (or file+rotation at MVP); trace_id/tenant_id on every line; no child PII in logs (lint + review rule) |
| Tracing | OpenTelemetry SDK wired (API + worker), OTLP export — collector optional at MVP, spans still enrich logs; full tracing backend when multi-host |
| Alerting | SAD §11 alert list → on-call channel; SEC-critical events (PERM-003, TOKEN-002, SAFE-001 volume, PLAT-003) routed distinctly |
| Backups | Nightly logical dump + WAL shipping to off-provider S3 (encrypted); backup-success metric alerted; **monthly restore rehearsal in staging (calendarized, runbook)** — RPO 15 min / RTO 4 h (SAD §6.4) |
| Secrets | Coolify secret store only; `.env.example` documented; rotation runbook; least-privilege DB roles (§4 M-000) |
| DR | Host-loss and provider-loss runbooks (SAD §6.4); config-as-code for Coolify; DNS TTL 300 |

# 10. Security Checklist (implementation gates)

| Item | Verification |
|------|-------------|
| OWASP ASVS L2 self-assessment | Checklist pass before beta; ZAP baseline clean |
| JWT: RS256, 15-min TTL, jti registry, ver claim | Integration tests + token-tamper tests |
| Refresh rotation + family revocation | SEC-TOKEN-002 test (reuse → family dead) |
| CSRF double-submit on cookie flows; SameSite=Strict | E2E |
| Rate limiting all tiers + headers | k6 assertion |
| RLS: no BYPASSRLS role in app path; policy per table | Isolation suite + migration linter |
| Encryption: TLS everywhere, field-level (medical, national IDs), S3 SSE, encrypted backups | Config audit + restore drill verifies decryption |
| Uploads: mime whitelist, size caps, re-encode + EXIF strip, quarantine path | Media pipeline tests incl. malicious-file corpus |
| Audit: hash chain verified job + anchor export | PLAT-003 drill |
| Secrets: repo scan (gitleaks) in CI; no secrets in images | CI job |
| Dependencies: audit + renovate weekly; image CVE scan | CI job; high CVE = block |
| Headers: CSP (no inline), HSTS, frame-ancestors none | ZAP/config test |

# 11. Release Strategy

| Stage | Definition | Exit criteria |
|-------|-----------|---------------|
| Alpha (S7) | Internal team + seeded demo tenant on staging | E2E green, NFR load test met |
| Private Beta (post-S8) | 2–3 friendly nurseries, sales-assisted (D4), free, real data, daily support | Launch gates green (below); 2 weeks stable daily loop; teacher adoption signals (activity completion ≥80%) |
| Pilot (paying) | 5–10 tenants, Egypt, paid plans live | Collection flow validated (O-metrics baseline started); churn signals none; support load sustainable |
| Public Beta / GA Egypt | Open sales-assisted onboarding | 99.5% availability over 30 days; F1 price points confirmed; TR-05 multi-host decision executed at 100 tenants |
| **Launch gates (hard blockers)** | PDPL review closed (F2) · LLM zero-retention contract signed · isolation suite + pgTAP green · restore rehearsal passed · load test met · Arabic microcopy review complete · a11y criticals zero · on-call rota + runbooks exist | |
| Feature flags | Per-tenant flags (existing design) gate: AI drafting, messaging, exports, any post-MVP feature; kill-switches for AI provider and media upload |
| Rollback | Previous image one-click (SAD §11.2); DB expand-contract discipline means no schema rollback needed; flag-off before rollback where possible |

# 12. Engineering Standards

| Standard | Rule |
|----------|------|
| Naming | Files kebab-case; classes PascalCase; DB per Domain Part 5; branches `feat/kf-123-short-name` |
| Folder rules | §1 + module internals §3; no cross-module deep imports (CI) |
| Coding | TS strict everywhere; no `any` (lint error); Result-based error flow in domain (no exceptions for business rules); ESLint+Prettier from `configs/` — zero local overrides |
| Architecture rules | New table → RLS class + linter; new endpoint → OpenAPI first + permission code; new module dependency → ADR; Shared Kernel change → ADR (SAD §3.2) |
| Commits | Conventional Commits (`feat(billing): …`); squash-merge; commitlint in CI |
| Branching | Trunk-based: short-lived branches (<3 days) → PR → squash to `main`; `main` always deployable; releases = tags |
| PR template | Linked story · what/why · screenshots (UI, both ar/en) · checklist: tests, OpenAPI parity, isolation suite, audit events, Design QA, docs · risk note |
| Review | 1 approval min; 2 for billing/attendance/security paths; module owner auto-requested (CODEOWNERS) |

# 13. Technical Debt Register (implementation view — extends SAD §14)

| ID | Debt | Priority | Owner | Plan |
|----|------|----------|-------|------|
| TD-01…09 | Carried from SAD §14 unchanged | per SAD | Lead | per SAD |
| TD-10 | No per-PR preview databases | Medium | DevOps | Add when team >5 or migration conflicts appear |
| TD-11 | OTel spans without dedicated tracing backend | Low | DevOps | Backend at multi-host milestone |
| TD-12 | Single OpenAPI spec hand+generated dual maintenance until generator stabilizes | Medium | BE lead | Converge in S2; CI diff guards meanwhile |
| TD-13 | Secondary LLM adapter is stub-fallback (template) not second provider | Medium | BE lead | Live second provider pre-GCC (TD-09) |
| TD-14 | E2E suite runs against shared staging (flaky risk) | Medium | QA | Isolated E2E env at pilot stage |

# 14. Risk Register (delivery)

| ID | Risk | Mitigation | Monitor |
|----|------|-----------|---------|
| DR-01 | TR-10 spike fails → RLS pattern rework ripples into S1+ | Spike is S0 item zero with fallback (app-layer guard + pgTAP proofs, per SAD TR-10); architecture allows either | S0 exit review |
| DR-02 | Offline sync complexity blows S3 | Contract fully specified (API §5); cut scope = activities sync (attendance sync is non-negotiable) | S3 mid-sprint check |
| DR-03 | 5-tap/10-s UX targets fail usability test | Usability test scheduled in S4 with 3 real teachers; iterate within sprint; targets are BRD acceptance criteria — failure = redesign before beta | S4 test report |
| DR-04 | Arabic microcopy/RTL polish underestimated | Native reviewer contracted from S2; RTL E2E from S2 not S7 | Per-sprint Design QA |
| DR-05 | Billing money-math defects (highest-severity bug class) | Property tests + mutation testing + accountant-shadowing in beta (parallel-run vs manual books for 1 cycle) | Beta reconciliation report |
| DR-06 | Single full-stack lead bottleneck on reviews | CODEOWNERS spread; architecture rules automated (linters carry the standards) | PR lead-time metric |
| DR-07 | Scope creep from pilot feedback | Change control: BRD scope table is contract; new asks → Phase-2 backlog unless launch-gate-critical | Sprint reviews |
| Release blockers | = §11 launch gates; tracked as a living checklist in `docs/07_Roadmap/launch-gates.md` from S6 | | |

# 15. Deliverables Summary

This blueprint + the approved Phase 0–6 stack constitutes the complete execution guide: repository and application architecture (§1–3), migration/seed sequence (§4), AI plan (§5), 9-sprint plan with DoD (§6–7), test/quality gates (§8), operations (§9–10), release path with hard launch gates (§11), standards that are CI-enforced rather than aspirational (§12), and living debt/risk registers (§13–14). Implementation may begin at S0 upon approval.

---

## Blueprint Review

The plan turns the documentation stack into a build order that front-loads existential risk: the RLS pattern is proven before any tenant data exists, and the gate — the hardest UX and reliability problem — ships to real hands by sprint 3. Every standard that matters is enforced by a machine (linters, CI diffs, isolation suite), not by memory. The sprint plan is honest about its two soft spots: offline sync (S3) and billing correctness (S6), both carrying explicit fallbacks and test regimes.

## Readiness Score

**92 / 100** — Deductions: team-size assumption (5 engineers) unconfirmed — sprint durations scale with reality (−3); usability targets validated only at S4, late for a BRD acceptance criterion (−3); preview-environment debt may slow FE review velocity (−2).

## Approval Checklist

| Item | Owner | Status |
|------|-------|--------|
| Monorepo & app architecture (§1–3) | Tech Lead | ☐ |
| Migration & seed plan (§4) | Tech Lead | ☐ |
| AI implementation plan incl. provider terms (§5) | Founder + Tech Lead | ☐ |
| Sprint plan & team assumption (§6) | Founder (resourcing) | ☐ |
| Testing gates as release blockers (§8) | Tech Lead | ☐ |
| Release strategy & launch gates (§11) | Founder | ☐ |
| Standards & registers (§12–14) | Tech Lead | ☐ |

## Next Recommended Phase

**Sprint 0 execution.** First three concrete actions: (1) initialize the monorepo per §1 with CI skeleton and linters live from commit one; (2) run the TR-10 Prisma↔RLS spike and publish its report to `docs/Decisions/`; (3) stand up staging on Coolify with M-000/001 applied and the isolation test harness proving red/green. In parallel: founder confirms team assumption, signs LLM data terms, and starts PDPL review (F2) — the longest-lead launch gate.

