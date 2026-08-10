# 14 — Implementation Risk Register

| Field | Value |
|-------|-------|
| Document | Implementation Risk Register (Phase 9) |
| Version | 1.0 |
| Date | 2026-08-10 |
| Scope | Execution risks only. Architectural risks (TR-01…TR-10) and delivery risks (DR-01…DR-07) from approved documents are **carried forward unchanged** and referenced, not restated or revised |
| Scale | Likelihood L/M/H × Impact Low/Medium/High/Critical |

---

## 1. Top 10 Engineering Risks (ranked by exposure)

| # | ID | Risk | L | Impact | Mitigation (task-linked) | Monitoring signal | Release blocker? |
|---|----|------|---|--------|--------------------------|-------------------|------------------|
| 1 | **IR-01** | TR-10 spike yields option C or fails outright → tenant-context pattern reworked mid-programme | M | Critical | `KF-S0-RLS-001` is Item 0 with a 4-day timebox and a pre-approved fallback (SAD TR-10 option C); no DB feature task starts before ADR-010 | Spike exit review at S0 day 4; any slip escalates immediately | **Yes** — S0 cannot exit |
| 2 | **IR-02** | An RLS policy is missed on a new table → cross-tenant exposure | M | Critical | Migration linter (`KF-S0-CI-003`) + isolation harness (`KF-S0-RLS-003`) + per-sprint coverage tasks; both proven to fail on fixtures | SEC-PERM-003 firing in any environment; harness coverage report | **Yes** |
| 3 | **IR-03** | Offline sync loses or silently duplicates a custody event | M | Critical | Idempotency at batch + event level, four-outcome result contract, nine-scenario matrix (`KF-S3-QA-001`), 24 h aged-item escalation UI | Queue age metrics; PENDING_REVIEW backlog; any unaccounted event in test | **Yes** |
| 4 | **IR-04** | Money defect (rounding, allocation, double-issue) reaches a paying tenant | M | Critical | Money VO with no float path + lint rule, property + mutation tests (`KF-S6-QA-001`), DB triggers as backstop, beta parallel run (`KF-S6-QA-004`) | Invariant test failures; parallel-run variance | **Yes** |
| 5 | **IR-05** | Unauthorized pickup succeeds through an untested path (stale offline cache, pending entry, race) | L | Critical | Single domain authorization service used by both paths (`KF-S3-ATT-002`), safety negative suite (`KF-S3-QA-003`), stale-cache warning (`KF-S3-FE-GATE-005`), unsuppressable alerts | SEC-SAFE-001 volume and pattern review | **Yes** |
| 6 | **IR-06** | AI publishes or leaks PII despite the approval gate | L | Critical | Structural no-bypass test (`KF-S4-RPT-001`), snapshot leak suite (`KF-S5-AI-003`), golden-set evals gating prompt merges (`KF-S5-QA-001`), fallback path | Eval failures; any draft reaching a parent endpoint in tests | **Yes** |
| 7 | **IR-07** | Performance targets missed at the morning check-in spike | M | High | Load test in S7 (`KF-S7-QA-001`) with remediation tasks pre-authorized (index, cache, read replica per SAD §1.4 ladder); query budget assertions from S2 onward | p95 trend per sprint; pg_stat_statements review | Yes (NFR gate) |
| 8 | **IR-08** | Frontend RTL/Arabic quality fails real users despite passing tests | M | High | RTL-first from S0 (`KF-S0-FE-004`), lint bans physical properties, ar+en E2E every sprint, native microcopy review (`KF-S8-AI-001`), teacher usability session in S4 | Usability session findings; pilot feedback | Yes (microcopy gate) |
| 9 | **IR-09** | Scope drift — contract/design changes made silently during implementation | M | High | OpenAPI diff gate, permission-code startup assertion, discrepancy-register procedure (no silent edits), PR template risk note | CI diff failures; unregistered discrepancies found in review | No (process) |
| 10 | **IR-10** | External blockers (PDPL, LLM terms, hosting region, accounts) stall sprints | H | Medium | Parallel founder track from day one (`KF-S0-EXT-001`), blocked-work rule in `13_Dependencies.md` §6, longest-lead item (F2) started first | Weekly blocker review; `13_Dependencies.md` §5 status | Yes for beta (F2) |

---

## 2. Additional Implementation Risks

| ID | Risk | L | Impact | Mitigation | Blocker? |
|----|------|---|--------|-----------|----------|
| IR-11 | Prisma cannot express required constructs (partial indexes, triggers, partitions) cleanly, causing migration drift | M | Medium | Hand-written SQL block convention below generated DDL (Blueprint §4); shadow-DB validation in CI; pgTAP pins trigger behavior | No |
| IR-12 | Trigger logic and domain logic diverge over time (totals, alternation, hash chain) | M | High | Triggers are backstops only; same rules asserted in domain tests; pgTAP + domain tests must both cover each rule | No |
| IR-13 | Test suite runtime grows until CI becomes a bottleneck and gates get bypassed | M | High | Turbo caching, parallel jobs, isolation suite optimized for matrix generation; PR pipeline duration tracked in the development guide and reviewed each sprint | No |
| IR-14 | E2E flakiness on shared staging (TD-14) erodes trust in the gates | M | Medium | Quarantine-with-owner policy (never ignore); isolated E2E environment at pilot stage | No |
| IR-15 | Outbox dispatcher backlog delays notifications and projections | L | Medium | Queue depth alerts; dispatcher idempotency; backpressure per tenant | No |
| IR-16 | Media pipeline cost/abuse (large uploads, retries) exceeds plan economics | M | Medium | Quotas enforced pre-signed-URL, processed-size accounting, per-tenant cost telemetry from S2 | No |
| IR-17 | Break-glass misuse or an unaudited platform access path | L | Critical | RLS predicate class enforces grant requirement; every action carries the grant id; owner notified in real time; negative tests in `KF-S7-PLAT-002` | Yes |
| IR-18 | Retention/purge tooling built late and rushed near launch | M | High | Purge is deliberately **not** in MVP execution; retention clock set at S2 withdrawal; purge tooling scheduled post-beta with F2 legal input — decision recorded rather than improvised | No (but must not be silently pulled forward) |
| IR-19 | Import tooling (S8) corrupts data during onboarding | M | High | Dry-run preview, per-row validation, idempotent re-import, atomic family creation (`KF-S8-PLAT-001`) | Yes (pilot gate) |
| IR-20 | Single full-stack lead becomes the review bottleneck (Blueprint DR-06) | M | Medium | CODEOWNERS spread; standards automated so reviews focus on domain correctness; PR lead-time tracked | No |

---

## 3. Carried-Forward Risks (unchanged, referenced)

| Source | IDs | Note |
|---|---|---|
| SAD §13 | TR-01…TR-10 | Architectural risks; TR-01/TR-10 are the parents of IR-01/IR-02 |
| Blueprint §14 | DR-01…DR-07 | Delivery risks; DR-03 (UX targets) and DR-05 (billing) map to IR-08/IR-04 |
| BRD §9 | R-01…R-12 | Business/operational risks; R-06 (gate reliability) maps to IR-03/IR-05 |
| Domain Model | Trigger drift, JSONB discipline, purge safety, UUID collision | Mapped to IR-11/IR-12/IR-18 |
| Blueprint §13 | TD-01…TD-14 | Accepted debt; each has an owner and a revisit trigger |

## 4. Release-Blocking Risk Summary

A release candidate cannot proceed to private beta while any of these are open: **IR-01, IR-02, IR-03, IR-04, IR-05, IR-06, IR-17, IR-19**, plus IR-07 (NFR) and IR-08 (microcopy) and IR-10's F2 item. This list is the risk-side mirror of the Blueprint §11 launch gates and is tracked in `docs/07_Roadmap/launch-gates.md` from Sprint 6 onward.

## 5. Review Cadence

| Cadence | Activity |
|---|---|
| Per PR | Risk note in the PR template when touching billing, attendance, auth, or tenancy |
| Per sprint | Register review at sprint review; new risks added with IDs; closed risks archived with evidence |
| Per milestone | Blocking-risk status against the launch gates |
