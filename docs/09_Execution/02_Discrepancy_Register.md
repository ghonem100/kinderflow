# 02 — Architecture / Implementation Discrepancy Register

| Field | Value |
|-------|-------|
| Document | Discrepancy Register (Phase 9) |
| Version | 1.0 |
| Date | 2026-08-10 |
| Rule | **Nothing here is fixed in Phase 9.** Each entry states a recommended resolution and the task that will execute it. Silent modification of either the repository or the approved documents is forbidden |
| Baseline | `01_Implementation_Baseline.md` — zero code exists, so every discrepancy is document-vs-document or document-vs-scaffold |

Severity scale: **P0** blocks Sprint 0 · **P1** must resolve within Sprint 0–1 · **P2** resolve before beta · **P3** cosmetic/housekeeping.

---

## DISC-001 — Repository layout: scaffold vs. approved monorepo

| Field | Content |
|---|---|
| Document | Engineering Blueprint §1; Sprint 0 Guide §1.2 |
| Current implementation | Root folders `backend/`, `frontend/`, `mobile-parent/`, `mobile-teacher/`, `infrastructure/`, `scripts/` (all empty, `.gitkeep` only) |
| Approved design | pnpm monorepo: `apps/api`, `apps/web`, `packages/{contracts,tokens,ui,i18n,shared}`, `configs/`, `tooling/`, `infrastructure/`, `scripts/`, `docs/`. `mobile-parent`/`mobile-teacher` reserved but empty until V2 (ADR-009) |
| Impact | Low technically (no code to move), high if unaddressed — engineers could start work in the wrong tree and violate boundary rules from day one |
| Recommended resolution | Execute Blueprint §1 layout during `KF-S0-INFRA-002`; convert `backend/` → `apps/api`, `frontend/` → `apps/web`; keep `mobile-*` folders with a README stating "V2 — ADR-009, intentionally empty" |
| ADR required | No — Blueprint §1 already approved this layout |
| Priority | **P0** |

## DISC-002 — README describes the superseded structure

| Field | Content |
|---|---|
| Document | Root `README.md` vs. Engineering Blueprint §1 |
| Current implementation | README's "Repository Structure" table lists `backend/`, `frontend/`, `mobile-parent/`, `mobile-teacher/` as the architecture |
| Approved design | Monorepo layout (DISC-001); README should be the quickstart + workspace map per Sprint 0 Guide §9 |
| Impact | Onboarding confusion; README is the first artifact a new engineer reads |
| Recommended resolution | Rewrite README in `KF-S0-DOC-001` per Sprint 0 Guide §9 (quickstart, workspace map, links to phase docs) |
| ADR required | No |
| Priority | **P1** |

## DISC-003 — TR-10 spike not executed; ADR-010 does not exist

| Field | Content |
|---|---|
| Document | SAD §13 (TR-10), Sprint 0 Guide §11, Blueprint §6 (S0 exit criteria) |
| Current implementation | No spike, no benchmark, no ADR-010, no isolation harness |
| Approved design | ADR-008 mandates shared-schema + RLS; the *integration pattern* between Prisma and RLS is explicitly undecided pending the spike, with a documented fallback (option C) |
| Impact | **Critical.** Every database-backed feature depends on the tenant-context pattern. Building modules before this decision risks rewriting every repository and every transaction boundary |
| Recommended resolution | `KF-S0-RLS-001…005` (Sprint 0 Item 0, CRITICAL). No task with a Database Requirements block may start until ADR-010 is merged |
| ADR required | **Yes — ADR-010** (chosen pattern, benchmarks, failure-mode evidence, coding rules) |
| Priority | **P0** |

## DISC-004 — Empty documentation folders vs. content location

| Field | Content |
|---|---|
| Document | Repo `docs/02_Requirements/`, `docs/08_AI/`, `docs/09_Deployment/` (all empty) |
| Current implementation | Empty directories |
| Approved design | Requirements live in BRD §2–3 and SAD §9 (NFRs); AI design lives in SAD §7 + Blueprint §5; deployment lives in SAD §11 + Blueprint §9. The content exists — the folders do not hold it |
| Impact | Low, but a reader following the folder map will conclude the work is missing |
| Recommended resolution | Add a one-paragraph `README.md` pointer file in each empty folder naming the authoritative document and section (`KF-S0-DOC-002`). Do **not** duplicate content |
| ADR required | No |
| Priority | **P3** |

## DISC-005 — Version control absent

| Field | Content |
|---|---|
| Document | Blueprint §12 (branching, commit convention, PR flow), Sprint 0 Guide §3 (CI on PRs) |
| Current implementation | No `.git`; no remote; no branch protection |
| Approved design | Trunk-based development, conventional commits, PR-gated CI with blocking checks |
| Impact | Blocks every process control the architecture relies on (review, CI gates, CODEOWNERS) |
| Recommended resolution | `KF-S0-INFRA-001` (git init + first commit) and `KF-S0-OPS-001` (remote, branch protection rules requiring the blocking checks) |
| ADR required | No |
| Priority | **P0** |

## DISC-006 — Founder decisions open (F1–F4) referenced as resolved dependencies

| Field | Content |
|---|---|
| Document | BRD §12.2 (F1 price points, F2 PDPL review, F3 payment gateway, F4 hosting region) |
| Current implementation | All four open |
| Approved design | F4 (hosting region) was scheduled to be decided *inside* the architecture phase but was carried forward; F2 is a hard launch gate |
| Impact | F4 blocks production provisioning (`KF-S0-OPS-003`); F2 blocks beta launch and the LLM data-processing decision; F1 blocks subscription-plan seed values (`KF-S1-TENANT-006` ships plan *structure* with placeholder limits flagged as `TODO-F1` in seed data, not in code logic); F3 affects nothing before Phase 2 |
| Recommended resolution | Founder track: decide F4 before Sprint 0 task 0.15; start F2 legal review immediately (longest lead) |
| ADR required | F4 — **yes if** the chosen region implies a hosting-provider change (ADR-011 reserved) |
| Priority | **P1** (F4), **P1** (F2), **P2** (F1), **P3** (F3) |

## DISC-007 — UX decisions UXD-01…04 unconfirmed

| Field | Content |
|---|---|
| Document | Design System §20 (open UX decisions) |
| Current implementation | Unconfirmed |
| Approved design | Recommendations exist: UXD-01 LTR time axis on charts; UXD-02 Western digits in Arabic; UXD-03 Gregorian-only dates; UXD-04 report must be opened before approve is enabled |
| Impact | UXD-02/03 affect the `@kf/i18n` formatters built in Sprint 0 (`KF-S0-FE-004`) — every number and date in the product; UXD-04 affects the S4 report-approval gate; UXD-01 affects S7 charts |
| Recommended resolution | Founder confirms UXD-02/03 before `KF-S0-FE-004`. If unconfirmed at task start, implement the documented recommendation behind a config constant and register as accepted debt (do **not** guess a different behavior) |
| ADR required | No — design decisions, recorded in Design System §20 |
| Priority | **P1** (UXD-02/03), **P2** (UXD-04), **P3** (UXD-01) |

## DISC-008 — Team-size assumption unvalidated

| Field | Content |
|---|---|
| Document | Blueprint §6 (assumes 2 BE, 2 FE, 1 lead, part-time designer); Sprint 0 Guide §10 owner column |
| Current implementation | Team composition unknown |
| Approved design | 9 sprints × 2 weeks with that staffing |
| Impact | Sprint boundaries and owner assignments in this backlog are notional until confirmed; a smaller team does not change task order or content, only calendar duration |
| Recommended resolution | Founder confirms staffing (Sprint 0 item 0.20). Backlog task *content* is staffing-independent by design — re-plan durations only |
| ADR required | No |
| Priority | **P1** |

## DISC-009 — External infrastructure accounts unconfirmed

| Field | Content |
|---|---|
| Document | Blueprint §9; Sprint 0 Guide §7 |
| Current implementation | GitHub org/repo, container registry, Coolify host, S3-compatible storage, SMTP/SMS providers — none confirmed |
| Approved design | CI/CD to Coolify, images in a registry, media + encrypted backups in S3-compatible storage |
| Impact | Blocks `KF-S0-OPS-001…005`; does not block local development tasks |
| Recommended resolution | Founder/DevOps procure before Sprint 0 week 2; local-first tasks proceed meanwhile |
| ADR required | No (unless a different hosting model is chosen → ADR required per instruction §18) |
| Priority | **P1** |

## DISC-010 — Documentation date stamps precede the current date

| Field | Content |
|---|---|
| Document | All Phase 0–8 documents dated 2026-07-18; current date 2026-08-10 |
| Current implementation | n/a |
| Approved design | n/a |
| Impact | Cosmetic only; no content implication |
| Recommended resolution | Leave as authored dates (they record when the decision was made). Phase 9 documents carry 2026-08-10. Add revision-history rows only when content changes |
| ADR required | No |
| Priority | **P3** |

---

## Summary

| Priority | Count | IDs |
|---|---|---|
| P0 | 3 | DISC-001, DISC-003, DISC-005 |
| P1 | 4 | DISC-002, DISC-006 (F4/F2), DISC-007 (UXD-02/03), DISC-008, DISC-009 |
| P2 | — | (contained within DISC-006/007) |
| P3 | 3 | DISC-004, DISC-010, DISC-006 (F3) |

**No discrepancy requires reversing an approved architectural decision.** All three P0 items are resolved by *executing* Sprint 0 as already approved. The genuine risk concentration is DISC-003 (TR-10) — it is the only entry where the answer is unknown rather than merely unexecuted.
