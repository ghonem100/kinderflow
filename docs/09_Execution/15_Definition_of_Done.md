# 15 — Universal Definition of Done

| Field | Value |
|-------|-------|
| Document | Universal Definition of Done (Phase 9) |
| Version | 1.0 |
| Date | 2026-08-10 |
| Basis | Engineering Blueprint §6 (DoD), §8 (testing), §12 (standards); Phase 9 brief §19 |
| Rule | This checklist applies to **every** task. Task specifications list only *additional* items. "Not applicable" must be stated explicitly in the PR, never left silently unchecked |

---

## 1. The Checklist

```
[ ]  1. Business requirement implemented — traceable to a named BRD/domain rule (e.g. BR-01)
[ ]  2. API contract implemented — method, path, DTOs, status codes, pagination,
        idempotency, optimistic locking exactly as specified in the API Contract
[ ]  3. RBAC implemented — exactly one permission code, scope enforced,
        field-level (FL) rules applied to DTO variants
[ ]  4. Tenant isolation verified — tenant_id, RLS policy + FORCE, composite FKs where
        required, tenant context in code, isolation suite extended and green
[ ]  5. Database migration complete — expand-and-contract, indexes tenant-led,
        constraints present, model manifest updated, migration linter green
[ ]  6. RLS policy complete — policy class annotated, SQL probes added to the harness
[ ]  7. Validation complete — edge DTO validation + domain invariants + DB backstop
        where corruption would be irreversible
[ ]  8. Audit events complete — every action in the RBAC §6 scope emits its documented
        event code with actor, tenant, trace_id
[ ]  9. Error codes complete — only codes from @kf/contracts/errors; new codes added to
        the catalog in the same PR with i18n keys
[ ] 10. Tests complete — unit, integration, contract, security/negative, isolation, and
        E2E as applicable; property tests where the task specification requires them
[ ] 11. OpenAPI updated — spec authored first; generated spec diffs clean; extensions
        (x-permission-code, x-rate-limit-tier, x-audit-events, x-idempotency) present
[ ] 12. Documentation updated — development guide, runbooks, or phase docs where the
        task changes behavior a reader would otherwise get wrong
[ ] 13. Observability added — structured logs with trace_id and tenant_id, metrics for
        new queues/jobs, alert rule if the failure mode is silent
[ ] 14. Accessibility checked — WCAG 2.1 AA for any UI: contrast, keyboard, SR labels,
        focus, reduced motion, touch targets
[ ] 15. RTL checked — Arabic layout verified, logical properties only, mixed-direction
        content isolated, ar + en screenshots attached to the PR
[ ] 16. Security reviewed — no secrets, no PII in logs, no float money, no bypass of the
        guard pipeline, uploads validated, rate-limit tier assigned
[ ] 17. CI passes — every blocking gate green: lint, typecheck, unit, integration,
        isolation, OpenAPI diff, migration validation, build, scans
```

## 2. Applicability Guide

| Task type | Typically applicable items |
|---|---|
| Migration-only | 4, 5, 6, 7, 10, 12, 16, 17 |
| Backend endpoint | 1–13, 16, 17 |
| Domain service / use case | 1, 3, 7, 10, 13, 16, 17 |
| Background job | 1, 4, 7, 8, 10, 12, 13, 16, 17 |
| Frontend screen | 1, 2 (consumption), 3 (rendering only permitted data), 9 (error mapping), 10, 12, 14, 15, 16, 17 |
| Component library | 10, 12, 14, 15, 17 |
| Infrastructure / CI | 10, 12, 13, 16, 17 |
| Documentation / ADR | 12, plus the specific acceptance criteria of the task |

## 3. Non-Negotiables (never "not applicable")

These four hold for every task that touches a database, an endpoint, or a UI:

1. **Item 4 — tenant isolation.** A tenant-scoped table or endpoint without isolation coverage is not done, regardless of feature completeness.
2. **Item 3 — exactly one permission code** per endpoint, asserted at application startup.
3. **Item 17 — CI green.** Gates are not bypassed, disabled, or made non-blocking to land work. If a gate is wrong, fix the gate in its own PR.
4. **Item 16 — security review.** Specifically: no floating-point money, no PII in logs, no path around the guard pipeline.

## 4. What "Done" Does Not Mean

- Not "the code works on my machine."
- Not "tests pass but the isolation suite was skipped for this table."
- Not "the UI looks right in English."
- Not "we'll add the audit event later."
- Not "OpenAPI will be updated in a follow-up."

A task that cannot meet the checklist is either **incomplete** (finish it) or **blocked** (classify it per Phase 9 brief §22 as BLOCKER / DECISION REQUIRED / DOCUMENTATION GAP / IMPLEMENTATION GAP / TECHNICAL RISK and escalate). It is never "done with exceptions."

## 5. Sprint-Level Done

A sprint is done when: every task meets the checklist · the sprint's exit checklist (in its sprint file) has evidence for each row · the isolation suite covers all new endpoints and tables · the risk register is reviewed and updated · deployed to staging and demoed.

## 6. Programme-Level Done (beta entry)

Blueprint §11 launch gates, mirrored in `14_Risk_Register.md` §4 and tracked in `docs/07_Roadmap/launch-gates.md`. Each gate requires **named evidence**, not assertion.
