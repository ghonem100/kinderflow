# 11 — Sprint 7: Analytics, Platform & Hardening (Detailed Task Specifications)

| Field | Value |
|-------|-------|
| Sprint goal | Owner-visible intelligence, platform operations, and the performance/security/accessibility hardening that beta requires |
| Entry criteria | Sprint 6 exit green (all domain data now exists to project) |
| Exit criteria | NFR load targets met; a11y zero criticals; break-glass fully audited; restore rehearsal passed; dashboards live from projections |
| Authority | Blueprint §6 (S7), §8–§10; SAD §9 (NFRs), §6.4 (DR), §11; Domain Model Part 2.12, Part 3 (tables 51–54), Part 9; API Contract §2.13, §2.15, §2.17; RBAC §6, §7; Design System §10, §13 |
| Inherited defaults | As declared in `05_Sprint_1.md` |

---

## A. Analytics (CQRS-lite projections)

### KF-S7-ANLY-001 — Migration M-007a: projection and platform tables
**Source of Truth** Domain Model Part 3 (tables 51–54), Part 6.2; Blueprint §4 M-007.
**Dependencies** KF-S6-BILL-002.
**Implementation** `kpi_daily_snapshots` (unique `(tenant_id, branch_id, date)`), `tenant_exports`, `break_glass_grants`; audit_log partitioning already established in Sprint 0/M-007 scope — verify monthly partitions exist and the attach/detach job is scheduled.
**Acceptance** Isolation probes pass; partition creation job produces next month's partition ahead of time (tested by fast-forwarding the scheduler).
**Risk** Medium · **Cx** M

### KF-S7-ANLY-002 — Projection workers (event-driven + nightly reconciliation)
**Source of Truth** SAD §3.3 (CQRS scope); Domain Model Part 2.12; Blueprint §3 (outbox).
**Dependencies** KF-S7-ANLY-001, KF-S6-BILL-011.
**Implementation** Consumers for attendance, enrollment, billing, and engagement events updating daily snapshots; nightly reconciliation job recomputing from source for the last N days; projections are **rebuildable** — a full rebuild command exists and is tested.
**Acceptance** (1) Deleting all snapshots and running the rebuild reproduces identical values (byte-comparable) from source data. (2) Reconciliation corrects a deliberately corrupted snapshot row and logs the correction. (3) Projections are never treated as a source of truth (no write path from analytics into domain tables — asserted by boundary lint).
**Risk** High · **Cx** L

### KF-S7-ANLY-003 — KPI overview endpoint
**Source of Truth** API Contract §2.13; BRD §8.1 (KPI definitions); Design System §10.
**Dependencies** KF-S7-ANLY-002.
**API** `GET /analytics/overview` perm `analytics:read`; scope-filtered (Owner tenant-wide, BranchManager own branch).
**Implementation** Occupancy, attendance %, revenue MTD, collection rate, outstanding, parent engagement — each computed per the BRD definition, with an "updated at" timestamp for trust; 60 s cache.
**Acceptance** (1) Each KPI matches an independent recomputation from source data in the test (definition parity). (2) A BranchManager receives only their branch's figures. (3) Response includes the projection freshness timestamp.
**Risk** High · **Cx** M

### KF-S7-ANLY-004 — Aging, trends, and engagement endpoints
**Source of Truth** API Contract §2.13; Design System §10.
**Dependencies** KF-S7-ANLY-003, KF-S6-BILL-010.
**Acceptance** Aging totals reconcile with the billing module's own query (cross-check test); trend series respect date-range and timezone rules.
**Risk** Medium · **Cx** M

### KF-S7-ANLY-005 — Async exports
**Source of Truth** API Contract §2.13; RBAC §6 (exports audited + owner-notified), §7 (SEC-DATA-001).
**Dependencies** KF-S7-ANLY-004, KF-S2-MEDIA-002.
**Implementation** Export job → file in S3 → download via signed URL; every export audited and the owner notified; role-scoped content (financial exports only for permitted roles).
**Acceptance** (1) Every export writes SEC-DATA-001 and notifies the Owner. (2) An export requested by a BranchManager contains only their branch's data. (3) Download links expire and are single-tenant scoped.
**Risk** High · **Cx** M

### KF-S7-ANLY-006 — Alert rules for the owner dashboard
**Source of Truth** Design System §10 (alerts strip); BRD §8.1.
**Dependencies** KF-S7-ANLY-003, KF-S5-COMM-007.
**Implementation** Rule-driven alerts: collection below target, occupancy drop, overdue beyond threshold, unacknowledged serious incidents; each alert links to its action.
**Acceptance** Each rule is configurable per tenant with documented defaults and produces a deep link to the relevant screen.
**Risk** Medium · **Cx** M

---

## B. Platform Plane

### KF-S7-PLAT-001 — Tenant lifecycle operations
**Source of Truth** SAD §4.3 (lifecycle); API Contract §2.17; RBAC §3 (platform column).
**Dependencies** KF-S1-TENANT-008.
**API** `POST /platform/tenants/{id}/suspend|reactivate|request-deletion`; perms `platform:tenant:update`; audit SEC-PLAT-002.
**Implementation** Suspension blocks tenant logins (session revocation from S1) while preserving data; optional parent read-only grace mode per settings; deletion request starts the documented soft→grace→purge pipeline **without executing purge in this sprint** (purge tooling is S8/post-MVP, per Domain Part 4.3).
**Acceptance** (1) Suspending a tenant immediately blocks all its users' tokens and shows the documented message. (2) A deletion request records intent, notifies the owner, and executes no destructive action.
**Risk** High · **Cx** M

### KF-S7-PLAT-002 — Break-glass grant flow
**Source of Truth** BRD BR-17; RBAC §1, §3, §7 (SEC-PLAT-001); API Contract §2.17.
**Dependencies** KF-S7-PLAT-001, KF-S1-AUDIT-001.
**API** `POST /platform/break-glass` (reason, duration ≤4 h), `GET /platform/break-glass/{id}`, `POST …/close`; perm `breakglass:request`.
**Implementation** Time-boxed grant; **tenant owner notified in real time**; every action performed under the grant is audited with the grant id; auto-expiry; no tenant data access without an active grant (enforced in the RLS predicate class `TENANT_OR_PLATFORM`).
**Testing** Negative: platform admin without a grant receives zero rows/404 on tenant data; expired grant stops access mid-session.
**Acceptance** (1) Without an active grant, a SUPER_ADMIN reading tenant data receives 404/zero rows. (2) The tenant Owner receives a real-time notification at grant issuance and can see the full history. (3) Every request made under a grant carries the grant id in its audit entry, and access ceases at expiry without requiring a new login.
**Risk** Critical · **Cx** L

### KF-S7-PLAT-003 — Feature flag administration
**Source of Truth** API Contract §2.17; Domain Model Part 3 (table 6); Blueprint §11 (flags gate features).
**Dependencies** KF-S1-TENANT-007.
**Acceptance** Global and per-tenant overrides manageable by SUPER_ADMIN only; kill-switches exist for AI drafting and media upload (Blueprint §11) and are tested by toggling them in staging.
**Risk** Medium · **Cx** M

### KF-S7-PLAT-004 — Platform health dashboard feed
**Source of Truth** API Contract §2.17; Blueprint §9 (monitoring).
**Dependencies** KF-S0-OPS-005.
**Acceptance** Aggregated tenant health (activity, queue depth per tenant, error rates, quota usage) available to SUPER_ADMIN without exposing tenant business data (no child names, no financial figures).
**Risk** Medium · **Cx** M

### KF-S7-PLAT-005 — Tenant export (offboarding/portability)
**Source of Truth** SAD §4.3 (backup/portability); BRD §11 (legal); API Contract §2.17.
**Dependencies** KF-S7-ANLY-005, KF-S7-PLAT-001.
**Implementation** Full-tenant logical export (all rows by tenant_id + S3 prefix manifest), encrypted, with a manifest and checksum; audited; used for offboarding and PDPL portability requests.
**Acceptance** (1) An export of a seeded tenant can be validated against the manifest checksum. (2) The export contains no other tenant's data (automated scan of the produced archive).
**Risk** High · **Cx** L

### KF-S7-PLAT-006 — Audit chain integrity job
**Source of Truth** RBAC §6 (tamper protection); Domain Model Part 7; RBAC §7 (SEC-PLAT-003).
**Dependencies** KF-S0-API-004.
**Implementation** Scheduled verification of the per-tenant hash chain; daily anchor export to separate storage; SEC-PLAT-003 critical alert on failure.
**Acceptance** (1) A deliberately tampered row causes the job to fail and page the on-call channel. (2) Anchors are written to a storage location distinct from the primary backup target.
**Risk** Critical · **Cx** M

---

## C. Hardening

### KF-S7-QA-001 — Load test: morning check-in spike
**Source of Truth** SAD §9 (NFR targets), §13 TR-03; Blueprint §8.
**Dependencies** KF-S3-ATT-003, KF-S7-ANLY-003.
**Implementation** k6 scenario: 5,000 concurrent check-ins across seeded tenants in the 07:00–09:00 profile, plus dashboard and feed load; measure p50/p95/p99, DB connections, queue depth.
**Acceptance** (1) API p95 <300 ms and p99 <800 ms under the target load. (2) No queue backlog growth beyond the drain rate. (3) Any breach produces named remediation tasks (index, cache, or replica) rather than a target relaxation.
**Risk** High · **Cx** L

### KF-S7-QA-002 — Query and index tuning pass
**Source of Truth** Domain Model Part 9; SAD §6.3.
**Dependencies** KF-S7-QA-001.
**Implementation** `pg_stat_statements` review; verify every index has a named query consumer and every hot query a tenant-led index; document findings; add missing partial indexes.
**Acceptance** (1) Top-20 queries by total time are all index-supported with p95 <50 ms. (2) Unused indexes are identified and removed or justified in writing.
**Risk** Medium · **Cx** M

### KF-S7-QA-003 — Accessibility audit and remediation
**Source of Truth** Design System §13 (WCAG 2.1 AA); Blueprint §8.
**Dependencies** All frontend tasks S1–S6.
**Implementation** axe-core across all surfaces (zero criticals gate), manual screen-reader pass in Arabic (VoiceOver/TalkBack ar-EG) on the four critical flows, keyboard-only pass including RTL tab order, contrast verification against the token table, reduced-motion verification.
**Acceptance** (1) Zero axe criticals across all surfaces. (2) The four critical flows are completable by keyboard only and by screen reader in Arabic, with findings documented. (3) Reduced-motion mode removes all non-essential animation including the AI shimmer.
**Risk** High · **Cx** L

### KF-S7-QA-004 — Security hardening pass
**Source of Truth** Blueprint §10 (checklist); RBAC §7; SAD §5.
**Dependencies** All API tasks S1–S6.
**Implementation** OWASP ASVS L2 self-assessment; ZAP baseline against staging; authz matrix fuzz generated from OpenAPI (every role × every endpoint); header verification (CSP without inline, HSTS, frame-ancestors); rate-limit verification per tier; upload corpus re-run.
**Acceptance** (1) Zero high findings. (2) The generated authz fuzz produces no unexpected allow. (3) Rate limits behave per tier with correct headers and `Retry-After`.
**Risk** Critical · **Cx** L

### KF-S7-QA-005 — Disaster recovery rehearsal #1
**Source of Truth** SAD §6.4 (RPO 15 min / RTO 4 h); Blueprint §9.
**Dependencies** KF-S0-OPS-005.
**Implementation** Full documented restore of staging from backup, timed; verify data integrity post-restore (row counts, checksum of a sample tenant export); update the runbook with actuals.
**Acceptance** (1) Restore completes within the 4-hour RTO with the elapsed time recorded. (2) Post-restore verification shows no data loss beyond the 15-minute RPO window. (3) The runbook is updated with any deviation encountered.
**Risk** High · **Cx** L

---

## D. Frontend

### KF-S7-FE-001 — Owner dashboard
**Source of Truth** Design System §10, §18 (owner wireframe); API Contract §2.13.
**Dependencies** KF-S7-ANLY-003, KF-S7-ANLY-006.
**Implementation** KPI row with deltas and sparklines, alerts strip, charts grid (revenue trend, occupancy by branch, aging buckets, attendance heatmap), branch comparison table; each KPI drill-through; projection freshness label; chart RTL treatment per UXD-01.
**Acceptance** (1) Dashboard renders within the 1.5 s budget on the seeded dataset. (2) Every KPI card links to its detail view. (3) Charts have data-table alternatives for screen readers (Design §13).
**Risk** Medium · **Cx** L

### KF-S7-FE-002 — Audit log UI and exports
**Source of Truth** API Contract §2.15; RBAC §6.
**Dependencies** KF-S1-AUDIT-002, KF-S7-ANLY-005.
**Acceptance** Role-scoped subsets rendered read-only with filters; no UI affordance exists to modify an entry; export triggers the audited flow.
**Risk** Medium · **Cx** M

### KF-S7-FE-003 — Platform console (tenants, health, flags, break-glass)
**Source of Truth** Design System §04, §18 (platform wireframe); API Contract §2.17.
**Dependencies** KF-S7-PLAT-002, KF-S7-PLAT-004.
**Acceptance** Break-glass request form requires reason + duration and displays an expiry countdown while active; platform chrome is visually distinct; no tenant business data appears without an active grant.
**Risk** High · **Cx** L

### KF-S7-FE-004 — Branch manager dashboard and approvals inbox
**Source of Truth** Design System §06 (BM nav), §10.
**Dependencies** KF-S3-SYNC-005, KF-S5-COMM-006, KF-S2-CHILD-005.
**Implementation** Single approvals inbox aggregating: attendance amendments, pending pickup persons, announcement drafts, incidents, sync conflicts.
**Acceptance** Every pending item type appears with its aging; acting on an item removes it from the queue and writes the corresponding audit event.
**Risk** Medium · **Cx** L

---

## Sprint 7 Exit Checklist

| Gate | Evidence |
|---|---|
| NFR load | p95 <300 ms at 5k concurrent check-ins; report attached |
| Projections | Full rebuild reproduces identical values |
| Break-glass | No tenant access without a grant; owner notified; all actions audited |
| Audit integrity | Tamper detection fires; anchors exported off-primary |
| Accessibility | Zero axe criticals; Arabic SR pass on four flows |
| Security | ASVS L2 self-assessment complete; zero high findings |
| DR | Restore rehearsal within RTO; runbook updated with actuals |
