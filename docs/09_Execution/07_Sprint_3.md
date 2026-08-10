# 07 — Sprint 3: Attendance & Gate + Offline Sync (Detailed Task Specifications)

| Field | Value |
|-------|-------|
| Sprint goal | The gate: legally reliable custody records that work offline and refuse unauthorized pickups |
| Entry criteria | Sprint 2 exit green (pickup lists, medical alerts, parent scope live) |
| Exit criteria | Check-in ≤10 s measured; unauthorized pickup blocked + alerted; 24 h offline queue reconciles with zero silent drops; full offline test matrix green |
| Authority | Blueprint §6 (S3); BRD BR-01/BR-05/BR-11/BR-12; Domain Model Part 2.4, Part 3 (tables 24–26); API Contract §2.6, §5; SAD §8.2; Design System §07, §08, §11; RBAC §3, §7 (SEC-SAFE-001) |
| Inherited defaults | As declared in `05_Sprint_1.md` |
| Sprint rule | **No event may ever be silently discarded.** Every synced event resolves to APPLIED, DUPLICATE, PENDING_REVIEW, or REJECTED with a reason code, and every rejection is visible to staff |

---

## A. Attendance Core

### KF-S3-ATT-001 — Migration M-005a: attendance tables and integrity triggers
**Source of Truth** Domain Model Part 3 (tables 24–26), Part 10 (business constraints in DB); BR-11/BR-12; Blueprint §4 M-005.
**Dependencies** KF-S2-CHILD-001.
**Implementation** `attendance_days` (unique `(child_id,date)`), `attendance_events` (immutable; unique `client_event_id`; `sync_status`; `device_recorded_at`; `recorded_by`; `pickup_person_id`), `attendance_amendments`; tenant-composite FKs to children; RLS + FORCE; indexes `(tenant_id,branch_id,occurred_at)`; **alternation trigger** enforcing BR-11 (no two consecutive same-direction events per child per day); partition-ready design documented (not applied).
**Testing** pgTAP for the alternation trigger; isolation probes; immutability test (UPDATE/DELETE on events rejected by grants/trigger).
**Acceptance** (1) A second CHECK_IN without an intervening CHECK_OUT is rejected at the database level, not only in application code. (2) An `UPDATE` on `attendance_events` fails for the application role. (3) `client_event_id` uniqueness is enforced per tenant.
**Risk** Critical · **Cx** L

### KF-S3-ATT-002 — Pickup authorization domain service
**Objective** The single decision point for BR-01, shared by online and offline paths.
**Source of Truth** BRD BR-01; Domain Model §1.6 (PickupAuthorizationService); RBAC §7 (SEC-SAFE-001).
**Dependencies** KF-S2-CHILD-005.
**Implementation** Pure domain service: input (child, presented person, time, branch policy) → decision (AUTHORIZED / NOT_AUTHORIZED / PENDING_ENTRY_NOT_EFFECTIVE) + reason; **always reads fresh** (no cache); used identically by the online endpoint and the sync reconciler.
**Testing** Exhaustive unit matrix: approved person, pending person, revoked person, person from another child, expired authorization, deleted person.
**Acceptance** (1) A pending (unapproved) pickup entry yields NOT_AUTHORIZED with the distinct pending reason. (2) The service has no cache dependency (asserted by construction — no cache client injected). (3) Both call sites (online, sync) use this service — verified by a test that stubs it and observes both paths.
**Risk** Critical · **Cx** M

### KF-S3-ATT-003 — Check-in endpoint (online)
**Source of Truth** API Contract §2.6; BR-05 (medical alerts), BR-11.
**Dependencies** KF-S3-ATT-001, KF-S3-ATT-002.
**API** `POST /attendance-events` perm `attendance:create`, **Idempotency-Key required**, RL-B; errors `ATTENDANCE_SEQUENCE_CONFLICT`, `VAL_PICKUP_PERSON_REQUIRED`; emits `ChildCheckedIn`; audit + parent notification.
**Implementation** Creates/opens `attendance_days`, appends event, returns child card payload including **medical alerts requiring acknowledgment** (BR-05).
**Acceptance** (1) Checking in a child already present returns 409 `ATTENDANCE_SEQUENCE_CONFLICT` with the existing event time in the payload for inline resolution. (2) The response includes any active medical alert with an acknowledgment requirement flag. (3) Replaying the same idempotency key returns the original event, not a duplicate.
**Risk** Critical · **Cx** M

### KF-S3-ATT-004 — Check-out endpoint with pickup verification
**Source of Truth** API Contract §2.6; BR-01; Design System §07, §11 (takeover).
**Dependencies** KF-S3-ATT-003.
**API** Same endpoint, `direction=CHECK_OUT`; `pickup_person_id` mandatory (`VAL_PICKUP_PERSON_REQUIRED`); denial → 403 `PICKUP_NOT_AUTHORIZED` + SEC-SAFE-001 + guardian and BranchManager notification; late pickup flagged per branch closing time + grace.
**Acceptance** (1) An unauthorized person attempt returns 403 with the safety code, records the attempt (including who was presented), notifies the primary guardian and branch manager, and emits SEC-SAFE-001 as critical. (2) A check-out after closing time + grace is flagged `LatePickupFlagged` and surfaces on the branch dashboard. (3) The denial is recorded even though no attendance event is created — the attempt is never lost.
**Risk** Critical · **Cx** L

### KF-S3-ATT-005 — Attendance day close job
**Source of Truth** BR-12; Domain Model Part 2.4 lifecycle; SAD §10 (scheduled jobs).
**Dependencies** KF-S3-ATT-001, KF-S0-API-002.
**Implementation** Tenant-timezone-aware nightly job closing open days; children still checked in at close are flagged for review (never auto-checked-out — a custody record must not be invented); emits `AttendanceDayClosed`.
**Acceptance** (1) A child left checked in is flagged for branch-manager review rather than receiving a fabricated check-out event. (2) The job runs per tenant timezone (Africa/Cairo default) and is idempotent for the same date.
**Risk** High · **Cx** M

### KF-S3-ATT-006 — Amendments: request and approval
**Source of Truth** BR-12; API Contract §2.6; RBAC §3 (amendments row).
**Dependencies** KF-S3-ATT-005.
**API** `POST /attendance-days/{id}/amendments` (staff request, reason mandatory), `POST /attendance-amendments/{id}/approve` perm `attendance:approve`; audited.
**Implementation** Original events never modified; amendment references the event and carries the corrected values; effective attendance = events + approved amendments (a single query service used by all consumers, including S6 billing).
**Acceptance** (1) Approving an amendment leaves the original event byte-identical. (2) The effective-attendance query returns amended values while the raw event log still shows the original — both retrievable. (3) An amendment without a reason is rejected.
**Risk** High · **Cx** M

### KF-S3-ATT-007 — Presence and ratio endpoint
**Source of Truth** API Contract §2.6 (`GET /branches/{id}/presence`); Domain Model §1.6 (RatioCalculator).
**Dependencies** KF-S3-ATT-003, KF-S1-IAM-003.
**Implementation** Live present list per classroom + staff assignment count + ratio; **never cached**.
**Acceptance** (1) A check-in is reflected in the presence response on the next request (no staleness window). (2) The endpoint carries `Cache-Control: private, no-store`.
**Risk** Medium · **Cx** M

### KF-S3-ATT-008 — Attendance history endpoints (child, day, branch)
**Source of Truth** API Contract §2.6; RBAC §3 (parent read of own child).
**Dependencies** KF-S3-ATT-006.
**Acceptance** (1) A parent sees only their own children's history. (2) Cursor pagination and date filters behave per API §1.
**Risk** Low · **Cx** M

### KF-S3-ATT-009 — Attendance domain events and notifications wiring
**Source of Truth** Domain Model §1.5; SAD §3.2 outbox.
**Dependencies** KF-S3-ATT-004, KF-S2-CHILD-012.
**Implementation** `ChildCheckedIn/Out`, `UnauthorizedPickupAttempted`, `LatePickupFlagged`, `AttendanceAmended`, `AttendanceDayClosed` → outbox → notification consumers (parent push/in-app; safety alerts unsuppressable).
**Acceptance** (1) Parent notification for check-in is dispatched within 30 s (measured in integration). (2) Safety alerts ignore quiet hours and notification preferences (asserted).
**Risk** High · **Cx** M

---

## B. Offline Sync (safety-critical)

### KF-S3-SYNC-001 — Batch sync endpoint contract implementation
**Source of Truth** API Contract §5 and §2.6; SAD §8.2 (sequence diagram).
**Dependencies** KF-S3-ATT-002, KF-S3-ATT-004.
**API** `POST /attendance-events/sync` perm `attendance:create`, Idempotency-Key required, ≤200 events per batch; response = per-event results `{client_event_id, result, server_event_id?, code?}`.
**Implementation** Server processes each event through the same domain path as online; **authorization is re-validated server-side at sync time** (BR-01) — an offline check-out to an unauthorized person is stored and flagged, never accepted as valid nor dropped.
**Acceptance** (1) A batch containing a mix of valid, duplicate, conflicting, and unauthorized events returns one result per event, all four outcomes represented, and no event missing from the response. (2) Re-posting the identical batch returns identical results with every item marked DUPLICATE (no new rows). (3) Offline unauthorized check-out lands as PENDING_REVIEW + SEC-SAFE-001, not APPLIED and not silently dropped.
**Risk** Critical · **Cx** L

### KF-S3-SYNC-002 — Idempotency and replay protection
**Source of Truth** API Contract §1 (idempotency), §5 (replay protection).
**Dependencies** KF-S3-SYNC-001.
**Implementation** Batch-level idempotency key (Redis, 48 h) + per-event `client_event_id` unique constraint; replay returns the stored response with `Idempotency-Replayed: true`.
**Testing** Replay after partial network failure; replay after 47 h and after 49 h (post-expiry behavior documented: per-event uniqueness still prevents duplication).
**Acceptance** (1) A network failure after server processing but before client receipt, followed by a client retry, produces no duplicate events. (2) After key expiry, retry still cannot duplicate events because of per-event uniqueness.
**Risk** Critical · **Cx** M

### KF-S3-SYNC-003 — Duplicate detection and collapse window
**Source of Truth** API Contract §5 (±2 minute same-direction collapse).
**Dependencies** KF-S3-SYNC-001.
**Implementation** Same child + same direction within the configured window collapses to one event; the collapsed event is recorded as DUPLICATE with a reference to the surviving event.
**Acceptance** (1) Two check-ins for the same child 40 seconds apart from two devices produce one attendance event and one DUPLICATE result referencing it. (2) Events 5 minutes apart are treated as a genuine sequence conflict, not a duplicate.
**Risk** High · **Cx** M

### KF-S3-SYNC-004 — Clock skew handling
**Source of Truth** API Contract §1 (`X-Device-Time`), §5; error `SYNC_CLOCK_SKEW`.
**Dependencies** KF-S3-SYNC-001.
**Implementation** Server time authoritative; device time preserved in `device_recorded_at`; skew beyond ±24 h → event stored PENDING_REVIEW with the skew reason; moderate skew corrected using the batch-level offset (device_time vs server receipt).
**Acceptance** (1) A device with a clock 3 hours fast produces events whose stored `occurred_at` is corrected by the computed offset while `device_recorded_at` retains the raw value. (2) A device with a 3-day skew yields PENDING_REVIEW items with `SYNC_CLOCK_SKEW`, not silent acceptance.
**Risk** High · **Cx** M

### KF-S3-SYNC-005 — Conflict resolution queue (pending review)
**Source of Truth** API Contract §5; Design System §07 (conflict resolution), §16.
**Dependencies** KF-S3-SYNC-004, KF-S3-ATT-006.
**Implementation** `pending_review` events surfaced in a BranchManager queue with side-by-side device-vs-server context; resolution actions: accept (creates the event/amendment), amend, reject with reason; all actions audited.
**Acceptance** (1) Every PENDING_REVIEW event appears in exactly one queue and cannot leave it without an explicit human decision. (2) Rejection requires a reason and retains the original record for audit.
**Risk** Critical · **Cx** L

### KF-S3-SYNC-006 — Sync state endpoint (roster and pickup cache priming)
**Source of Truth** API Contract §5 (`GET /sync/state?since=`); Design System §11 (gate offline).
**Dependencies** KF-S3-ATT-007, KF-S2-CHILD-005.
**Implementation** Returns changed rosters, authorized pickup lists, medical alerts, and settings since an opaque watermark; token expiry 7 days → full refresh; payload scoped to the device's branch.
**Security** The offline pickup cache is the only permitted cached copy of authorization data; it carries a max age and the gate must display staleness (see KF-S3-FE-GATE-005).
**Acceptance** (1) A gate device that has been offline for 6 hours receives only deltas on reconnect. (2) An expired watermark triggers a full refresh rather than partial data. (3) The cached pickup list carries a `generated_at` used by the UI to warn when stale beyond the configured threshold.
**Risk** Critical · **Cx** L

### KF-S3-SYNC-007 — Client queue implementation (replaces S0 skeleton mock)
**Source of Truth** Blueprint §2 (offline strategy); API Contract §5; ADR-009; KF-S0-FE-006.
**Dependencies** KF-S0-FE-006, KF-S3-SYNC-001.
**Implementation** UUIDv7 `client_event_id` generated client-side; IndexedDB persistence; Background Sync + manual retry with exponential backoff; batching ≤200; reconciliation of per-item results into TanStack Query cache and UI badges; queue age cap 24 h with escalation UI (never silent expiry — an aged item surfaces as an error state requiring staff action).
**Acceptance** (1) 200 events queued offline drain in ≤2 batches on reconnect with all results reconciled. (2) An item that cannot sync within 24 h surfaces a persistent error banner naming the affected children — it is never dropped. (3) App restart preserves the queue and its ordering.
**Risk** Critical · **Cx** L

---

## C. Gate & Teacher Surfaces

### KF-S3-FE-GATE-001 — Gate mode shell and status strip
**Source of Truth** Design System §11, §04 (kiosk shell), §14 (landscape).
**Dependencies** KF-S0-FE-006, KF-S1-FE-CON-001.
**Implementation** Full-screen kiosk layout, light theme locked, status strip (branch, time, online/offline dot, present count, queued count), PIN-protected exit.
**Acceptance** (1) Exiting gate mode requires a PIN. (2) Offline state is visible without interaction and shows the queued count. (3) All targets ≥56 px; no scrolling in the core flow (asserted in the E2E viewport test).
**Risk** Medium · **Cx** M

### KF-S3-FE-GATE-002 — Identify: search, QR scan, PIN pad
**Source of Truth** Design System §11; BRD O-metric (check-in ≤10 s).
**Dependencies** KF-S3-FE-GATE-001, KF-S3-SYNC-006.
**Implementation** Auto-focused search with photo-first results from the local roster cache (works offline), QR scan, family PIN fallback.
**Acceptance** (1) With the network disabled, searching finds children from the cached roster. (2) Results render photos at ≥72 px rows and are keyboard/tap accessible.
**Risk** High · **Cx** L

### KF-S3-FE-GATE-003 — Check-in confirm with medical alert acknowledgment
**Source of Truth** Design System §11; BR-05.
**Dependencies** KF-S3-FE-GATE-002, KF-S3-ATT-003.
**Implementation** Giant child card, allergy/medical chips requiring explicit acknowledgment when present, single 72 px confirm, 800 ms success flash, auto-return to search; optimistic + queued state when offline.
**Acceptance** (1) A child with a medical alert cannot be confirmed until the alert is acknowledged. (2) The full identify→confirm→return cycle completes in ≤10 seconds in the timing test (KF-S3-QA-004).
**Risk** High · **Cx** L

### KF-S3-FE-GATE-004 — Check-out pickup verification
**Source of Truth** Design System §07, §11; BR-01; RBAC FL-06.
**Dependencies** KF-S3-FE-GATE-003, KF-S3-ATT-004.
**Implementation** Authorized adults as photo cards (masked ID), tap person → confirm; late-pickup amber flash; pending entries visibly marked "not authorized".
**Acceptance** (1) Pending (unapproved) persons are displayed as unusable and cannot be selected. (2) The UI never offers an override in gate mode.
**Risk** Critical · **Cx** L

### KF-S3-FE-GATE-005 — Unauthorized takeover and stale-cache warning
**Source of Truth** Design System §11 (red takeover, z-50), §17 (no animation for urgency); RBAC §7 SEC-SAFE-001.
**Dependencies** KF-S3-FE-GATE-004, KF-S3-SYNC-006.
**Implementation** Full-screen red takeover with [Call manager] [Back] only — no dismiss without action; attempt recorded/queued even offline; separate amber banner when the offline authorization cache exceeds its staleness threshold, instructing staff to verify manually.
**Acceptance** (1) The takeover cannot be dismissed by tapping outside, ESC, or back gesture. (2) An offline unauthorized attempt is queued and appears in the branch manager's review queue after sync. (3) When the pickup cache is stale beyond threshold, the gate displays the warning before any check-out confirmation.
**Risk** Critical · **Cx** L

### KF-S3-FE-TCH-001 — Teacher Today roster
**Source of Truth** Design System §08, §18 (teacher wireframe).
**Dependencies** KF-S3-ATT-007, KF-S0-FE-003.
**Acceptance** Roster shows present/absent state per child with offline-safe rendering and a sync indicator; one-hand reachable targets on phone.
**Risk** Medium · **Cx** M

### KF-S3-FE-TCH-002 — Teacher fallback check-in (2 taps)
**Source of Truth** Design System §08.
**Dependencies** KF-S3-FE-TCH-001, KF-S3-ATT-003.
**Acceptance** Tap child → tap confirm records attendance (queued when offline) in two taps, with the same medical-alert rule as the gate.
**Risk** Medium · **Cx** M

---

## D. Quality Gates

### KF-S3-QA-001 — Offline test matrix (mandatory scenarios)
**Source of Truth** Instruction §13; Blueprint §8; API Contract §5.
**Dependencies** KF-S3-SYNC-007, KF-S3-FE-GATE-005.
**Implementation** Playwright + network emulation covering **all nine required scenarios**: ONLINE · OFFLINE · OFFLINE→ONLINE · DUPLICATE SYNC · CONFLICT · UNAUTHORIZED PICKUP (offline and online) · DEVICE CLOCK ERROR · APP RESTART · NETWORK FAILURE DURING SYNC.
**Acceptance** Each scenario is a named test; each asserts the end state of every event (no test may pass with an event unaccounted for); the suite runs in CI on every PR touching attendance or sync code.
**Risk** Critical · **Cx** L

### KF-S3-QA-002 — Attendance isolation and negative RBAC
**Dependencies** All S3 API tasks.
**Acceptance** All S3 endpoints + 3 new tables covered; parent cannot post attendance; accountant cannot write attendance (FL-04); teacher cannot amend without request flow; cross-tenant child id → 404 + tripwire.
**Risk** Critical · **Cx** M

### KF-S3-QA-003 — Safety negative-path suite
**Source of Truth** BR-01; RBAC §7.
**Dependencies** KF-S3-ATT-002.
**Implementation** Dedicated suite for every denial path: pending person, revoked person, wrong child, expired entry, offline attempt, stale cache — each asserting the audit event, the notification, and the absence of an attendance event.
**Acceptance** Every denial path produces exactly one SEC-SAFE-001 record and zero attendance events.
**Risk** Critical · **Cx** M

### KF-S3-QA-004 — Check-in timing instrumentation (≤10 s)
**Source of Truth** BRD O-metrics; Design System §11; instruction §16.
**Dependencies** KF-S3-FE-GATE-003.
**Implementation** Instrumented E2E measuring identify→confirm→ready-for-next on a tablet-class viewport with a seeded 90-child branch, online and offline; result recorded in the PR.
**Acceptance** Median ≤10 s and p90 ≤13 s across 20 runs; failure blocks the sprint exit and triggers UX iteration (not a target relaxation).
**Risk** High · **Cx** M

---

## Sprint 3 Exit Checklist

| Gate | Evidence |
|---|---|
| BR-01 | Unauthorized pickup blocked online **and** offline; takeover undismissable; alerts fired |
| BR-11/BR-12 | DB-level alternation; events immutable; amendments preserve originals |
| Offline matrix | All nine scenarios green in CI |
| No silent loss | Every event in every scenario accounted for; 24 h-aged items escalate visibly |
| Timing | ≤10 s median check-in recorded |
| Isolation | S3 endpoints and tables covered |
