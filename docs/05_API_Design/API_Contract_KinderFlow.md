# KinderFlow — Enterprise API Contract

| Field | Value |
|-------|-------|
| Document | API Contract Specification (Phase 5) |
| Version | 1.0 |
| Date | 2026-07-18 |
| Status | Pending Review — becomes source of truth for backend implementation on approval |
| Inputs | SAD §8 (approved), Domain Model v1.0, Security & RBAC v1.0 (§3 matrix is authoritative for permissions) |
| Base URL | `https://api.kinderflow.app/api/v1` |

---

# 1. API Standards

| Topic | Standard |
|-------|----------|
| Style | REST, resource-oriented JSON; plural kebab-case resources; nesting max 2 levels (`/children/{id}/attendance-events`); actions that aren't CRUD are sub-resources (`/invoices/{id}/issue` POST) |
| Versioning | URI major version `/api/v1`; additive changes in-place; breaking → `/v2` with 6-month overlap (§10) |
| IDs | UUIDv7 strings everywhere; no sequential IDs exposed |
| Envelope | Success: `{ "data": …, "meta": { … } }`. Errors: RFC 7807 (§4). Timestamps ISO-8601 UTC (`Z`); money `{ "amount_minor": 150000, "currency": "EGP" }` |
| Localization | `Accept-Language: ar \| en` → localized labels/messages; `LocalizedText` fields always return both: `{ "ar": "…", "en": "…" }` |
| Pagination | Cursor-based: `?cursor=<opaque>&limit=25` (max 100); `meta.next_cursor` null on last page; cursors are signed opaque tokens (UUIDv7 keyset underneath); offset pagination nowhere |
| Filtering | `?filter[field]=value`; operators via suffix: `filter[due_date][gte]=2026-07-01`; allowed filters whitelisted per endpoint in OpenAPI |
| Sorting | `?sort=-created_at,name` (max 2 keys, whitelisted) |
| Searching | `?q=` on designated endpoints (children, guardians, staff) — trigram name search (Domain §Part 9); min 2 chars |
| Sparse fields | `?fields=id,first_name` optional on heavy list endpoints |
| Bulk operations | Only where the domain demands: attendance sync batch, notification mark-read, invoice cycle run. Bulk = atomic per item with per-item result array — never all-or-nothing unless transactional by nature |
| Idempotency | `Idempotency-Key` header (UUID) **required** on: `POST /attendance-events/sync`, `POST /payments`, `POST /invoices/generate-cycle`, `POST /media/uploads`; optional on all POSTs; 48 h Redis retention; replay returns original response + `Idempotency-Replayed: true` |
| Concurrency | Optimistic locking: mutable aggregates return `version`; mutating requests send `If-Match: "<version>"`; mismatch → `409 VERSION_CONFLICT` (never lost-update) |
| ETag / caching | `ETag` on single-resource GETs (hash of version+updated_at); `If-None-Match` → 304. `Cache-Control: private, no-store` on child/medical/financial data; `private, max-age=60` on settings/reference data |
| Compression | gzip/br negotiated; responses >1 KB compressed |
| Rate limiting | Tiers (Redis sliding window): **RL-A** auth endpoints 10/min/IP; **RL-B** standard 120/min/user; **RL-C** heavy (exports, media, AI) 10/min/user; **RL-T** tenant aggregate 3,000/min. Headers: `RateLimit-Limit/Remaining/Reset`; 429 with `Retry-After` |
| Request IDs | Client MAY send `X-Request-Id` (UUID); server always returns it (generated if absent) — echoes in error bodies as `trace_id`, propagated to logs/audit (SAD §9) |
| Correlation | `X-Correlation-Id` for multi-request flows (sync batches, wizards); stored on audit entries |
| Clock | `X-Device-Time` on offline-capable endpoints → server computes skew for sync reconciliation (§5) |
| Deprecation signals | `Deprecation` + `Sunset` headers + OpenAPI `deprecated: true` (§10) |

---
# 2. Endpoint Catalog

Column legend — **Perm**: permission code (RBAC §2.4, matrix §3 authoritative). **Idem**: ✔ = Idempotency-Key required. **RL**: rate-limit tier. **Audit**: SEC event / audit trail entry. All endpoints require Bearer JWT unless marked `public`. Scope enforcement per RBAC matrix is implied and not repeated per row. Validation and full error lists live in the DTO (§3) and error (§4) catalogs; per-row "Errors" lists only endpoint-specific codes beyond the standard set (401/403/404/422/429).

### 2.1 Authentication (`/auth`) — RL-A, public where noted

| Method + Path | Description | Perm | Idem | Audit | Notable errors / rules |
|---|---|---|---|---|---|
| POST `/auth/login` | Email+password → access + refresh cookie | public | — | SEC-AUTH-001/002 | `AUTH_INVALID_CREDENTIALS`, `AUTH_ACCOUNT_LOCKED`; lockout policy §1.1 RBAC doc |
| POST `/auth/refresh` | Rotate refresh, new access token | public (cookie) | — | SEC-TOKEN-001/002 | `AUTH_TOKEN_REUSED` → family revoked |
| POST `/auth/logout` | Revoke session (jti) | any authenticated | — | SEC-AUTH-003 | |
| POST `/auth/password/forgot` | Send one-time reset link | public | — | SEC-AUTH-005 | Always 202 (no user enumeration) |
| POST `/auth/password/reset` | Consume token, set password | public | — | SEC-AUTH-005 | `AUTH_RESET_TOKEN_INVALID`; revokes all sessions |
| POST `/auth/invitations/accept` | Parent/staff activation via signed link | public | — | SEC-AUTH-001 | `AUTH_INVITE_EXPIRED` |
| GET `/auth/me` | Current user, roles, scopes, tenant | any | — | — | Cache no-store |
| POST `/auth/mfa/enroll` · POST `/auth/mfa/verify` | TOTP enrollment (post-MVP enforcement) | `user:update` (self) | — | SEC-AUTH-006 | |

### 2.2 Organization & Settings (`/organization`, `/settings`)

| Method + Path | Description | Perm | Idem | Audit |
|---|---|---|---|---|
| GET `/organization` | Own org profile + lifecycle status | `organization:read` | — | — |
| PATCH `/organization` | Update profile (If-Match) | `organization:update` | — | audit diff |
| GET `/settings` · PATCH `/settings` | Tenant settings (locale, TZ, quiet hours, billing day) | `settings:read/update` | — | audit diff (SEC-relevant fields) |

### 2.3 Branches & Classrooms (`/branches`, `/classrooms`) — RL-B

| Method + Path | Description | Perm | Audit |
|---|---|---|---|
| GET `/branches` · POST `/branches` | List / create | `branch:read/create` | create audited |
| GET/PATCH `/branches/{id}` · POST `/branches/{id}/archive` | Read / update / archive (empty branch only → `BRANCH_NOT_EMPTY`) | `branch:read/update/archive` | audited |
| GET `/classrooms?filter[branch_id]` · POST `/classrooms` | List / create (capacity>0, age range valid) | `classroom:read/create` | audited |
| GET/PATCH `/classrooms/{id}` · POST `/classrooms/{id}/archive` | Read / update / archive (`CLASSROOM_HAS_CHILDREN` block) | `classroom:*` | audited |
| GET `/classrooms/{id}/roster` | Children + assigned staff + today's ratio | `classroom:read` | — |

### 2.4 Users, Roles & Permissions (`/users`, `/roles`) — RL-B

| Method + Path | Description | Perm | Audit |
|---|---|---|---|
| GET `/users` · POST `/users/invite` | List staff users / invite (role + scope in body) | `user:read/create` | SEC-PERM-001 on invite-with-role |
| GET/PATCH `/users/{id}` | Read / update profile | `user:read/update` | audited |
| POST `/users/{id}/deactivate` · `/reactivate` | Instant session revocation cascade | `user:delete/restore` | SEC-SESS-001 |
| GET `/users/{id}/sessions` · DELETE `/users/{id}/sessions/{jti}` | Device/session list, revoke one | `user:update` (self or admin per matrix) | SEC-SESS-001 |
| GET `/roles` | Reference: roles + permission sets | `role:read` | — |
| POST `/users/{id}/roles` · DELETE `/users/{id}/roles/{roleAssignmentId}` | Grant/revoke scoped role | `role-assignment:create/delete` | SEC-PERM-001 |

### 2.5 Children & Families (`/children`, `/guardians`) — RL-B

| Method + Path | Description | Perm | Idem | Audit |
|---|---|---|---|---|
| GET `/children?q=&filter[branch_id]=&filter[status]=` | Search/list (role-scoped automatically) | `child:read` | — | — |
| POST `/children` | Admission: profile + ≥1 primary guardian (BR-04) atomic | `child:create` | opt | SEC-DATA-003 |
| GET/PATCH `/children/{id}` | Read (DTO variant per role, FL rules) / update | `child:read/update` | — | SEC-DATA-003 |
| POST `/children/{id}/withdraw` | Withdrawal: end fee assignment, start retention clock, media lifecycle | `child:archive` | — | audited + `ChildWithdrawn` |
| GET/POST `/children/{id}/guardians` · PATCH/DELETE `/children/{id}/guardians/{guardianId}` | Manage guardian links (cannot remove last primary → `LAST_PRIMARY_GUARDIAN`) | `guardian:*` | — | SEC-DATA-003 |
| GET/POST `/children/{id}/authorized-pickups` · PATCH/DELETE `…/{pickupId}` | Pickup list (parent-created entries → pending BM approval; BR-01 source) | `pickup:*` per matrix | — | SEC-SAFE-003 |
| POST `/children/{id}/authorized-pickups/{pickupId}/approve` | BM approves parent-submitted person | `pickup:approve` | — | SEC-SAFE-003 |
| GET/POST/PATCH `/children/{id}/medical-records[/{recId}]` | Medical info (FL-05 variants; encrypted fields) | `medical:*` | — | SEC-DATA-003 |
| GET/PUT `/children/{id}/consents` | Consent set (BR-19) | `consent:read/update` | — | SEC-DATA-003 |
| GET/POST/DELETE `/children/{id}/documents[/{docId}]` | Document files (via media pipeline) | `document:*` | — | audited |
| GET `/guardians/{id}` · PATCH `/guardians/{id}` | Guardian profile (self-service for parents) | `guardian:read/update` | — | audited |

### 2.6 Attendance (`/attendance`) — RL-B; safety-critical

| Method + Path | Description | Perm | Idem | Audit | Rules |
|---|---|---|---|---|---|
| POST `/attendance-events` | Single online check-in/out: `{child_id, direction, pickup_person_id?, device_time}` | `attendance:create` | ✔ | SEC-SAFE-001 on block | BR-01 (fresh pickup-list read), BR-11 alternation → `ATTENDANCE_SEQUENCE_CONFLICT`, `PICKUP_NOT_AUTHORIZED` (403 + guardian alert) |
| POST `/attendance-events/sync` | Offline batch (§5 contract) | `attendance:create` | ✔ | per-event | per-item results; conflicts → `pending_review` |
| GET `/attendance-days?filter[date]=&filter[branch_id]=` | Day view per classroom/branch | `attendance:read` | — | — | |
| GET `/children/{id}/attendance-days` | Child history | `attendance:read` (incl. PARENTᴼ) | — | — | |
| POST `/attendance-days/{id}/amendments` | Request/create amendment (BR-12; manager approves) | `attendance:amend` / request | — | audited | Reason mandatory |
| POST `/attendance-amendments/{id}/approve` | BM approval | `attendance:approve` | — | audited | |
| GET `/branches/{id}/presence` | Live presence + ratio snapshot | `attendance:read` | — | — | Never cached |

### 2.7 Activities & Daily Reports (`/activity-entries`, `/daily-reports`) — RL-B

| Method + Path | Description | Perm | Audit | Rules |
|---|---|---|---|---|
| POST `/activity-entries` | Log typed event (MEAL/NAP/DIAPER/MOOD/LEARNING/NOTE) with typed payload | `activity:create` | — | Teacher scope BR-15; ≤5-tap DTO design |
| POST `/activity-entries/batch` | Multi-child same event (e.g., classroom meal) | `activity:create` | — | Per-item results |
| GET `/classrooms/{id}/activity-entries?filter[date]=` | Classroom timeline | `activity:read` | — | |
| PATCH/DELETE `/activity-entries/{id}` | Author edits until report approval → `REPORT_ALREADY_APPROVED` | `activity:update/delete` (ᴼ) | — | FL-07 |
| GET `/daily-reports?filter[date]=&filter[status]=` | Teacher review queue | `report:read` | — | |
| GET `/children/{id}/daily-reports` | Parent feed (published only for PARENT) | `report:read` | — | |
| POST `/daily-reports/{id}/request-draft` | Manual AI re-draft | `report:update` | — | Quota → `AI_QUOTA_EXCEEDED` |
| PATCH `/daily-reports/{id}` | Teacher edits draft content | `report:update` | — | State must be PendingReview |
| POST `/daily-reports/{id}/approve` | Approve → publish (BR-13 gate) | `report:approve` | audited | Emits `ReportPublished` |
| POST `/daily-reports/{id}/reject` | Back to drafting with notes | `report:approve` | — | |

### 2.8 Medication (`/medication`) — RL-B; safety-critical

| Method + Path | Description | Perm | Audit | Rules |
|---|---|---|---|---|
| POST `/children/{id}/medication-authorizations` | Guardian-signed authorization (dose, route, window) | `med-auth:create` | audited | Guardian signature ref required |
| GET `…/medication-authorizations` · POST `…/{authId}/approve` | List / BM approval | `med-auth:read/approve` | audited | |
| POST `/medication-administrations` | Record administration | `med-admin:create` | audited | Active authorization + window → `MED_AUTH_INVALID`; immutable |
| GET `/children/{id}/medication-administrations` | History (parent visible) | `med-admin:read` | — | |

### 2.9 Incidents (`/incidents`) — RL-B

| Method + Path | Description | Perm | Audit |
|---|---|---|---|
| POST `/incidents` | File incident (type, severity, children[], description, media) — one record per child (privacy) | `incident:create` | SEC-SAFE-002 |
| GET `/incidents?filter[status]=&filter[branch_id]=` · GET `/incidents/{id}` | List/read (parent: own child, approved only) | `incident:read` | — |
| PATCH `/incidents/{id}` | Update during review | `incident:update` | audited |
| POST `/incidents/{id}/approve` | BM approve → guardian notification per BR-14 severity | `incident:approve` | SEC-SAFE-002 |
| POST `/incidents/{id}/acknowledge` | Guardian acknowledgment | `incident:read` (PARENTᴼ) | SEC-SAFE-002 |

### 2.10 Media (`/media`) — RL-C

| Method + Path | Description | Perm | Idem | Rules |
|---|---|---|---|---|
| POST `/media/uploads` | Request upload: `{filename, mime, size, owner_type, owner_id}` → signed PUT URL + asset id | `media:create` | ✔ | Quota (BR-21) → `STORAGE_QUOTA_EXCEEDED`; mime whitelist |
| POST `/media/uploads/{id}/complete` | Confirm upload → processing pipeline | `media:create` | — | Validation/quarantine → `MEDIA_QUARANTINED` |
| GET `/media/{id}` | Metadata + short-lived signed GET URL | `media:read` | — | Consent check (FL-02/BR-19) → 403 `CONSENT_REQUIRED` |
| DELETE `/media/{id}` | Soft delete | `media:delete` | — | Lifecycle purge async |

### 2.11 Billing (`/fee-plans`, `/invoices`, `/payments`) — RL-B (cycle run RL-C)

| Method + Path | Description | Perm | Idem | Audit | Rules |
|---|---|---|---|---|---|
| CRUD `/fee-plans[/{id}]` + `/fee-plans/{id}/archive` | Fee plans with components & discount rules | `fee-plan:*` | — | audited | Archive blocked while active assignments |
| POST `/children/{id}/fee-assignment` · PATCH | Assign/end plan (start/end dates) | `fee-assignment:*` | — | audited | One active (partial unique) |
| POST `/invoices/generate-cycle` | Batch generation for cycle `{cycle_month, branch_id?}` — async job, returns job id | `invoice:create` | ✔ | SEC-FIN-001 | Advisory lock; draft state |
| GET `/invoices?filter[status]=&filter[cycle]=&filter[child_id]=` | List (aging via `filter[overdue_bucket]`) | `invoice:read` | — | — | Receptionist gets status-only DTO (FL-03) |
| GET `/invoices/{id}` | Full invoice (lines, snapshot) | `invoice:read` | — | — | |
| PATCH `/invoices/{id}` | Edit **draft only** → `INVOICE_IMMUTABLE` after issue (BR-08) | `invoice:update` | — | audited | If-Match required |
| POST `/invoices/{id}/issue` | Issue single (or auto via batch approve) | `invoice:issue` | — | SEC-FIN-001 | Parent notified |
| POST `/invoices/issue-batch` | Accountant approves generated cycle | `invoice:issue` | ✔ | SEC-FIN-001 | |
| POST `/payments` | Record payment `{guardian_id, amount, method, allocations[]}` | `payment:create` | ✔ | SEC-FIN-002 | Allocation ≤ open balance → `ALLOCATION_EXCEEDS_BALANCE`; overpay → credit |
| GET `/payments?filter[guardian_id]=` · GET `/payments/{id}` | List/read; parent sees own receipts | `payment:read` | — | — | |
| POST `/credit-notes` | Credit against issued invoice (reason mandatory) | `credit-note:create` | ✔ | SEC-FIN-002 | Owner approval per matrix |
| GET `/guardians/{id}/balance` | Open balance + credit (fresh read, never cached) | `invoice:read` | — | — | |

### 2.12 Communication (`/conversations`, `/announcements`, `/notifications`) — RL-B

| Method + Path | Description | Perm | Audit | Rules |
|---|---|---|---|---|
| GET/POST `/conversations` | List / open thread (policy-constrained participants) | `message:read/create` | — | `CONVERSATION_NOT_ALLOWED` |
| GET/POST `/conversations/{id}/messages` | Read / send (quiet hours → queued + `queued_until` in response, BR-18) | `message:*` | FL-09 on admin content access | 15-min author recall window |
| POST `/conversations/{id}/escalate` | Admin unlocks content with incident ref | `message:read` + escalation | SEC-MSG-001 | |
| CRUD `/announcements[/{id}]` + `/announcements/{id}/publish` | Draft→approve→publish (teacher drafts, BM approves) | `announcement:*` | audited | Immutable post-publish |
| GET `/notifications` · POST `/notifications/mark-read` (bulk) | User's notification feed | `notification:read` | — | |
| GET/PUT `/notification-preferences` | Per-channel/category prefs | `notification:update` (self) | — | Critical safety alerts cannot be disabled |

### 2.13 Analytics (`/analytics`) — RL-B

| Method + Path | Description | Perm |
|---|---|---|
| GET `/analytics/overview?filter[branch_id]=&filter[range]=` | Owner KPI dashboard (occupancy, revenue, collection, engagement) — reads kpi snapshots | `analytics:read` |
| GET `/analytics/aging` | Receivables aging 30/60/90 | `analytics:read` (financial subset) |
| GET `/analytics/attendance-trends` · `/engagement` | Trend series | `analytics:read` |
| POST `/analytics/exports` | Async export (xlsx/csv) → job + download via media | `analytics:export` (SEC-DATA-001) |

### 2.14 AI (`/ai`) — RL-C

| Method + Path | Description | Perm | Audit |
|---|---|---|---|
| GET `/ai/usage` | Tenant token/cost usage vs quota | `ai:read` (Owner) | — |
| GET `/ai/settings` · PATCH | Enable/disable, output language pref | `ai:configure` (tenant subset) | audited |
| (drafts) | Draft generation/edit/approve live under `/daily-reports` (§2.7) — AI has no parent-facing endpoints | | |

### 2.15 Audit (`/audit-log`) — RL-C

| Method + Path | Description | Perm |
|---|---|---|
| GET `/audit-log?filter[entity_type]=&filter[actor_id]=&filter[range]=` | Read-only, role-scoped subsets (RBAC §6) | `audit:read` |
| POST `/audit-log/exports` | Async export | `audit:export` (SEC-DATA-001) |

### 2.16 Subscription & Feature Flags (`/subscription`, `/feature-flags`) — RL-B

| Method + Path | Description | Perm |
|---|---|---|
| GET `/subscription` | Plan, quotas, usage (storage, AI, capacity) | `subscription:read` |
| GET `/feature-flags` | Resolved flags for tenant | `organization:read` |

### 2.17 Super Admin — Platform Plane (`/platform/*`) — separate OpenAPI tag, SUPER_ADMIN/SYSTEM only

| Method + Path | Description | Perm | Audit |
|---|---|---|---|
| POST `/platform/tenants` | Provision tenant (idempotent workflow, SAD §4.3) | `platform:tenant:create` | audited |
| GET `/platform/tenants?filter[status]=` · GET `…/{id}` | Tenant registry + health | `platform:tenant:read` | — |
| POST `/platform/tenants/{id}/suspend` · `/reactivate` · `/request-deletion` | Lifecycle ops | `platform:tenant:update` | SEC-PLAT-002 |
| PATCH `/platform/tenants/{id}/subscription` | Plan change, quota override | `platform:subscription:update` | audited |
| POST `/platform/break-glass` | Request time-boxed tenant access `{tenant_id, reason, duration≤4h}` | `breakglass:request` | SEC-PLAT-001 + owner notify |
| GET `/platform/break-glass/{id}` · POST `…/close` | Grant status / early close | `breakglass:request` | SEC-PLAT-001 |
| CRUD `/platform/feature-flags` | Global + per-tenant overrides | `platform:flags:*` | audited |
| GET `/platform/health` | Aggregated ops dashboard feed | `platform:read` | — |
| POST `/platform/tenants/{id}/exports` | Offboarding export (SAD §4.3) | `platform:export` | SEC-DATA-001 |

Catalog size: **~120 endpoints**. Every endpoint maps to exactly one permission code; the RBAC §3 matrix governs role access — any discrepancy is a spec bug.

---
# 3. DTO Catalog

## 3.1 Conventions

| Rule | Standard |
|------|----------|
| Naming | `{Resource}{Action}Request` / `{Resource}Response` / `{Resource}SummaryResponse` (list rows) / role variants `{Resource}Response.Parent` etc. per FL rules |
| Nullability | Explicit: every field `required`, `optional`, or `nullable` in OpenAPI; no implicit nulls; absent ≠ null in PATCH (JSON Merge Patch semantics — null clears, absent ignores) |
| Enums | Closed string enums mirroring DB enums (Domain Part 8); unknown enum values from server → clients must render fallback (forward compatibility) |
| Versioning | DTOs additive-only within v1; removal/retype = breaking (§10); response fields never repurposed |
| Validation | Declared per field in OpenAPI (`minLength`, `pattern`, `format`); business validation errors use §4 codes with `errors[]` pointers (JSON Pointer) |

## 3.2 Exemplar DTOs (normative patterns — full catalog generated into OpenAPI §8)

**AttendanceEventCreateRequest**
```json
{
  "child_id": "uuid (required)",
  "direction": "CHECK_IN | CHECK_OUT (required)",
  "pickup_person_id": "uuid (required when CHECK_OUT; from authorized_pickups)",
  "client_event_id": "uuidv7 (required; idempotent identity)",
  "device_recorded_at": "ISO-8601 (required)",
  "note": "string ≤500 (optional)"
}
```
Validation: pickup_person mandatory on CHECK_OUT (`VAL_PICKUP_PERSON_REQUIRED`); device time within ±24 h of server (`SYNC_CLOCK_SKEW`).

**InvoiceResponse** (accountant/owner variant)
```json
{
  "id": "uuid", "number": "INV-2026-000123", "status": "ISSUED",
  "child": { "id": "uuid", "full_name": "…" },
  "cycle": "2026-07", "issued_at": "…", "due_date": "…",
  "currency": "EGP", "subtotal_minor": 250000, "discount_minor": 25000,
  "total_minor": 225000, "paid_minor": 100000, "balance_minor": 125000,
  "lines": [ { "type": "TUITION", "description": {"ar":"…","en":"…"},
               "amount_minor": 250000, "snapshot": { "fee_plan_id": "…", "component_id": "…" } } ],
  "version": 3
}
```
Receptionist variant (FL-03): `id, number, status, due_date, total_minor, balance_minor` only.

**DailyReportResponse.Parent** — published reports only: report content (LocalizedText), activities summary, media (consent-filtered signed URLs), `published_at`; excludes: draft internals, AI metadata (FL-10), teacher notes.

**ChildCreateRequest** — profile (names ar/en, dob, classroom_id) + `guardians[]` (≥1 with `is_primary: true`, phone E.164) + optional medical entries + consents; atomic; errors as `errors[]` with JSON Pointers.

**PaymentCreateRequest** — `guardian_id, amount_minor, currency, method (CASH|BANK_TRANSFER|CHEQUE|OTHER), received_at, allocations[]{invoice_id, amount_minor}, reference?`; Σ allocations ≤ amount; over-remainder → credit.

**Error envelope (§4)** and **paginated list envelope** (`data[] + meta{next_cursor, limit}`) are shared schemas referenced by every endpoint.

---

# 4. Error Catalog (RFC 7807)

Shape: `{ "type": "https://docs.kinderflow.app/errors/{code}", "title": "…", "status": 422, "code": "…", "detail": "localized message", "errors": [{"pointer": "/field", "code": "…", "message": "…"}], "trace_id": "…" }`

| HTTP | Code | Meaning |
|------|------|---------|
| 400 | `REQUEST_MALFORMED` | Unparseable body/query |
| 401 | `AUTH_REQUIRED` · `AUTH_TOKEN_EXPIRED` · `AUTH_TOKEN_INVALID` · `AUTH_SESSION_REVOKED` | Authentication failures |
| 401 | `AUTH_INVALID_CREDENTIALS` · `AUTH_RESET_TOKEN_INVALID` · `AUTH_INVITE_EXPIRED` | Credential flows |
| 403 | `PERMISSION_DENIED` (SEC-PERM-002) · `SCOPE_DENIED` · `TENANT_SUSPENDED` · `MFA_REQUIRED` | Authorization |
| 403 | `PICKUP_NOT_AUTHORIZED` (SEC-SAFE-001) · `CONSENT_REQUIRED` (BR-19) · `AUTH_ACCOUNT_LOCKED` | Domain-security |
| 404 | `RESOURCE_NOT_FOUND` | Also returned for cross-tenant IDs (no existence leak) |
| 409 | `VERSION_CONFLICT` (If-Match) · `DUPLICATE_RESOURCE` · `ATTENDANCE_SEQUENCE_CONFLICT` (BR-11) · `STATE_TRANSITION_INVALID` | Conflicts |
| 422 | `VALIDATION_FAILED` (+`errors[]`) · `VAL_PICKUP_PERSON_REQUIRED` · `LAST_PRIMARY_GUARDIAN` (BR-04) · `CLASSROOM_CAPACITY_EXCEEDED` (BR-02) · `AGE_RANGE_VIOLATION` (BR-03) | Validation/business |
| 422 | `INVOICE_IMMUTABLE` (BR-08) · `ALLOCATION_EXCEEDS_BALANCE` (BR-09) · `MED_AUTH_INVALID` · `REPORT_ALREADY_APPROVED` (FL-07) · `BRANCH_NOT_EMPTY` · `CLASSROOM_HAS_CHILDREN` · `CONVERSATION_NOT_ALLOWED` | Business rules |
| 402/422 | `SUBSCRIPTION_LIMIT_REACHED` (BR-22) · `STORAGE_QUOTA_EXCEEDED` (BR-21) · `AI_QUOTA_EXCEEDED` | Plan limits |
| 409 | `SYNC_DUPLICATE` · `SYNC_CONFLICT_PENDING_REVIEW` · `SYNC_CLOCK_SKEW` | Offline sync (§5) |
| 415/422 | `MEDIA_TYPE_UNSUPPORTED` · `MEDIA_TOO_LARGE` · `MEDIA_QUARANTINED` | Media pipeline |
| 429 | `RATE_LIMITED` (+`Retry-After`) | All tiers |
| 502/503 | `AI_PROVIDER_UNAVAILABLE` (fallback engaged) · `STORAGE_UNAVAILABLE` · `SERVICE_UNAVAILABLE` | Upstream/infra |
| 500 | `INTERNAL_ERROR` | Generic, trace_id always present |

Rules: codes are stable API contract (documented per endpoint in OpenAPI); `detail` localized via Accept-Language; no stack traces or internals ever; 404-for-cross-tenant is mandatory (tripwire SEC-PERM-003 fires internally).

---

# 5. Offline Sync API (attendance + activities)

| Element | Contract |
|---------|----------|
| Queue semantics | Client (PWA service worker) queues events with client-generated UUIDv7 `client_event_id` + `device_recorded_at`; queue survives restarts; max age 24 h (NFR) |
| Sync endpoint | `POST /attendance-events/sync` (and `/activity-entries/sync`): `{ device_id, device_time, events[] (≤200) }` + `Idempotency-Key` per batch |
| Replay protection | Batch idempotency key + per-event `client_event_id` unique constraint — resubmission returns identical per-event results (`SYNC_DUPLICATE` marked, not errored) |
| Conflict detection | Server validates per event: authorization (BR-01, fresh), sequence (BR-11), clock skew (device_time vs server ±ε), duplicate window (±2 min same direction collapsed) |
| Conflict resolution | Deterministic server policy: server time authoritative; sequence conflicts → event stored `sync_status=pending_review` + surfaced in BM queue; unauthorized offline check-out → stored + flagged + SEC-SAFE-001 — **never silently dropped, never silently accepted** |
| Response | Per-event: `{ client_event_id, result: APPLIED \| DUPLICATE \| PENDING_REVIEW \| REJECTED, server_event_id?, code? }` |
| Sync tokens | `GET /sync/state?since=<sync_token>` returns changed rosters/pickup lists/settings for offline caches; token is server-issued opaque watermark; full refresh on token expiry (7 days) |
| Retry | Client exponential backoff; batch is safe to retry unlimited times (idempotent); partial application impossible to duplicate |

---

# 6. Webhooks (Phase 2 activation; contract designed now)

| Element | Design |
|---------|--------|
| Registration | `POST /webhooks` (tenant, Owner-only): url (HTTPS), events[], secret auto-generated |
| Events | `invoice.paid` · `attendance.recorded` · `child.checked_out` · `report.approved` · `subscription.updated` · `media.uploaded` — payload = event envelope `{id, type, occurred_at, tenant_id, data{…}, version}` mirroring domain events (Domain §1.5) |
| Delivery | At-least-once from outbox via `notifications` worker; HMAC-SHA256 signature header (`X-KF-Signature: t=…,v1=…`, timestamp-bound ±5 min replay window); 10 s timeout; retries 8× exponential; auto-disable after 72 h failing + owner notification |
| Consumer guidance | Verify signature, respond 2xx fast, process async, dedupe by event id |

---

# 7. API Security (binding to RBAC doc)

Request pipeline = RBAC §2.2 exactly: session (jti) → tenant context (tid → RLS var) → permission code → scope → policy/field rules → RLS backstop. Additional API-layer specifics: Bearer JWT only (no API keys at MVP); refresh via httpOnly cookie confined to `/auth/refresh` path; CSRF double-submit on cookie flows; `ver` claim staleness check per request; correlation/trace IDs propagated into audit entries; webhook HMAC + timestamp replay window; idempotency keys namespaced per user+endpoint (no cross-user replay); 404-not-403 for cross-tenant probes.

---

# 8. OpenAPI 3.1 Structure

| Element | Plan |
|---------|------|
| Layout | Single `openapi.yaml` root + `$ref` split: `paths/{module}.yaml`, `components/schemas/{module}.yaml`, `components/{parameters,responses,securitySchemes}.yaml` |
| Info/servers | title, version (semver, independent of URI major), servers: prod/staging |
| Tags | One per module (§2.1–2.17) + `platform` isolated; tag descriptions link to this document's sections |
| Security schemes | `bearerJwt` (http bearer); applied globally; `public` endpoints override with `security: []` |
| Shared components | `ProblemDetails`, `PaginatedMeta`, `Money`, `LocalizedText`, `IdempotencyKeyHeader`, `IfMatchHeader`, `RateLimitHeaders`, per-role DTO variants as named schemas |
| Extensions | `x-permission-code` (per operation — generator asserts guard parity), `x-rate-limit-tier`, `x-audit-events`, `x-idempotency: required\|optional` |
| Generation flow | Spec-first authoring in implementation phase; NestJS decorators must produce a spec that CI diffs against this contract — divergence fails build (SAD §8.1) |
| Docs publishing | Redoc-rendered per environment; changelog generated from spec diffs |

# 9. Postman Collection Design

| Element | Plan |
|---------|------|
| Folders | Mirror §2 modules; `00 Auth` first (login/refresh flows); `99 Platform` separate collection (SUPER_ADMIN creds never in tenant workspaces) |
| Variables | `{{base_url}}`, `{{access_token}}`, `{{tenant_slug}}`, resource id chain vars (`{{child_id}}`, `{{invoice_id}}`) set by test scripts |
| Environments | `local`, `staging` (prod intentionally absent — no prod poking) |
| Auth | Collection-level Bearer from `{{access_token}}`; pre-request script auto-refreshes via `/auth/refresh` when expired |
| Tests | Per request: status assertion, schema validation (bundled OpenAPI), envelope checks; flow suites: Admission→Check-in→Activity→Report→Invoice→Payment happy path; RBAC suite: each role's token against forbidden endpoints expecting 403/404 |
| Generation | Collection generated from OpenAPI in CI — never hand-maintained |

# 10. API Governance

| Policy | Rule |
|--------|------|
| Versioning | URI major (`/v1`); additive changes anytime (new endpoints/fields/enum values); clients must tolerate unknown fields/enums |
| Breaking changes | Removal/rename/retype/semantic change/required-field addition → new major only; CI spec-diff gate blocks accidental breaks (SAD §8.1) |
| Deprecation | `Deprecation`+`Sunset` headers ≥6 months before removal; deprecated ops flagged in OpenAPI + changelog + tenant-owner notice for webhook/API consumers |
| Documentation | No endpoint merges without: OpenAPI entry, permission code (`x-permission-code`), error list, audit events, example pair, DTO schemas; PR template enforces |
| Review checklist (per endpoint PR) | Permission code exists in RBAC matrix? · Scope rules stated? · Idempotency classified? · Rate tier assigned? · Errors from §4 only (new codes need catalog PR)? · Audit events mapped? · DTO variants respect FL rules? · Cursor pagination on lists? · If-Match on mutable aggregates? |

---

## Readiness Score

**91 / 100** — Deductions: DTO catalog is exemplar-normative rather than exhaustive until OpenAPI authoring (−4, deliberate: full field lists belong in the machine-readable spec); webhook contract designed but unactivated at MVP (−2); rate-limit tier numbers need load-test calibration (−3).

## Approval Checklist

| Item | Owner | Status |
|------|-------|--------|
| API standards incl. idempotency & concurrency (§1) | Tech Lead | ☐ |
| Endpoint catalog — permission parity with RBAC §3 (§2) | Tech Lead + Founder (parent/teacher surface) | ☐ |
| DTO conventions & exemplars (§3) | Tech Lead | ☐ |
| Error catalog codes (§4) | Tech Lead | ☐ |
| Offline sync contract (§5) | Tech Lead + Founder (gate ops policy) | ☐ |
| Webhook contract (§6) | Tech Lead | ☐ |
| OpenAPI/Postman/governance (§8–10) | Tech Lead | ☐ |

## Next Recommended Phase

**Phase 6 — UI/UX Enterprise Design System** (`docs/06_UI_UX`): design tokens and RTL-first layout system, component inventory (shadcn/ui mapping), role-based information architecture (Owner web console, Teacher PWA, Parent PWA, Receptionist gate mode), critical flows (check-in ≤10 s, ≤5-tap logging, report approval, invoice run), accessibility (WCAG 2.1 AA) and Arabic typography standards. The API contract's DTO variants and error codes are the data layer this design system will render.

