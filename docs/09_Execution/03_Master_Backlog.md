# 03 — Master Engineering Execution Backlog

| Field | Value |
|-------|-------|
| Document | Master Backlog — Epic → Sprint → Task index (Phase 9) |
| Version | 1.0 |
| Date | 2026-08-10 |
| Scope | 178 tasks across 9 sprints. This file is the **index**; full task specifications live in `04_Sprint_0.md` … `12_Sprint_8.md` |
| Authority | Sprint scope follows Engineering Blueprint §6 verbatim. Where the Phase 9 request named a sprint theme differing from the Blueprint, **the Blueprint wins** (see §3 note on S6/S7) |

---

## 1. Task ID Convention

`KF-S{sprint}-{EPIC}-{seq}` — e.g. `KF-S1-AUTH-004`.

| Epic code | Domain |
|---|---|
| `INFRA` | Repository, workspace, build tooling |
| `CI` | Pipelines and quality gates |
| `OPS` | Docker, Coolify, monitoring, backups, secrets, DR |
| `RLS` | Tenant-isolation mechanism (TR-10, harness, policies) |
| `CONTRACT` | `@kf/contracts`: OpenAPI, zod, permissions, enums, error codes, events |
| `AUTH` | Authentication, sessions, tokens, MFA-readiness |
| `TENANT` | Organizations, branches, classrooms, subscriptions, settings, flags |
| `IAM` | Users, roles, permissions, scopes, guards |
| `CHILD` | Children, guardians, pickups, medical, consents, documents |
| `ATT` | Attendance events, days, amendments |
| `SYNC` | Offline queue, batch sync, conflict handling |
| `ACT` | Activity entries, medication |
| `RPT` | Daily reports lifecycle |
| `AI` | Drafting pipeline, prompts, quotas, fallback |
| `MEDIA` | Upload pipeline, consent-aware access, quotas |
| `BILL` | Fee plans, assignments, invoices |
| `PAY` | Payments, allocations, credits, balances |
| `COMM` | Conversations, messages, announcements, incidents |
| `NOTIF` | Notification dispatch, preferences, channels |
| `ANLY` | KPI projections, dashboards, exports |
| `PLAT` | Platform plane: tenant lifecycle, break-glass, flags |
| `AUDIT` | Audit writer, chain integrity, audit APIs |
| `FE` | Frontend surfaces (suffix `-CON` console, `-TCH` teacher, `-PAR` parent, `-GATE` gate, `-PLT` platform) |
| `QA` | Test harnesses, suites, load/security/a11y testing |
| `DOC` | Repository documentation |

---

## 2. Epics (cross-sprint)

| # | Epic | Goal | Primary sprints | Exit definition |
|---|---|---|---|---|
| E1 | **Engineering Foundation** | Repo, workspace, CI gates, dev env, contracts package | S0 | Fresh clone → productive; every rule fails a build when violated |
| E2 | **Tenant Isolation** | Prove and enforce the RLS pattern everywhere | S0 (mechanism) + every DB sprint (per-module policies) | Isolation suite covers 100% of tenant tables and endpoints; PR-blocking |
| E3 | **Identity & Access** | Authentication, sessions, RBAC guards, scopes | S1 | Every endpoint carries exactly one permission code; negative tests green |
| E4 | **Tenancy & Platform** | Org/branch/classroom, subscriptions, provisioning, break-glass | S1, S8 | Tenant provisioned in <5 min; break-glass audited and owner-notified |
| E5 | **Child Record** | Children, guardians, pickups, medical, consents, documents | S2 | Admission E2E; FL rules enforced in DTOs |
| E6 | **Attendance & Safety** | Gate flows, authorization enforcement, amendments | S3 | Check-in ≤10 s; unauthorized pickup blocked + alerted |
| E7 | **Offline Resilience** | Service worker, queue, batch sync, conflicts | S3 | 24 h offline → full reconciliation, zero silent drops |
| E8 | **Daily Loop** | Activities, media, daily reports | S4 | Log ≤5 taps; draft→approve→publish→parent feed |
| E9 | **AI Drafting** | Structured-input drafting with human gate | S4 (+S7 usage insight) | No publish path without teacher approval; fallback proven |
| E10 | **Billing Integrity** | Fee plans, invoices, payments, credits | S5 | Cycle run + money invariants property-tested |
| E11 | **Communication** | Messaging, announcements, incidents, notifications | S6 | Quiet hours honored; safety alerts unsuppressable |
| E12 | **Analytics** | KPI projections, dashboards, exports | S7 | Dashboard p95 <1.5 s from projections |
| E13 | **Production Hardening** | Load, security, a11y, DR, beta readiness | S7–S8 | All launch gates green |

---

## 3. Sprint Map (Blueprint §6, authoritative)

| Sprint | Blueprint theme | Phase 9 request theme | Reconciliation |
|---|---|---|---|
| S0 | Foundations | Architecture/infra validation | Identical |
| S1 | Identity & Tenancy | Identity & Tenancy | Identical |
| S2 | Children & Families | Children & Guardians | Identical |
| S3 | Attendance & Gate (incl. offline sync) | Attendance + Offline Sync | Identical |
| S4 | Activities, Media, Reports (non-AI templates) | Activities + Reports + AI | **Blueprint wins**: S4 delivers activities, media, and the report lifecycle with *template* drafts; AI drafting ships S5 alongside Communication |
| S5 | AI + Communication | Billing + Payments | **Blueprint wins**: S5 = AI + Communication |
| S6 | Billing | Communication + Notifications | **Blueprint wins**: S6 = Billing |
| S7 | Analytics, Platform, Hardening | Analytics + AI Intelligence | **Blueprint wins**: S7 = Analytics + Platform + hardening (load, a11y, restore rehearsal) |
| S8 | Beta readiness | Hardening + Beta Readiness | Identical |

Rationale for keeping the Blueprint order (already approved, and it is the safer sequence): the daily loop must exist and be trusted *before* AI writes about it, and billing benefits from stable enrollment + attendance data. Priority instruction §5 is satisfied — security, isolation, auth, and data integrity all precede feature UI, and no attractive UI feature precedes them.

---

## 4. Task Index

Complexity: **S** ≤½ day · **M** ~1 day · **L** 2–3 days · **XL** split candidate (none permitted to ship un-split; XL marked tasks carry a mandatory decomposition note in their sprint file).

### Sprint 0 — Foundations (30 tasks + 1 founder track) → `04_Sprint_0.md`

| ID | Title | Cx | Risk |
|---|---|---|---|
| KF-S0-INFRA-001 | Initialize git repository and commit conventions baseline | S | Low |
| KF-S0-INFRA-002 | Create pnpm workspace + monorepo folder tree | M | Low |
| KF-S0-INFRA-003 | Shared configs package (tsconfig base, ESLint, Prettier) | M | Low |
| KF-S0-INFRA-003a | Broaden RTL physical-utility lint rule (follow-up, R-6) | S | Low |
| KF-S0-INFRA-004 | Turborepo pipeline + TypeScript project references | M | Medium |
| KF-S0-INFRA-005 | Husky, lint-staged, commitlint, Changesets, Renovate | S | Low |
| KF-S0-INFRA-005a | Consolidate commit scopes; relax Prettier assertion (follow-up, D-11/R-11) | S | Low |
| KF-S0-OPS-001 | GitHub remote, branch protection, CODEOWNERS | S | Low |
| KF-S0-OPS-002 | Docker Compose dev environment + `dev-setup.sh` | L | Medium |
| KF-S0-OPS-003 | Dockerfiles for api and web | M | Medium |
| KF-S0-OPS-004 | Coolify staging project + deploy pipeline | L | High |
| KF-S0-OPS-005 | Monitoring, logging sinks, Sentry, backups + restore drill | L | Medium |
| KF-S0-CI-001 | CI workflow: lint, typecheck, build, test jobs | M | Low |
| KF-S0-CI-002 | Dependency-cruiser boundary rules + failing fixture | M | Medium |
| KF-S0-CI-003 | Migration linter (RLS annotation gate) + failing fixture | L | High |
| KF-S0-CI-004 | Security scanning jobs (gitleaks, audit, trivy) | S | Low |
| KF-S0-RLS-001 | **TR-10 spike: Prisma × RLS tenant context** (ITEM 0, CRITICAL) | XL | Critical |
| KF-S0-RLS-002 | ADR-010: RLS integration pattern decision record | M | Critical |
| KF-S0-RLS-003 | Tenant isolation test harness (red/green proven) | L | Critical |
| KF-S0-CONTRACT-001 | `@kf/contracts` skeleton: OpenAPI root, permissions, errors, enums | L | Medium |
| KF-S0-API-001 | NestJS bootstrap: config, logging, health, error filter, Swagger | L | Medium |
| KF-S0-API-002 | Redis + BullMQ wiring with heartbeat queue and DLQ proof | M | Medium |
| KF-S0-API-003 | Prisma init + migrations M-000/M-001 + tier-1 seed | L | High |
| KF-S0-API-004 | Audit writer with hash chain (unit-pinned) | M | High |
| KF-S0-FE-001 | Next.js bootstrap with route groups and shells | M | Low |
| KF-S0-FE-002 | `@kf/tokens` build → CSS vars + Tailwind preset | M | Medium |
| KF-S0-FE-003 | `@kf/ui` shadcn init + first 5 components | L | Medium |
| KF-S0-FE-004 | `@kf/i18n` ar/en + RTL proof page + formatters | M | Medium |
| KF-S0-FE-005 | TanStack Query provider + generated API client wiring | M | Medium |
| KF-S0-FE-006 | PWA: Serwist, offline fallback, write-queue store skeleton | L | High |
| KF-S0-DOC-001 | Rewrite README + development guide + architecture overview | M | Low |
| KF-S0-DOC-002 | PR/issue templates + empty-docs-folder pointers | S | Low |

Plus `KF-S0-EXT-001` (founder/external track — not an engineering task, tracked for dependency clarity).

### Sprint 1 — Identity & Tenancy (26 tasks) → `05_Sprint_1.md`

`KF-S1-TENANT-001…008` (migrations M-002, org/branch/classroom CRUD, settings, subscription read, provisioning workflow, feature flags) · `KF-S1-AUTH-001…009` (migration M-003, password service, login, JWT issuance, refresh rotation + reuse detection, session registry, logout, password reset, invitation acceptance) · `KF-S1-IAM-001…005` (roles/permissions seed, guards pipeline, scope resolvers, `/auth/me`, role assignment endpoints) · `KF-S1-AUDIT-001…002` (auth/permission audit events, audit API read) · `KF-S1-QA-001` (isolation suite extension) · `KF-S1-FE-CON-001` (login + shell + role-based nav skeleton).

### Sprint 2 — Children & Families (24 tasks) → `06_Sprint_2.md`

`KF-S2-CHILD-001…012` (M-004 migration set, child CRUD, guardians + links, primary-guardian invariant, authorized pickups + approval, medical records + alerts, consents, documents, withdrawal + retention clock, search) · `KF-S2-MEDIA-001…005` (upload request/complete, processing worker, consent-aware access URLs, quota accounting) · `KF-S2-FE-CON-001…004` (admission wizard, child profile, pickup manager, guardian invite) · `KF-S2-QA-001…003` (isolation, FL-rule DTO tests, admission E2E).

### Sprint 3 — Attendance + Offline Sync (27 tasks) → `07_Sprint_3.md`

`KF-S3-ATT-001…009` (M-005 attendance tables + triggers, check-in, check-out with pickup authorization, sequence rules, day close job, amendments + approval, presence/ratio endpoint) · `KF-S3-SYNC-001…007` (batch sync endpoint, idempotency, duplicate collapse, clock skew, conflict → pending review, sync-state endpoint, replay protection) · `KF-S3-FE-GATE-001…005` (gate shell, search/QR/PIN identify, check-in confirm, pickup verification, unauthorized takeover) · `KF-S3-FE-TCH-001…002` (Today roster, fallback check-in) · `KF-S3-QA-001…004` (offline matrix E2E, isolation, safety negative tests, 10-second timing test).

### Sprint 4 — Activities, Media, Reports (24 tasks) → `08_Sprint_4.md`

`KF-S4-ACT-001…008` (activity entries + typed payloads, batch logging, edit-freeze policy, medication authorizations + administrations) · `KF-S4-RPT-001…006` (daily report aggregate, template draft generation, review, approve→publish, parent feed query, report exports) · `KF-S4-FE-TCH-001…004` (quick-log grid ≤5 taps, batch mode, report queue, review screen) · `KF-S4-FE-PAR-001…003` (parent feed, report view, media gallery) · `KF-S4-QA-001…003` (5-tap usability instrumentation, consent enforcement tests, loop E2E).

### Sprint 5 — AI + Communication (23 tasks) → `09_Sprint_5.md`

`KF-S5-AI-001…008` (provider port + adapter, prompt registry, ACL snapshot builder, generation worker + batching, output validation, quota enforcement, fallback path, usage accounting) · `KF-S5-COMM-001…007` (conversations, messages + quiet hours, recall window, announcements + approval, incidents + severity flow, acknowledgments, escalation audit) · `KF-S5-NOTIF-001…004` (dispatch worker, channels, preferences, unsuppressable safety alerts) · `KF-S5-FE-001…003` (AI review UX, messaging UI, incident forms) · `KF-S5-QA-001` (AI golden-set evals + PII-leak tests).

### Sprint 6 — Billing (25 tasks) → `10_Sprint_6.md`

`KF-S6-BILL-001…011` (M-006, Money value object, fee plans/components, discount engine, fee assignments, invoice generation job, snapshots, immutability, issue flow, proration, aging) · `KF-S6-PAY-001…007` (payments, allocations, overpayment→credit, credit notes, balance derivation, concurrency locks, receipts) · `KF-S6-FE-001…004` (accountant billing console, cycle review, payment recording, parent payments view) · `KF-S6-QA-001…003` (property tests, invariant/transaction tests, billing E2E).

### Sprint 7 — Analytics, Platform, Hardening (21 tasks) → `11_Sprint_7.md`

`KF-S7-ANLY-001…006` (projection tables + workers, KPI endpoints, aging/trends, exports, reconciliation job) · `KF-S7-PLAT-001…006` (tenant lifecycle ops, break-glass grant flow + notifications, feature flag admin, platform health, tenant exports) · `KF-S7-QA-001…005` (load test 5k check-ins, index tuning, a11y audit, security scan pass, restore rehearsal) · `KF-S7-FE-001…004` (owner dashboard, audit log UI, platform console).

### Sprint 8 — Beta Readiness (12 tasks) → `12_Sprint_8.md`

`KF-S8-OPS-001…004` (production provisioning, alert tuning, DR drill, on-call runbooks) · `KF-S8-QA-001…003` (full regression, SR/a11y manual pass, beta acceptance checklist) · `KF-S8-DOC-001…002` (support docs, launch-gate tracker) · `KF-S8-PLAT-001…002` (Excel import tooling, CS onboarding console) · `KF-S8-AI-001` (Arabic microcopy + AI output language QA).

---

## 5. Milestones

| Milestone | Sprint | Gate |
|---|---|---|
| **M1 — Rails proven** | End S0 | ADR-010 merged; isolation harness red→green; staging deploys from CI |
| **M2 — Tenant-safe login** | End S1 | Auth + RBAC + isolation suite covering all shipped endpoints |
| **M3 — Child record live** | End S2 | Admission E2E in ar + en |
| **M4 — Gate operational** | End S3 | ≤10 s check-in; offline matrix green |
| **M5 — Daily loop closed** | End S4 | Log → report → parent feed |
| **M6 — AI + comms** | End S5 | Approval gate structural; golden evals green |
| **M7 — Money correct** | End S6 | Invariants + property tests; cycle in target time |
| **M8 — Production-ready** | End S7 | NFR load targets; a11y; restore rehearsed |
| **M9 — Private beta** | End S8 | All launch gates (Blueprint §11) green |

---

## 6. Global Conventions Applied to Every Task

These are stated once here and referenced (not repeated) by task specs:

1. **Source of truth precedence:** BRD → SAD/ADR → Domain Model → RBAC → API Contract → Design System → Blueprint. A conflict between them is a **BLOCKER**, not an implementation choice.
2. **No architectural decisions during implementation.** If a task cannot be completed without one, stop and raise a classified item (§22 of the Phase 9 brief).
3. **Every endpoint** carries exactly one permission code from `@kf/contracts/permissions`, present in OpenAPI as `x-permission-code`.
4. **Every tenant table** ships with `tenant_id`, an RLS policy in the same migration, `FORCE ROW LEVEL SECURITY`, tenant-led composite indexes, and isolation-suite coverage.
5. **Money never uses floating point** — integer minor units + currency, via the shared `Money` value object.
6. **AI never publishes** — no code path exists from generation to parent-visible content without a human approval transition.
7. **Offline events are never silently discarded** — every synced event resolves to APPLIED, DUPLICATE, PENDING_REVIEW, or REJECTED with a reason.
8. **Universal Definition of Done** (`15_Definition_of_Done.md`) applies to all tasks; task files list only *additional* DoD items.
