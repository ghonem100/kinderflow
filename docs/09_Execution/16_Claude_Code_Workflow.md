# 16 — Claude Code Execution Workflow

| Field | Value |
|-------|-------|
| Document | Task execution workflow (Phase 9) |
| Version | 1.0 |
| Date | 2026-08-10 |
| Purpose | A strict, repeatable loop so an implementing agent (or engineer) can take a task ID and deliver it **without making architectural decisions** |
| Basis | Phase 9 brief §21–§22; Blueprint §12; `15_Definition_of_Done.md` |

---

## 1. The Loop

| Step | Actor | Action | Exit condition |
|---|---|---|---|
| 1 | Planner (Cowork) | Select the next task whose dependencies are all complete, from the sprint file | One task ID chosen; no blocked dependency |
| 2 | Planner | Hand over the **full task specification** verbatim + the paths of its Source-of-Truth sections | Implementer has the spec and the document references |
| 3 | Implementer | Inspect the repository: existing structure, related modules, contracts, tests | Written summary of what exists and what will change |
| 4 | Implementer | Propose an implementation plan (files, order, tests) and **list any ambiguity** | Plan approved, or ambiguity escalated per §3 |
| 5 | Implementer | Implement — code + migration + tests + OpenAPI + docs together, never sequentially deferred | Working tree contains the complete change |
| 6 | Implementer | Run unit + integration tests | Green |
| 7 | Implementer | Run the isolation suite | Green, with the new endpoints/tables covered |
| 8 | Implementer | Run OpenAPI validation and diff | No unintended contract change |
| 9 | Implementer | Run lint, typecheck, build, migration linter, boundary check | Green |
| 10 | Implementer | Review the full diff against the task's Acceptance Criteria, one by one | Every criterion demonstrably met |
| 11 | Implementer | Update documentation (dev guide, runbooks, phase docs if behavior changed) | Docs reflect reality |
| 12 | Planner | Verify the Definition of Done checklist and the acceptance criteria; mark complete | Task closed with evidence |
| 13 | Planner | Unlock dependent tasks | Next task selectable |

**Nothing is skipped when in a hurry.** If step 7 or 8 fails, the task is not done — steps 5–9 repeat.

## 2. Task Handover Template (step 2)

```
TASK: <KF-Sx-EPIC-nnn>
SPEC: <paste the full task block from the sprint file>
SOURCE OF TRUTH: <exact documents and section numbers>
DEFINITION OF DONE: docs/09_Execution/15_Definition_of_Done.md
CONVENTIONS: docs/09_Execution/03_Master_Backlog.md §6
CONSTRAINTS:
  - Do not make architectural decisions. If one is required, stop and classify.
  - Do not change the API contract. If the contract seems wrong, register a discrepancy.
  - Do not add technologies not authorized by an approved document.
  - Do not weaken, skip, or disable a CI gate to land the work.
```

## 3. Escalation Protocol (Phase 9 brief §22)

When something is unclear, **do not guess**. Stop and classify:

| Class | Meaning | Action |
|---|---|---|
| **BLOCKER** | Cannot proceed at all (missing account, unapproved decision, failing dependency) | Stop; report what is missing and who owns it; pick a different task |
| **DECISION REQUIRED** | Two defensible options and no approved document chooses | Stop; present the options with trade-offs; require a decision (ADR if architectural) |
| **DOCUMENTATION GAP** | Approved docs are silent on a needed detail | Stop; propose the smallest addition; get it approved; then implement |
| **IMPLEMENTATION GAP** | Docs specify it; code does not have it yet | Not a blocker — it is a task; add it to the backlog with an ID |
| **TECHNICAL RISK** | Proceeding is possible but creates future harm | Proceed only with the risk registered in `14_Risk_Register.md` and named in the PR |

Escalation report format: *what was being attempted · what is ambiguous · which documents were consulted · options considered · what decision is needed and from whom*.

## 4. Hard Rules for the Implementer

1. **The approved documents are the specification.** When the task spec and a source document disagree, stop — that is a DOCUMENTATION GAP, not a judgement call.
2. **Contracts first.** Endpoint work begins in `@kf/contracts` (OpenAPI + permission code + error codes), then implementation. Never the reverse.
3. **Isolation is not optional.** A new tenant table without an RLS policy, a manifest entry, and harness coverage is an incomplete task.
4. **No new dependencies** without an approved document authorizing them; adding one is a DECISION REQUIRED escalation.
5. **No money floats, no PII in logs, no AI publish path, no silent event loss.** These four are the programme's non-negotiables and appear in the review checklist.
6. **Tests are part of the change, not a follow-up.** A PR without its tests is not reviewable.
7. **Never disable a gate.** A wrong gate is fixed in its own PR with its own justification.
8. **Small PRs.** One task, one PR. If a task turns out to be XL in practice, split it and record the split in the sprint file.

## 5. Commit and PR Conventions

- Branch: `feat/kf-s3-att-004-checkout-pickup-verification` (task ID in the branch name).
- Commits: Conventional Commits with the module scope — `feat(attendance): enforce pickup authorization on checkout`.
- PR title: `KF-S3-ATT-004 — Check-out endpoint with pickup verification`.
- PR body: the template from `KF-S0-DOC-002` — linked task, what/why, ar+en screenshots for UI, the DoD checklist, risk note.
- Merge: squash to `main` after all required checks and the required approvals (2 for billing/attendance/security/migration paths).

## 6. Session Discipline

| Practice | Reason |
|---|---|
| One task per session | Keeps the diff reviewable and the acceptance criteria checkable |
| Read the Source-of-Truth sections **before** writing code | Prevents re-deriving decisions that are already made |
| Write the test that expresses the acceptance criterion first where practical | The criteria are written to be testable — use them |
| Run the isolation suite locally before pushing | Fastest feedback on the most dangerous class of defect |
| Leave the repository green | Never end a session with a broken `main`-targeted branch and no note |

## 7. Definition of "Task Complete"

A task is complete when: all acceptance criteria demonstrably pass · the Definition of Done checklist is satisfied or explicitly marked not-applicable per item · CI is green on every blocking gate · the PR is merged · the sprint file's task is marked done with a link to the PR. Only then do dependent tasks unlock (step 13).
