# 06 — Sprint 2: Children & Families (Detailed Task Specifications)

| Field | Value |
|-------|-------|
| Sprint goal | The child record — the platform's most sensitive data and the upstream supplier for every core context |
| Entry criteria | Sprint 1 exit green; own-children scope resolver ready to be completed (KF-S1-IAM-003 stub) |
| Exit criteria | Admission E2E in ar+en; FL field-rules enforced in DTOs; media pipeline consent-aware; isolation + negative RBAC covering all S2 endpoints |
| Authority | Blueprint §6 (S2); Domain Model Part 2.3, Part 3 (tables 15–23, 32), Part 4; RBAC §3–§4 (FL-01…FL-06); API Contract §2.5, §2.10; Design System §07 (admission), §09 |
| Inherited defaults | As declared in `05_Sprint_1.md` (Source of Truth baseline, Security baseline, Testing baseline, universal DoD) |

---

### KF-S2-CHILD-001 — Migration M-004: child record tables
**Objective** Children, guardians, links, pickups, medical, medication authorizations, consents, documents with full isolation.
**Source of Truth** Domain Model Part 3 (tables 15–23), Part 4.1, Part 6; Blueprint §4 M-004.
**Dependencies** KF-S1-TENANT-001, KF-S1-QA-001.
**Files/Areas** `apps/api/prisma/`, model manifest.
**Implementation** All nine tables per catalog; **tenant-composite FKs** on children→classrooms, medical→children, pickups→children, documents→children (Domain §6.3); field-level encryption columns for medical notes and national IDs; `retention_until` on children (D8, 5 years); partial indexes (`WHERE deleted_at IS NULL`, `WHERE is_alert`, `WHERE is_active`); constraint trigger enforcing ≥1 primary guardian on child activation (BR-04).
**Security** RLS `TENANT_STANDARD` + FORCE on all nine; encryption keys from secrets, never in migrations.
**Testing** Migration + linter; isolation SQL probes ×9; constraint trigger tests; composite-FK test proving a cross-tenant link is impossible even with RLS disabled.
**Acceptance** (1) Attempting to insert a `medical_records` row whose `child_id` belongs to another tenant fails on the composite FK even with RLS bypassed in the test harness. (2) Activating a child with zero primary guardians is rejected by the constraint trigger. (3) All nine tables appear in the isolation suite's covered list.
**Risk** Critical · **Cx** L

### KF-S2-CHILD-002 — Child aggregate, repository, and read endpoints
**Source of Truth** Domain Model Part 2.3, Part 1.3 (Child aggregate invariants); API Contract §2.5; RBAC §3, FL-01/FL-05.
**Dependencies** KF-S2-CHILD-001.
**API** `GET /children` (cursor, `?q=`, filters), `GET /children/{id}`; perm `child:read`; role DTO variants: Teacher (classroom-scoped, no financial fields), Parent (own children only), Accountant (billing-relevant fields), Owner/BM (full).
**Implementation** Domain entity with invariants; query service with trigram name search; DTO variants as named schemas in `@kf/contracts`.
**Testing** DTO variant tests asserting **absence** of forbidden fields per role (not just presence of allowed ones).
**Acceptance** (1) A Teacher's child response contains no invoice/fee/balance field anywhere in the payload (asserted by deep key scan). (2) A Parent requesting a child they are not linked to receives 404. (3) Search with a 1-character query returns a validation error; 2+ characters returns trigram matches in Arabic and English.
**Risk** High · **Cx** L

### KF-S2-CHILD-003 — Admission: atomic child creation with guardians
**Source of Truth** API Contract §2.5 (`POST /children`); BRD BR-02/03/04; Design System §07 (3-step wizard).
**Dependencies** KF-S2-CHILD-002, KF-S2-CHILD-004.
**API** `POST /children` perm `child:create`; optional idempotency; errors `CLASSROOM_CAPACITY_EXCEEDED`, `AGE_RANGE_VIOLATION`, `LAST_PRIMARY_GUARDIAN`/missing-primary, `VALIDATION_FAILED` with JSON-Pointer `errors[]`; audit SEC-DATA-003; emits `ChildEnrolled`.
**Implementation** Single transaction: child + guardians + links + optional medical + consents; capacity check (BR-02) with Owner-override path recording a reason; age check (BR-03) as warning+override.
**Testing** Property test: concurrent admissions into a classroom at capacity−1 admit exactly one (advisory lock or constraint).
**Acceptance** (1) Submitting an admission without a primary guardian returns 422 with a pointer to `/guardians`. (2) Two concurrent admissions for the last seat result in exactly one success and one `CLASSROOM_CAPACITY_EXCEEDED`. (3) The whole admission is atomic — a failure at the consent step leaves no child row.
**Risk** Critical · **Cx** L

### KF-S2-CHILD-004 — Guardian aggregate and endpoints
**Source of Truth** Domain Model Part 2.3; API Contract §2.5; RBAC §3 (Guardians row).
**Dependencies** KF-S2-CHILD-001.
**API** `GET/PATCH /guardians/{id}`; `GET/POST /children/{id}/guardians`, `PATCH/DELETE /children/{id}/guardians/{guardianId}`; perms `guardian:*`.
**Implementation** Guardian exists independently of a user account; phone E.164 (EG/GCC validation); `is_primary` flag; removal of the last primary blocked (`LAST_PRIMARY_GUARDIAN`).
**Acceptance** (1) Removing the only primary guardian returns 422 with the documented code. (2) A parent can update their own contact details but not another guardian's. (3) The same guardian can be linked to multiple siblings without duplication.
**Risk** High · **Cx** M

### KF-S2-CHILD-005 — Authorized pickup list + parent submission + approval
**Objective** The authorization source for the safety-critical gate flow (BR-01).
**Source of Truth** BRD BR-01; Domain Model Part 2.3; API Contract §2.5; RBAC §3 (Authorized pickups row), FL-06; Design System §07 (guardian approval).
**Dependencies** KF-S2-CHILD-004, KF-S2-MEDIA-003.
**API** `GET/POST /children/{id}/authorized-pickups`, `PATCH/DELETE …/{pickupId}`, `POST …/{pickupId}/approve`; perms `pickup:read|create|update|delete|approve`; audit SEC-SAFE-003 on every change; guardians notified on change.
**Implementation** Parent-created entries land `pending_approval` and are **not** authorization-effective until a BranchManager approves; identity descriptor + optional photo; national ID stored encrypted, displayed masked (FL-06).
**Security** This list is never cached (Design §05 / SAD §6.2) — reads are always fresh.
**Testing** Negative: a pending entry must not authorize pickup (asserted against the S3 authorization service contract via a shared fixture).
**Acceptance** (1) A parent-submitted pickup person is stored as pending and is rejected by the authorization check until approved. (2) Every create/update/delete emits SEC-SAFE-003 and notifies the primary guardian. (3) National ID is returned masked to all roles except during the Owner/BM verification flow.
**Risk** Critical · **Cx** L

### KF-S2-CHILD-006 — Medical records and alert projection
**Source of Truth** BRD BR-05; Domain Model Part 2.3; RBAC FL-05; API Contract §2.5.
**Dependencies** KF-S2-CHILD-001.
**API** `GET/POST/PATCH /children/{id}/medical-records[/{recId}]`; perm `medical:*`; audit SEC-DATA-003.
**Implementation** Encrypted note fields; `is_alert` flag projecting to child header chips and gate check-in (consumed in S3); allergy chips always visible (Design §05).
**Acceptance** (1) A Teacher receives alert summaries but not full clinical notes (deep-key assertion). (2) Audit entries record the changed field names without their values. (3) A child with an active alert exposes it on the roster payload consumed by the gate.
**Risk** High · **Cx** M

### KF-S2-CHILD-007 — Consents (BR-19)
**Source of Truth** BRD BR-19; Domain Model Part 3 (table 22); API Contract §2.5; RBAC FL-02.
**Dependencies** KF-S2-CHILD-001.
**API** `GET/PUT /children/{id}/consents`; perms `consent:read|update`.
**Implementation** Consent types: data processing, internal photo, group photo; granted_by guardian reference; changes emit `ConsentChanged` (media visibility recalculated).
**Acceptance** (1) Revoking group-photo consent immediately removes that child's images from other families' visible galleries (verified with the S2 media access rule). (2) Consent state is required before media may be attached to a child.
**Risk** High · **Cx** M

### KF-S2-CHILD-008 — Child documents
**Source of Truth** Domain Model Part 3 (table 23); API Contract §2.5; RBAC §3.
**Dependencies** KF-S2-MEDIA-002.
**API** `GET/POST/DELETE /children/{id}/documents[/{docId}]`; perms `document:*`.
**Acceptance** (1) Documents are stored via the media pipeline with tenant-prefixed keys. (2) Deleting a document soft-deletes and schedules storage lifecycle rather than immediate hard delete.
**Risk** Medium · **Cx** M

### KF-S2-CHILD-009 — Withdrawal, retention clock, and lifecycle events
**Source of Truth** BRD BR-20/D8; Domain Model Part 2.3 lifecycle, Part 4.3; API Contract §2.5.
**Dependencies** KF-S2-CHILD-003.
**API** `POST /children/{id}/withdraw` perm `child:archive`; emits `ChildWithdrawn`; audited.
**Implementation** Sets status, computes `retention_until = withdrawal + 5 years` (from tenant settings), ends fee assignment hook (no-op until S6), schedules media lifecycle policy; **no data deletion occurs here**.
**Acceptance** (1) Withdrawal sets the retention date from tenant settings, not a hard-coded constant. (2) A withdrawn child disappears from active rosters but remains fully readable by Owner/BM. (3) No purge job exists in this sprint (purge is S7/S8 platform work) — asserted by absence of any hard-delete path.
**Risk** High · **Cx** M

### KF-S2-CHILD-010 — Complete own-children scope resolver
**Objective** Replace the S1 fail-closed stub with the real parent scope.
**Source of Truth** RBAC §2.3, FL-02; KF-S1-IAM-003.
**Dependencies** KF-S2-CHILD-004.
**Implementation** Resolver joins `child_guardians`; excludes withdrawn children beyond a configurable visibility window; caches nothing security-critical beyond 30 s.
**Testing** Negative: parent A requesting parent B's child id → 404 + SEC-PERM-003 not fired (same tenant, so it is SEC-PERM-002 scope denial — assert the correct event).
**Acceptance** (1) A parent linked to two children sees exactly those two across every child-scoped endpoint. (2) Requesting a sibling's classmate returns 404 with a scope-denial audit event (not a cross-tenant tripwire).
**Risk** Critical · **Cx** M

### KF-S2-CHILD-011 — Child search and list performance
**Source of Truth** Domain Model Part 9 (trigram search, index plan); API Contract §1 (pagination).
**Dependencies** KF-S2-CHILD-002.
**Implementation** `pg_trgm` GIN indexes on unaccented generated name columns (ar + en); cursor pagination; query budget assertion.
**Acceptance** (1) Searching an Arabic partial name returns matches ranked sensibly. (2) List queries stay within the p95 <50 ms DB budget on a 5,000-child seeded tenant (measured in the test).
**Risk** Medium · **Cx** M

### KF-S2-CHILD-012 — Domain events for the children context
**Source of Truth** Domain Model §1.5; SAD §3.2 (outbox).
**Dependencies** KF-S2-CHILD-009, KF-S0-API-002.
**Implementation** `ChildEnrolled`, `ChildWithdrawn`, `GuardianLinked`, `PickupListChanged`, `ConsentChanged`, `MedicalRecordUpdated` written to `outbox_events` in the same transaction; dispatcher publishes to BullMQ.
**Acceptance** (1) An event row is written atomically with its business change (rollback test: failed transaction leaves no event). (2) The dispatcher publishes each event exactly once under retry (idempotent marking).
**Risk** High · **Cx** M

---

### KF-S2-MEDIA-001 — Media asset model and migration
**Source of Truth** Domain Model Part 3 (table 32), Part 4.2 (polymorphic owner); API Contract §2.10.
**Dependencies** KF-S2-CHILD-001.
**Implementation** `media_assets` with tenant-prefixed S3 keys, size, hash, variants, `owner_type`/`owner_id`; RLS; orphan-sweep job registration (runs in S7 cleanup queue).
**Acceptance** (1) Keys follow `tenants/{tenant_id}/…` (asserted). (2) The polymorphic owner registry rejects an unregistered owner type at write time.
**Risk** Medium · **Cx** M

### KF-S2-MEDIA-002 — Upload request/complete endpoints with quota enforcement
**Source of Truth** API Contract §2.10; BRD BR-21; RBAC §3 (Media row).
**Dependencies** KF-S2-MEDIA-001, KF-S1-TENANT-006.
**API** `POST /media/uploads` (Idempotency-Key required, RL-C), `POST /media/uploads/{id}/complete`; perm `media:create`; errors `STORAGE_QUOTA_EXCEEDED`, `MEDIA_TYPE_UNSUPPORTED`, `MEDIA_TOO_LARGE`.
**Implementation** Signed PUT URL; mime whitelist; size cap; quota checked against the subscription plan **before** issuing the URL.
**Acceptance** (1) A tenant at quota receives 422 `STORAGE_QUOTA_EXCEEDED` with an upgrade explainer payload and no signed URL is issued. (2) Replaying the same idempotency key returns the original upload target rather than creating a second asset.
**Risk** High · **Cx** M

### KF-S2-MEDIA-003 — Processing worker (validation, re-encode, EXIF strip, variants)
**Source of Truth** SAD §5.3 (uploads), §10.1 (`media` queue); Blueprint §10.
**Dependencies** KF-S2-MEDIA-002, KF-S0-API-002.
**Implementation** BullMQ `media` queue: type sniffing (not trusting the declared mime), re-encode, strip EXIF/GPS, generate variants (thumb/web), record size for quota accounting, quarantine on failure (`MEDIA_QUARANTINED`).
**Testing** Malicious-file corpus (polyglot, oversized, wrong-extension) → quarantined, never served.
**Acceptance** (1) An image with GPS EXIF is stored without it (asserted on the processed object). (2) A file whose real type differs from its declared mime is quarantined and the uploader is informed. (3) Quota usage increases by the **processed** size, not the claimed size.
**Risk** High · **Cx** L

### KF-S2-MEDIA-004 — Consent-aware access URLs
**Source of Truth** BRD BR-19; RBAC FL-02; API Contract §2.10.
**Dependencies** KF-S2-MEDIA-003, KF-S2-CHILD-007.
**API** `GET /media/{id}` returns metadata + short-lived signed URL; error `CONSENT_REQUIRED` (403).
**Implementation** Every URL issuance runs: tenant check → ownership/scope check → consent check per depicted child; URLs expire ≤5 minutes; no public objects.
**Testing** Negative: parent without group-photo consent for their child cannot retrieve a group image containing that child.
**Acceptance** (1) Revoking consent invalidates future URL issuance immediately (existing short-lived URLs expire naturally — documented and accepted). (2) A direct S3 key guess returns 403 from storage (no public read).
**Risk** Critical · **Cx** M

### KF-S2-MEDIA-005 — Storage quota accounting and warnings
**Source of Truth** BRD BR-21/BR-22; Domain Model Part 2.10; SAD §10.
**Dependencies** KF-S2-MEDIA-003.
**Implementation** Usage rollup per tenant; `StorageQuotaWarning` event at 90%; usage exposed on `GET /subscription`.
**Acceptance** (1) Crossing 90% emits the warning event once per threshold crossing, not per upload. (2) Deleting assets decreases accounted usage after lifecycle processing.
**Risk** Medium · **Cx** M

---

### KF-S2-FE-CON-001 — Admission wizard (3 steps, autosave)
**Source of Truth** Design System §07 (admission), §01 (forms), §16 (validation); API Contract §2.5.
**Dependencies** KF-S2-CHILD-003, KF-S0-FE-003.
**Implementation** Steps Child → Guardians → Classroom+Fee(placeholder until S6); autosaved draft; server `errors[]` pointers mapped back to the owning step; ar/en.
**Acceptance** (1) A validation failure on submit highlights the exact field in the correct step and focuses it. (2) Closing and reopening the browser restores the draft. (3) Capacity/age errors render the documented business messages, not raw codes.
**Risk** Medium · **Cx** L

### KF-S2-FE-CON-002 — Child profile screen (role-aware)
**Source of Truth** Design System §05 (child card, chips), §06; RBAC FL-01/FL-05/FL-06.
**Dependencies** KF-S2-CHILD-002.
**Implementation** Header with photo, allergy chips (always visible), tabs: profile, guardians, pickups, medical, consents, documents — tabs rendered only when the role's permissions allow.
**Acceptance** (1) A Teacher opening a child sees no financial tab and no full medical notes. (2) Allergy chips are visible without interaction and carry a non-color indicator (icon + text).
**Risk** Medium · **Cx** L

### KF-S2-FE-CON-003 — Pickup list manager + approval queue
**Source of Truth** Design System §07 (guardian approval flow); API Contract §2.5.
**Dependencies** KF-S2-CHILD-005.
**Acceptance** (1) Pending parent submissions appear in the BranchManager approval queue with photo and masked ID. (2) Approving updates the list and notifies the guardian; the UI states clearly that pending entries are not authorized.
**Risk** Medium · **Cx** M

### KF-S2-FE-PAR-001 — Parent: child profile, consents, pickup submission
**Source of Truth** Design System §09 (parent experience), §06; RBAC FL-02.
**Dependencies** KF-S2-CHILD-010, KF-S2-CHILD-007.
**Acceptance** (1) A parent with two children switches between them and never sees another family's data. (2) Consent toggles state their effect in plain Arabic/English before confirmation.
**Risk** Medium · **Cx** M

---

### KF-S2-QA-001 — Isolation + RBAC negative suite extension
**Dependencies** All S2 API tasks. **Source of Truth** Blueprint §8; instruction §9, §12.
**Acceptance** (1) All S2 endpoints and 10 new tables are covered. (2) Parent-vs-parent, teacher-vs-classroom, and cross-tenant negative cases all pass with the documented status codes and audit events.
**Risk** Critical · **Cx** M

### KF-S2-QA-002 — Field-level (FL) DTO enforcement tests
**Source of Truth** RBAC §4 (FL-01…FL-06).
**Dependencies** KF-S2-CHILD-002, KF-S2-CHILD-006.
**Implementation** Deep-key scanning tests per role per endpoint asserting forbidden fields are absent from serialized payloads.
**Acceptance** Each FL rule has at least one automated test that fails if the field reappears.
**Risk** High · **Cx** M

### KF-S2-QA-003 — Admission E2E (ar + en)
**Dependencies** KF-S2-FE-CON-001. **Source of Truth** Design System §07; Blueprint §8.
**Acceptance** Playwright completes admission in both locales, including RTL layout assertions and a screenshot pair attached to the PR.
**Risk** Medium · **Cx** M

---

## Sprint 2 Exit Checklist

| Gate | Evidence |
|---|---|
| Composite FK protection | Cross-tenant link rejected with RLS disabled in the test harness |
| BR-04 | Child cannot activate without a primary guardian |
| BR-01 source integrity | Pending pickup entries do not authorize; every change audited + guardian notified |
| BR-19 | Consent revocation blocks new media URL issuance |
| FL rules | Automated deep-key tests per role |
| Parent scope | Own-children resolver replaces the fail-closed stub; negative tests green |
| Admission | E2E green in ar and en |
