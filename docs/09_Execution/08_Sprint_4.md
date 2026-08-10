# 08 — Sprint 4: Activities, Media & Daily Reports (Detailed Task Specifications)

| Field | Value |
|-------|-------|
| Sprint goal | Close the daily loop with **template** reports — teacher logs → report → parent feed. AI drafting arrives in Sprint 5 on top of this pipeline (Blueprint §6; see `03_Master_Backlog.md` §3) |
| Entry criteria | Sprint 3 exit green (attendance + offline substrate live) |
| Exit criteria | ≤5-tap logging measured; report state machine enforcing approval-before-publish; parent feed live; consent enforcement on all media |
| Authority | Blueprint §6 (S4); BRD BR-13; Domain Model Part 2.5, Part 3 (tables 27–29, 20–21, 32); API Contract §2.7, §2.8, §2.10; Design System §07, §08, §09, §12 |
| Inherited defaults | As declared in `05_Sprint_1.md` |
| Sprint rule | The publish path must be **structurally** gated on human approval — there must be no code path from generation (template now, AI later) to parent-visible content without an approval transition |

---

### KF-S4-ACT-001 — Migration M-005b: activity, report, medication tables
**Source of Truth** Domain Model Part 3 (tables 20, 21, 27, 28, 29), Part 6.2; Blueprint §4 M-005.
**Dependencies** KF-S3-ATT-001.
**Implementation** `activity_entries` (type enum + JSONB payload + `payload_version`), `daily_reports` (unique `(child_id,date)`, status enum), `report_drafts`, `medication_authorizations`, `medication_administrations`; tenant-composite FKs to children; RLS + FORCE; indexes `(tenant_id,child_id,occurred_at)`, `(tenant_id,classroom_id,occurred_at)`, `(tenant_id,status,date)`; partition-ready notes for `activity_entries`.
**Acceptance** (1) Isolation probes pass for all five tables. (2) An activity entry with an unknown `type` value is rejected by the enum. (3) `medication_administrations` rejects UPDATE/DELETE (immutable legal record).
**Risk** High · **Cx** L

### KF-S4-ACT-002 — Typed activity payload schemas and validation
**Source of Truth** Domain Model Part 2.5 (typed payloads), Part 10 (validation ladder), Part 4.2 (JSONB discipline).
**Dependencies** KF-S4-ACT-001, KF-S0-CONTRACT-001.
**Implementation** Versioned JSON schemas per type (MEAL, NAP, DIAPER, MOOD, LEARNING, NOTE, MEDICATION_ADMIN) in `@kf/contracts`; validated in the application layer; `payload_version` stored; check constraints on critical fields (e.g. nap end ≥ start).
**Acceptance** (1) A MEAL payload missing `amount_eaten` is rejected with a field pointer. (2) A NAP with end before start is rejected by both the schema and a DB check. (3) Adding a new payload version does not invalidate stored older versions (read test with mixed versions).
**Risk** High · **Cx** M

### KF-S4-ACT-003 — Activity logging endpoints (single + batch)
**Source of Truth** API Contract §2.7; Design System §08 (5-tap contract); BRD BR-15 (teacher scope).
**Dependencies** KF-S4-ACT-002.
**API** `POST /activity-entries`, `POST /activity-entries/batch` (multi-child, per-item results), `GET /classrooms/{id}/activity-entries`; perms `activity:create|read`; RL-B; emits `ActivityLogged`.
**Implementation** Teacher scope enforced to assigned classrooms; batch supports whole-classroom events (e.g. meal) with per-item outcomes; offline-capable via the same queue pattern as attendance (client `client_event_id`).
**Acceptance** (1) A teacher logging for a child outside their classroom receives 404. (2) A 14-child batch meal returns 14 results and creates 14 entries atomically per item (one failure does not roll back the others). (3) Entries created offline reconcile identically to attendance events.
**Risk** High · **Cx** L

### KF-S4-ACT-004 — Activity edit/delete with report-approval freeze
**Source of Truth** Domain Model Part 2.5; RBAC FL-07; API Contract §2.7 (`REPORT_ALREADY_APPROVED`).
**Dependencies** KF-S4-ACT-003, KF-S4-RPT-001.
**Implementation** Author may edit/soft-delete own entries until the day's report is approved; afterwards mutation is refused.
**Acceptance** (1) Editing an entry after report approval returns 422 `REPORT_ALREADY_APPROVED`. (2) A different teacher cannot edit another's entry even before approval (unless the matrix grants it). (3) Soft-deleted entries are excluded from report generation but retained for audit.
**Risk** Medium · **Cx** M

### KF-S4-ACT-005 — Medication authorizations
**Source of Truth** Domain Model Part 2.5 (invariants); API Contract §2.8; RBAC §3.
**Dependencies** KF-S4-ACT-001, KF-S2-CHILD-004.
**API** `POST /children/{id}/medication-authorizations`, `GET …`, `POST …/{authId}/approve`; perms `med-auth:create|read|approve`; audited.
**Implementation** Guardian-signed (signature reference), dose, route, time window, validity dates; BranchManager approval required before it is effective.
**Acceptance** (1) An unapproved authorization does not permit administration. (2) An expired authorization is excluded from the teacher's due list automatically.
**Risk** High · **Cx** M

### KF-S4-ACT-006 — Medication administration recording
**Source of Truth** Domain Model Part 2.5; API Contract §2.8 (`MED_AUTH_INVALID`).
**Dependencies** KF-S4-ACT-005.
**API** `POST /medication-administrations` perm `med-admin:create`; `GET /children/{id}/medication-administrations`; immutable once written; audited; parent-visible.
**Implementation** Hard block outside the authorized dose window or without an active authorization; auto-timestamped; 2-tap teacher flow (Design §07).
**Acceptance** (1) Administering outside the window returns 422 `MED_AUTH_INVALID` with an explanatory message naming the window. (2) A recorded administration cannot be edited or deleted by any role. (3) The parent sees the administration record the same day.
**Risk** Critical · **Cx** M

### KF-S4-ACT-007 — Teacher due-list query (medication + gaps)
**Source of Truth** Design System §07 (medication), §08.
**Dependencies** KF-S4-ACT-006.
**Acceptance** The teacher's Today view lists medications due with time chips and flags children with missing expected logs (meals/naps) to drive report completeness.
**Risk** Low · **Cx** M

### KF-S4-ACT-008 — Activity domain events and media attachment
**Source of Truth** Domain Model §1.5; API Contract §2.10.
**Dependencies** KF-S4-ACT-003, KF-S2-MEDIA-004.
**Implementation** Attach media assets to activity entries via the owner registry; emit `ActivityLogged`, `MedicationAdministered` to outbox.
**Acceptance** (1) Attaching media to an activity respects per-child consent at attachment time. (2) Events are written transactionally with the entry.
**Risk** Medium · **Cx** M

---

### KF-S4-RPT-001 — Daily report aggregate and state machine
**Objective** Implement BR-13 as structure, not policy.
**Source of Truth** BRD BR-13; Domain Model Part 2.5 (lifecycle); API Contract §2.7; Design System §12.
**Dependencies** KF-S4-ACT-001.
**Implementation** States: Empty → Drafting → PendingReview → Approved → Published (+ Rejected→Drafting); transitions implemented as an explicit state machine; **`publish` is reachable only from `Approved`, and `approve` requires an authenticated actor with `report:approve`** — there is no service method that writes a published report directly.
**Testing** A structural test enumerating all repository/service methods asserting none can set `published_at` without passing through approval.
**Acceptance** (1) Attempting an invalid transition returns `STATE_TRANSITION_INVALID`. (2) The structural test proves no bypass path exists (this test is permanent and must be updated deliberately, never deleted). (3) An unapproved report is never returned by the parent feed query.
**Risk** Critical · **Cx** L

### KF-S4-RPT-002 — Template draft generation (non-AI)
**Source of Truth** SAD §7 (fallback path is template-based); Blueprint §5 (fallback); Domain Model Part 2.5.
**Dependencies** KF-S4-RPT-001, KF-S4-ACT-003.
**Implementation** Deterministic report text built from the day's structured entries in the tenant/parent language; the same snapshot builder that Sprint 5 will feed to the AI adapter (built here so the AI task adds an adapter, not a new pipeline); scheduled per classroom before shift end + on demand.
**Acceptance** (1) A day with 7 logged activities produces a coherent template draft in ar and en. (2) The snapshot builder output is the exact structure specified for AI input in SAD §7 (contract test), containing no PII beyond first name and pseudonymous id.
**Risk** High · **Cx** L

### KF-S4-RPT-003 — Report review, edit, approve, reject endpoints
**Source of Truth** API Contract §2.7; RBAC §3, §5 (AI/report permissions); Design System §12 (UXD-04).
**Dependencies** KF-S4-RPT-002.
**API** `GET /daily-reports`, `PATCH /daily-reports/{id}`, `POST …/approve`, `POST …/reject`, `POST …/request-draft`; perms `report:read|update|approve`; audited on approve/publish.
**Implementation** Approve = publish transition emitting `ReportPublished`; UXD-04 (report must be opened before approve is enabled) enforced **server-side** via an opened-marker, not only in UI — if UXD-04 is unconfirmed (DISC-007) implement the recommended behavior behind a tenant setting defaulting to enforced.
**Acceptance** (1) Approving without a recorded open returns 422 with the documented code (when the setting is enforced). (2) BranchManager can approve in a teacher's absence, and this delegation is audited distinctly. (3) Rejection returns the report to Drafting with the reviewer's notes retained.
**Risk** Critical · **Cx** L

### KF-S4-RPT-004 — Parent feed query
**Source of Truth** API Contract §2.7; Design System §09 (feed), NFR feed first page <500 ms.
**Dependencies** KF-S4-RPT-003, KF-S2-CHILD-010.
**Implementation** Reverse-chronological day timeline joining check-in/out chips, published activities, published report, consent-filtered media; cursor pagination; own-children scope.
**Acceptance** (1) Only published reports and consented media appear. (2) First page renders within the 500 ms budget on the seeded dataset (measured). (3) A parent with two children sees a correctly separated feed per child.
**Risk** High · **Cx** L

### KF-S4-RPT-005 — Report exports
**Source of Truth** API Contract §2.13/§2.7; RBAC §3 (`report:export` holders).
**Dependencies** KF-S4-RPT-003.
**Implementation** Async export of approved reports only; drafts excluded; export requests audited (SEC-DATA-001) and owner-notified.
**Acceptance** Exports contain zero unapproved content; each export writes an audit entry and a notification.
**Risk** Medium · **Cx** M

### KF-S4-RPT-006 — Report scheduling job
**Source of Truth** SAD §10.1 (queues); Blueprint §5 (pre-shift-end batching).
**Dependencies** KF-S4-RPT-002, KF-S0-API-002.
**Implementation** Per-classroom scheduled draft generation in tenant timezone; idempotent per (classroom, date); backpressure-aware (prepares for AI quota logic in S5).
**Acceptance** Re-running for the same classroom/date does not create duplicate drafts; job failure is retried and lands in DLQ with alerting if terminal.
**Risk** Medium · **Cx** M

---

### KF-S4-FE-TCH-001 — Quick-log grid (≤5 taps)
**Source of Truth** Design System §08 (tap contract), §05 (components), §18 (wireframe).
**Dependencies** KF-S4-ACT-003, KF-S0-FE-003.
**Implementation** Log(+) → type (tap 1) → child/children multi-select (taps 2–3) → preset value (tap 4) → save (tap 5); presets per type; 56 px targets; bottom-60% placement for one-hand use; offline-capable with queued badges.
**Acceptance** (1) Instrumented test records ≤5 taps for a single-child meal entry and ≤3 taps for a whole-classroom batch. (2) All controls are reachable one-handed on a 6.1″ viewport (layout assertion). (3) Logging works fully offline with visible queued state.
**Risk** High · **Cx** L

### KF-S4-FE-TCH-002 — Report queue and review screen
**Source of Truth** Design System §12 (review UX), §08.
**Dependencies** KF-S4-RPT-003, KF-S4-FE-TCH-001.
**Implementation** Per-child draft status chips; review screen opens in editable state; coverage indicator listing missing data (e.g. "nap time missing"); approve button enabled after open (UXD-04); parent-visible preview before confirm.
**Acceptance** (1) Approve is disabled until the report has been opened and scrolled. (2) The preview shown before approval matches exactly what the parent later sees (snapshot comparison test).
**Risk** High · **Cx** L

### KF-S4-FE-PAR-001 — Parent feed
**Source of Truth** Design System §09, §18 (parent wireframe), §15 (empty states).
**Dependencies** KF-S4-RPT-004.
**Acceptance** Feed renders check-in chips, activities, media, and the day's report; skeletons mirror final layout; empty states use the approved copy; ar/en verified.
**Risk** Medium · **Cx** L

### KF-S4-FE-PAR-002 — Report detail and media gallery
**Source of Truth** Design System §05 (gallery), §09; BR-19.
**Dependencies** KF-S4-FE-PAR-001, KF-S2-MEDIA-004.
**Acceptance** Gallery shows only consented media; lightbox works; download available only to permitted roles; no unconsented image is ever requested by the client (network assertion).
**Risk** High · **Cx** M

### KF-S4-FE-PAR-003 — Notifications for report published
**Source of Truth** Design System §09; SAD §10 (notifications queue).
**Dependencies** KF-S4-RPT-003, KF-S3-ATT-009.
**Acceptance** Parents receive a notification on publish, honoring preferences (non-safety category), with in-app inbox fallback on iOS (TD-02).
**Risk** Medium · **Cx** M

---

### KF-S4-QA-001 — 5-tap and usability instrumentation
**Source of Truth** BRD O1/acceptance criteria; Design System §08; Blueprint §14 DR-03.
**Dependencies** KF-S4-FE-TCH-001.
**Implementation** Automated tap-count assertions **plus** a moderated session with three real teachers (Blueprint DR-03 mitigation); findings recorded and triaged within the sprint.
**Acceptance** Automated contract met; usability session completed with written findings; any failure produces UX iteration tasks, not a relaxed target.
**Risk** High · **Cx** M

### KF-S4-QA-002 — Consent and publication enforcement suite
**Dependencies** KF-S4-RPT-004, KF-S4-FE-PAR-002.
**Acceptance** Tests prove: unapproved reports never reachable by parent endpoints; unconsented media never served; the structural no-bypass test from KF-S4-RPT-001 runs in CI.
**Risk** Critical · **Cx** M

### KF-S4-QA-003 — Daily loop E2E (ar + en)
**Dependencies** All S4 tasks.
**Implementation** Playwright: teacher logs → draft generated → review → approve → parent sees report and media; run in both locales; offline variant for the logging step.
**Acceptance** Green in ar and en; screenshots attached; runtime recorded.
**Risk** High · **Cx** L

---

## Sprint 4 Exit Checklist

| Gate | Evidence |
|---|---|
| BR-13 structural | No-bypass test proves publication requires approval |
| 5-tap contract | Automated tap count + teacher usability session report |
| Consent | No unconsented media served; enforcement tested at API and client |
| Medication safety | Out-of-window administration blocked; records immutable |
| Loop E2E | ar + en green, online and offline logging |
| Snapshot contract | Report snapshot builder output matches the SAD §7 AI-input structure (ready for S5) |
