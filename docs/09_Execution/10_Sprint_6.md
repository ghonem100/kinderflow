# 10 — Sprint 6: Billing & Payments (Detailed Task Specifications)

| Field | Value |
|-------|-------|
| Sprint goal | Financially correct billing: fee plans → invoices → payments → balances, with invariants enforced in code **and** database |
| Entry criteria | Sprint 5 exit green; enrollment (S2) and attendance (S3) data available as billing inputs |
| Exit criteria | Invoice cycle for a 100-child tenant reviewed and issued in <10 minutes; money invariants property-tested; immutability enforced; parallel-run plan ready for beta |
| Authority | Blueprint §6 (S6), §4 M-006; BRD BR-06…BR-10; Domain Model Part 2.7, Part 3 (tables 33–41), Part 10; API Contract §2.11; RBAC §3, FL-01/FL-03/FL-04; Design System §07, §10 |
| Inherited defaults | As declared in `05_Sprint_1.md` |
| Sprint rules | (1) **No floating-point arithmetic anywhere in the money path** — integer minor units only. (2) Issued invoices and posted payments are immutable; corrections are new records. (3) Balances are derived, never stored as mutable counters (except the trigger-maintained `balance_minor` column, which is a projection with a reconciliation test) |

---

### KF-S6-BILL-001 — Money value object and arithmetic library
**Objective** Make float money impossible by construction.
**Source of Truth** Domain Model Part 1.4 (Money VO), Part 5 (money standard); API Contract §1.
**Dependencies** KF-S0-INFRA-002.
**Files/Areas** `packages/shared`.
**Implementation** `Money {amount_minor: bigint|number-int, currency}` with add/subtract/multiply-by-rate/allocate (largest-remainder distribution), comparison, formatting delegated to `@kf/i18n`; **no division returning fractions** — proration and percentage discounts use integer allocation with documented rounding; currency mismatch throws.
**Testing** **Property tests**: allocation sums exactly to the original; commutativity/associativity of addition; no operation produces a non-integer; rounding never loses or creates minor units across a distribution.
**Acceptance** (1) `allocate(100_00, [1,1,1])` returns three parts summing exactly to 100_00 with the documented remainder rule. (2) Any attempt to construct Money from a non-integer throws. (3) An ESLint rule (added here) forbids `number` arithmetic on fields named `*_minor` outside this library.
**Risk** Critical · **Cx** M

### KF-S6-BILL-002 — Migration M-006: billing tables
**Source of Truth** Domain Model Part 3 (tables 33–41), Part 5 (constraints), Part 6.2; Blueprint §4 M-006.
**Dependencies** KF-S6-BILL-001, KF-S2-CHILD-001.
**Implementation** `fee_plans`, `fee_components`, `discount_rules`, `fee_assignments` (partial unique: one active per child), `invoices` (unique `(tenant_id, number)`), `invoice_lines`, `payments`, `payment_allocations` (unique `(payment_id, invoice_id)`), `credit_notes`; tenant-composite FKs; RLS + FORCE; checks `amount_minor >= 0`, `due_date >= issued_at`; trigger-maintained `invoices.balance_minor`; trigger asserting Σ allocations ≤ payment amount.
**Testing** pgTAP for both triggers; isolation probes ×9; constraint tests.
**Acceptance** (1) Inserting an allocation that would exceed the payment total is rejected by the database. (2) `balance_minor` recomputes correctly on allocation insert/delete (trigger test). (3) A second active fee assignment for one child is rejected by the partial unique index.
**Risk** Critical · **Cx** L

### KF-S6-BILL-003 — Fee plans, components, discount rules CRUD
**Source of Truth** API Contract §2.11; BRD BR-06/BR-07; RBAC §3.
**Dependencies** KF-S6-BILL-002.
**API** CRUD `/fee-plans[/{id}]`, `POST /fee-plans/{id}/archive`; perms `fee-plan:*`; audited.
**Implementation** Components with period semantics; discount rules typed (sibling, percentage, fixed) with explicit stacking order; archive blocked while active assignments exist.
**Acceptance** (1) Archiving a plan with active assignments returns 422 with the documented code. (2) Discount stacking order is deterministic and documented; reordering changes results in a way covered by tests.
**Risk** High · **Cx** M

### KF-S6-BILL-004 — Discount engine (BR-07)
**Source of Truth** BRD BR-07; Domain Model §1.6 (DiscountEngine), Part 2.7.
**Dependencies** KF-S6-BILL-003.
**Implementation** Pure domain service; sibling discount derived from the guardian's enrolled-children count **at generation time** and snapshotted onto the invoice line; manual discounts require an approval role and a reason.
**Testing** Property tests: total discount never exceeds subtotal; ordering invariance where rules are commutative; sibling counts at boundaries (1, 2, 3+ children, mid-cycle withdrawal).
**Acceptance** (1) A family with three enrolled children receives the configured sibling tier on the correct children per the rule definition. (2) Withdrawing a sibling mid-cycle does not retroactively alter already-issued invoices. (3) A manual discount without an approver is rejected.
**Risk** Critical · **Cx** L

### KF-S6-BILL-005 — Fee assignments
**Source of Truth** API Contract §2.11; Domain Model Part 2.7.
**Dependencies** KF-S6-BILL-003, KF-S2-CHILD-003.
**API** `POST /children/{id}/fee-assignment`, `PATCH …`; perms `fee-assignment:*`.
**Implementation** Start/end dates; enrollment and withdrawal events drive assignment lifecycle (consumes `ChildEnrolled`/`ChildWithdrawn` from S2 outbox).
**Acceptance** (1) Withdrawing a child ends the active assignment automatically via the event consumer. (2) Overlapping active assignments are impossible (DB + domain).
**Risk** High · **Cx** M

### KF-S6-BILL-006 — Invoice generation job (cycle run)
**Source of Truth** API Contract §2.11 (`POST /invoices/generate-cycle`); SAD §10.1 (`invoicing` queue); BRD BR-06; Domain Model Part 10 (advisory locks).
**Dependencies** KF-S6-BILL-004, KF-S6-BILL-005.
**API** Perm `invoice:create`, Idempotency-Key required, RL-C; async job returning a job id.
**Implementation** Per-tenant advisory lock (no double cycle); generates **draft** invoices per enrolled child from the active fee plan + discounts + adjustments; snapshots every computed value onto lines; proration for mid-cycle enroll/withdraw on a daily basis; anomaly flags (missing fee assignment, unusual amount) surfaced for review.
**Testing** Concurrency test: two simultaneous cycle runs for the same tenant/cycle produce exactly one set of drafts.
**Acceptance** (1) Running the cycle twice for the same (tenant, cycle) creates no duplicate invoices. (2) A child enrolled on day 10 of a 30-day cycle is prorated per the documented daily rule, with the calculation visible on the line snapshot. (3) A child without a fee assignment is reported as an anomaly rather than silently skipped.
**Risk** Critical · **Cx** L

### KF-S6-BILL-007 — Invoice draft review and edit
**Source of Truth** API Contract §2.11 (`PATCH /invoices/{id}` draft only); BRD BR-08.
**Dependencies** KF-S6-BILL-006.
**Implementation** Draft edits allowed with `If-Match`; every edit audited; totals recomputed via the domain service (never hand-entered free amounts without the accountant role + reason, BR-06).
**Acceptance** (1) Editing an issued invoice returns 422 `INVOICE_IMMUTABLE`. (2) Editing a draft with a stale version returns 409. (3) A free-text amount without a reason is rejected.
**Risk** High · **Cx** M

### KF-S6-BILL-008 — Invoice issuance (single + batch)
**Source of Truth** API Contract §2.11; BRD BR-08; RBAC §3 (`invoice:issue`).
**Dependencies** KF-S6-BILL-007.
**API** `POST /invoices/{id}/issue`, `POST /invoices/issue-batch` (Idempotency-Key); audit SEC-FIN-001; emits `InvoiceIssued`; parents notified.
**Implementation** Issuance assigns the sequential per-tenant invoice number (gap-free within a tenant, generated under lock), freezes the invoice, and starts the due-date clock.
**Testing** Concurrency: parallel issuance produces unique, gap-free numbers.
**Acceptance** (1) After issuance no field of the invoice or its lines can be modified through any API path (route-level assertion + DB trigger). (2) 100 invoices issued in a batch receive consecutive numbers with no gaps or duplicates under concurrent load. (3) Each issuance emits SEC-FIN-001 and a parent notification.
**Risk** Critical · **Cx** L

### KF-S6-BILL-009 — Overdue transitions and reminders
**Source of Truth** BRD BR-10 (D5: optional configurable late fees); SAD §10.1 (`reminders` queue).
**Dependencies** KF-S6-BILL-008.
**Implementation** Scheduled job marking overdue after due date; reminder sequence at tenant-configured intervals; **late fees optional, disabled by default**, flat or percentage, with grace period (D5).
**Acceptance** (1) A tenant with late fees disabled never accrues one. (2) Enabling late fees applies them only to invoices overdue beyond the configured grace, and each application is an explicit adjustment record, not a silent total change. (3) Reminder cadence respects tenant settings and quiet hours for the notification channel.
**Risk** High · **Cx** M

### KF-S6-BILL-010 — Aging and receivables queries
**Source of Truth** API Contract §2.11/§2.13; Design System §10 (aging buckets).
**Dependencies** KF-S6-BILL-008.
**Implementation** 30/60/90 bucket query service; used by the accountant console now and the owner dashboard in S7.
**Acceptance** Buckets computed from due dates with an explicit timezone rule; totals reconcile with the sum of open balances (reconciliation test).
**Risk** Medium · **Cx** M

### KF-S6-BILL-011 — Billing domain events
**Source of Truth** Domain Model §1.5.
**Dependencies** KF-S6-BILL-008, KF-S2-CHILD-012.
**Implementation** `InvoiceIssued`, `InvoiceOverdue`, `PaymentRecorded`, `CreditIssued`, `FeePlanChanged` through the outbox.
**Acceptance** Events written transactionally; consumed by notifications and (S7) analytics projections.
**Risk** Medium · **Cx** M

---

### KF-S6-PAY-001 — Payment recording
**Source of Truth** API Contract §2.11; BRD BR-09; Domain Model Part 2.7.
**Dependencies** KF-S6-BILL-008.
**API** `POST /payments` perm `payment:create`, **Idempotency-Key required**; audit SEC-FIN-002; immutable once posted.
**Implementation** Guardian, amount, method (CASH/BANK_TRANSFER/CHEQUE/OTHER), received_at, allocations[]; FIFO default allocation with manual override; recorded_by captured.
**Acceptance** (1) Replaying the same idempotency key returns the original payment and creates nothing. (2) A posted payment cannot be edited or deleted through any route (assertion over the route table + DB grants). (3) Allocation exceeding an invoice's open balance returns 422 `ALLOCATION_EXCEEDS_BALANCE`.
**Risk** Critical · **Cx** L

### KF-S6-PAY-002 — Allocation engine and concurrency control
**Source of Truth** Domain Model Part 10 (serializable isolation for allocation posting); BRD BR-09.
**Dependencies** KF-S6-PAY-001.
**Implementation** Allocation posting runs at serializable isolation (or with row locks per the ADR-010 pattern); retry on serialization failure with bounded attempts.
**Testing** Concurrency: two payments allocating to the same invoice simultaneously must not overdraw the balance.
**Acceptance** (1) Under 50 concurrent allocation attempts against one invoice, the sum of allocations never exceeds the invoice total and no allocation is lost without an error. (2) Serialization failures are retried transparently up to the documented limit, then surfaced as 409.
**Risk** Critical · **Cx** L

### KF-S6-PAY-003 — Overpayment → credit balance
**Source of Truth** BRD BR-09; Domain Model Part 2.7 (credit is derived).
**Dependencies** KF-S6-PAY-002.
**Implementation** Unallocated payment remainder becomes credit; credit is **derived** (Σ unallocated payments + credit notes − applied credit), never a mutable counter.
**Acceptance** (1) Paying 1,500 against a 1,000 invoice leaves a 500 credit visible on the guardian balance. (2) The credit figure recomputes correctly after a later allocation (no drift across 100 randomized operations — property test).
**Risk** Critical · **Cx** M

### KF-S6-PAY-004 — Credit notes
**Source of Truth** BRD BR-08 (credit instead of delete); API Contract §2.11.
**Dependencies** KF-S6-PAY-003.
**API** `POST /credit-notes` perm `credit-note:create`, reason mandatory, Owner approval per matrix; audited.
**Acceptance** (1) A credit note can only reference an issued invoice. (2) Issuing a credit note leaves the original invoice untouched and adjusts the derived balance. (3) A credit note without a reason is rejected.
**Risk** High · **Cx** M

### KF-S6-PAY-005 — Guardian balance endpoint
**Source of Truth** API Contract §2.11 (`GET /guardians/{id}/balance`, never cached); Design System §09.
**Dependencies** KF-S6-PAY-003.
**Acceptance** (1) Response carries `Cache-Control: private, no-store`. (2) Balance equals the derived calculation from invoices, allocations, and credits (reconciliation assertion in the test).
**Risk** High · **Cx** M

### KF-S6-PAY-006 — Receipts (parent-visible)
**Source of Truth** BRD §13.1.3 (receipts recommendation, accepted); Design System §09.
**Dependencies** KF-S6-PAY-001.
**Acceptance** A recorded payment produces a parent-visible receipt with the payment reference and allocation breakdown; downloadable per permissions.
**Risk** Medium · **Cx** M

### KF-S6-PAY-007 — Reversal via counter-entry
**Source of Truth** Domain Model Part 2.7 (payment immutable; reversal = counter-entry).
**Dependencies** KF-S6-PAY-002.
**Acceptance** (1) A mistaken payment is corrected by a reversal record referencing the original, with a reason; the original remains. (2) Balances reflect the reversal exactly.
**Risk** High · **Cx** M

---

### KF-S6-FE-001 — Accountant billing console
**Source of Truth** Design System §06 (accountant nav), §10; RBAC FL-03/FL-04.
**Dependencies** KF-S6-BILL-010, KF-S0-FE-003.
**Acceptance** Invoice list with status/aging filters; the accountant surface exposes no attendance write actions (FL-04) and no unrelated child data.
**Risk** Medium · **Cx** L

### KF-S6-FE-002 — Cycle run review screen
**Source of Truth** Design System §07 (invoice generation flow).
**Dependencies** KF-S6-BILL-006, KF-S6-BILL-008.
**Implementation** Pre-run preview (cycle, branch, child count), job progress, draft review table with anomaly highlights, issue-batch confirmation.
**Acceptance** (1) Anomalies (missing fee assignment, unusual proration) are visually flagged before issuance. (2) The full flow for a 100-child tenant completes within the 10-minute target (measured in KF-S6-QA-003).
**Risk** High · **Cx** L

### KF-S6-FE-003 — Payment recording UI
**Source of Truth** Design System §07 (payment recording).
**Dependencies** KF-S6-PAY-001.
**Acceptance** Guardian search → open invoices auto-allocated FIFO (editable) → method/amount → receipt preview → confirm with idempotency key; overpayment shows the credit explainer before confirming.
**Risk** Medium · **Cx** L

### KF-S6-FE-004 — Parent payments view
**Source of Truth** Design System §09; RBAC §3 (parent scope).
**Dependencies** KF-S6-PAY-005, KF-S6-PAY-006.
**Acceptance** Balance card (fresh read), invoice list with status badges, invoice detail with lines, receipts with download, payment instructions (no gateway at MVP, TD-01).
**Risk** Medium · **Cx** M

---

### KF-S6-QA-001 — Money property and invariant suite
**Source of Truth** Instruction §14; Blueprint §8 (mutation testing on billing).
**Dependencies** KF-S6-PAY-003.
**Implementation** Property tests over randomized billing scenarios asserting the invariants: Σ invoice lines = invoice total; Σ allocations ≤ payment; Σ allocations per invoice ≤ invoice total; balance = invoices − allocations − credits; no float ever appears in a money field (type-level + runtime assertion); mutation testing on the money and discount modules.
**Acceptance** (1) 10,000 randomized operation sequences preserve every invariant. (2) Mutation score on the money/discount modules meets the documented threshold; surviving mutants are triaged.
**Risk** Critical · **Cx** L

### KF-S6-QA-002 — Transaction and concurrency suite
**Dependencies** KF-S6-BILL-006, KF-S6-PAY-002, KF-S6-BILL-008.
**Acceptance** Parallel cycle runs, parallel issuance, and parallel allocations all preserve uniqueness and balance invariants; failures surface as documented error codes rather than corrupt state.
**Risk** Critical · **Cx** M

### KF-S6-QA-003 — Billing E2E and cycle timing
**Dependencies** KF-S6-FE-002, KF-S6-FE-003.
**Implementation** Seeded 100-child tenant: generate → review → issue → record payment → parent sees invoice and receipt; elapsed time recorded.
**Acceptance** (1) End-to-end green in ar and en. (2) Cycle generation + review + issuance completes in <10 minutes of operator time (BRD O8 path).
**Risk** High · **Cx** L

### KF-S6-QA-004 — Beta parallel-run plan (documentation deliverable)
**Source of Truth** Instruction §14; Blueprint §14 DR-05.
**Dependencies** KF-S6-QA-001.
**Implementation** Written procedure for beta: for one full cycle, the pilot nursery's manual/Excel calculation is compared line-by-line against KinderFlow output; discrepancy triage process and sign-off criteria defined.
**Acceptance** Procedure documented in `docs/09_Execution/` and referenced by the launch gates; template comparison sheet produced.
**Risk** High · **Cx** S

---

## Sprint 6 Exit Checklist

| Gate | Evidence |
|---|---|
| No floats | Type + lint + runtime assertions; property suite green |
| Immutability | Issued invoices and posted payments unmodifiable via any route or role |
| Concurrency | Parallel cycle/issue/allocate tests green; numbering gap-free |
| Invariants | 10,000-sequence property run passes; mutation threshold met |
| Timing | 100-child cycle within the 10-minute operator target |
| RBAC | FL-03 (receptionist status-only) and FL-04 (accountant no attendance write) enforced and tested |
| Beta readiness | Parallel-run procedure documented |
