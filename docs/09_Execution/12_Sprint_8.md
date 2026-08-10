# 12 — Sprint 8: Beta Readiness (Detailed Task Specifications)

| Field | Value |
|-------|-------|
| Sprint goal | Take the system from "feature complete" to "safe to put a real nursery's children and money on it" |
| Entry criteria | Sprint 7 exit green (load, security, a11y, DR all passed) |
| Exit criteria | Every launch gate in Blueprint §11 green; pilot tenant onboarded by the CS flow; on-call rota active |
| Authority | Blueprint §6 (S8), §11 (release strategy and launch gates), §9; BRD §12.2 (F1–F4), §13.1 (recommendations 2 and 5); Design System §20 (microcopy) |
| Inherited defaults | As declared in `05_Sprint_1.md` |

---

### KF-S8-OPS-001 — Production environment provisioning
**Source of Truth** SAD §11.1; Blueprint §9; DISC-006 (F4 hosting region).
**Dependencies** KF-S0-OPS-004, KF-S7-QA-005; **external: F4 decision**.
**Implementation** Production Coolify project mirroring staging topology in the F4-decided region; secrets provisioned fresh (never copied from staging); production JWT keypair generated; deploy gated by manual approval; DNS + TLS + HSTS.
**Security** Production secrets never touch developer machines or staging; access limited per the least-privilege list in the runbook.
**Acceptance** (1) Production deploys only through the approved pipeline with manual approval. (2) Staging and production share no secret material (verified by comparing key fingerprints). (3) Health checks and rollback verified with a deliberate bad deploy.
**Risk** Critical · **Cx** L

### KF-S8-OPS-002 — Production monitoring, alerting, and on-call
**Source of Truth** Blueprint §9 (alerting), §11 (launch gates); RBAC §7 (critical events).
**Dependencies** KF-S8-OPS-001, KF-S0-OPS-005.
**Implementation** Production dashboards; alert routing for: downtime, error-rate spike, queue depth, DLQ entries, disk >80%, backup failure, cert expiry, and the critical security events (SEC-PERM-003, SEC-TOKEN-002, SEC-SAFE-001 volume, SEC-PLAT-003); threshold tuning from staging baselines; on-call rota and escalation policy documented.
**Acceptance** (1) Each alert is fired once in a controlled test and reaches the on-call channel. (2) Thresholds are recorded with their rationale (replacing the Blueprint's estimated values). (3) An on-call rota with named humans and an escalation path exists.
**Risk** High · **Cx** M

### KF-S8-OPS-003 — Production backup verification and DR drill #2
**Source of Truth** SAD §6.4; Blueprint §11 (launch gate).
**Dependencies** KF-S8-OPS-001.
**Implementation** Verify nightly dumps + WAL archiving in production; run a full restore drill into an isolated environment; verify encryption and off-provider storage.
**Acceptance** (1) Production backup age metric is monitored and alerting. (2) Restore drill completes within RTO with data verified. (3) Backup encryption keys are recoverable per the documented procedure (tested, not assumed).
**Risk** Critical · **Cx** L

### KF-S8-OPS-004 — Runbooks and incident response
**Source of Truth** Blueprint §9, §11; SAD §6.4.
**Dependencies** KF-S8-OPS-002.
**Implementation** Runbooks: host loss, provider loss, database restore, secret rotation, break-glass procedure, security incident response (including PDPL breach-notification steps), gate-offline paper fallback (BRD R-06), queue backlog, DLQ triage.
**Acceptance** Each runbook has been walked through by someone other than its author; the paper fallback procedure is printable and included in pilot onboarding materials.
**Risk** High · **Cx** M

---

### KF-S8-PLAT-001 — Guided data import (Excel) for onboarding
**Source of Truth** BRD §13.1 recommendation 2 (accepted); Blueprint §6 (S8), §14 DR-05 (activation risk).
**Dependencies** KF-S2-CHILD-003, KF-S6-BILL-005.
**Implementation** Template workbooks (children + guardians, fee plans/assignments) in Arabic and English; import with validation preview, per-row error reporting, dry-run mode, and idempotent re-import; imports are audited and attributable.
**Testing** Malformed-file corpus; partial-failure handling; duplicate detection; large-file (1,000 rows) performance.
**Acceptance** (1) A 200-child workbook imports with a preview showing every validation error before anything is written. (2) Re-importing the same file creates no duplicates. (3) Import failures never leave partial families (child without guardians).
**Risk** High · **Cx** L

### KF-S8-PLAT-002 — CS onboarding console
**Source of Truth** BRD §13.1 recommendation 5 (accepted); D4 (sales-assisted onboarding); API Contract §2.17.
**Dependencies** KF-S8-PLAT-001, KF-S7-FE-003.
**Implementation** Internal console: provisioning wizard, import tools, setup checklist per tenant (branches → classrooms → staff → children → fee plans → first invoice), tenant health view showing activation progress.
**Acceptance** (1) A CS operator can take a new tenant from zero to first-invoice-ready following the checklist without engineering help. (2) The checklist state is per tenant and visible to the whole CS team.
**Risk** High · **Cx** L

---

### KF-S8-AI-001 — Arabic microcopy review and AI output language QA
**Source of Truth** BRD §13.1 recommendation 4; Design System §03, §20; Blueprint §14 DR-04.
**Dependencies** All frontend tasks; KF-S5-QA-001.
**Implementation** Native-speaker review of every user-facing string (UI, notifications, invoices, error messages) for Egyptian Arabic naturalness — not literal translation; AI draft output reviewed on the golden set for tone and register; corrections applied to the i18n catalogs and prompt templates.
**Acceptance** (1) Every string key has a reviewed Arabic value with reviewer sign-off recorded. (2) AI drafts in Arabic read naturally to the reviewer on all 50 golden-set cases. (3) Error messages are actionable in Arabic, not transliterated English.
**Risk** High · **Cx** L

---

### KF-S8-QA-001 — Full regression and cross-surface E2E
**Dependencies** All prior sprints.
**Implementation** Complete Playwright suite across all six critical journeys in ar and en, desktop and mobile viewports, plus the offline matrix; run against production-like data volumes.
**Acceptance** All journeys green; runtime recorded; flaky tests quarantined with owners, not ignored.
**Risk** High · **Cx** L

### KF-S8-QA-002 — Manual accessibility and screen-reader pass
**Source of Truth** Design System §13; Blueprint §8 (per-release manual pass).
**Dependencies** KF-S7-QA-003.
**Acceptance** Arabic screen-reader pass on the four critical flows repeated on release candidate; keyboard-only pass; findings triaged with none open at critical severity.
**Risk** Medium · **Cx** M

### KF-S8-QA-003 — Beta acceptance checklist execution
**Source of Truth** Blueprint §11 (launch gates); this document's exit criteria.
**Dependencies** All S8 tasks.
**Implementation** Execute and evidence every launch gate: PDPL review closed (F2) · LLM zero-retention signed · isolation suite + pgTAP green · restore rehearsal passed · load test met · Arabic microcopy complete · a11y criticals zero · on-call rota + runbooks exist.
**Acceptance** Each gate has named evidence (link, report, or signature); no gate is marked complete by assertion alone.
**Risk** Critical · **Cx** M

---

### KF-S8-DOC-001 — Support and operations documentation
**Source of Truth** D4 (sales-assisted model); Blueprint §11.
**Dependencies** KF-S8-PLAT-002, KF-S8-OPS-004.
**Implementation** CS-facing: onboarding guide, common issues, escalation path to engineering, what CS may and may not do (no break-glass without procedure); tenant-facing: getting-started guide in Arabic and English, gate paper-fallback sheet.
**Acceptance** A CS operator unfamiliar with the build can onboard a tenant and resolve the top-5 anticipated issues using these documents alone.
**Risk** Medium · **Cx** M

### KF-S8-DOC-002 — Launch-gate tracker and post-beta backlog
**Source of Truth** Blueprint §11, §13 (technical debt), §14.
**Dependencies** KF-S8-QA-003.
**Implementation** Living `docs/07_Roadmap/launch-gates.md` with gate status and evidence links; post-beta backlog seeded from the debt register (TD-01…TD-14) and any findings from S7–S8 hardening, prioritized.
**Acceptance** Tracker reflects real status at pilot start; every accepted debt item has an owner and a revisit trigger.
**Risk** Low · **Cx** S

---

### KF-S8-PILOT-001 — Pilot tenant onboarding (private beta)
**Source of Truth** Blueprint §11 (private beta definition); D4.
**Dependencies** KF-S8-QA-003, KF-S8-PLAT-002.
**Implementation** Onboard 2–3 friendly nurseries via the CS console with real data; daily support cadence; instrument the BRD O-metrics baseline (teacher time, engagement, collection); run the billing parallel-run procedure (KF-S6-QA-004) for one full cycle.
**Acceptance** (1) Each pilot tenant completes a full day-loop and one billing cycle. (2) The billing parallel run shows zero unexplained discrepancies; any discrepancy is triaged to root cause before pilot exit. (3) Teacher activity-completion and parent-engagement baselines are recorded against BRD targets.
**Risk** Critical · **Cx** XL (decompose per tenant: prepare → import → train → observe week 1 → review)

---

## Sprint 8 Exit Checklist (= Private Beta Entry)

| Gate | Evidence required |
|---|---|
| PDPL review closed (F2) | Legal sign-off document |
| LLM zero-retention terms | Signed agreement |
| Isolation + pgTAP | CI green on release candidate |
| Restore rehearsal (production) | Timed drill report within RTO |
| Load test | p95/p99 report meeting NFR |
| Arabic microcopy | Reviewer sign-off on all strings |
| Accessibility | Zero criticals; manual SR pass report |
| On-call and runbooks | Rota published; runbooks walked through |
| Billing parallel run | Cycle comparison with zero unexplained variance |
| Pilot readiness | CS console + import tools + support docs in use |
