# Permission code derivation

| Field            | Value                                                                           |
| ---------------- | ------------------------------------------------------------------------------- |
| Task             | `KF-S0-CONTRACT-001`                                                            |
| Subject          | `src/permissions.ts` — 107 codes across 34 resource tokens                      |
| Primary source   | **API Contract §2**, `Perm` column                                              |
| Secondary source | **RBAC §3** matrix, used to expand `resource:*` wildcards and to find residue   |
| Rule             | Every code is transcribed verbatim. Nothing is renamed, normalised or invented. |

This table exists so a reviewer can check the map against the approved documents **without re-deriving anything**. It is part of the deliverable, not documentation garnish: `permissions.ts` is the one file in this package that cannot be eyeballed for correctness.

---

## Why transcription and not derivation

RBAC §2.4 says the codes are `{resource}:{action}` and names the eight actions plus four specials. It does **not** list the codes. API Contract §2 does — a `Perm` column on almost every endpoint row — and RBAC §2.4 points at it: _"The Phase 5 API contract maps every endpoint to exactly one code."_

Deriving the vocabulary from the §3 matrix instead would have produced codes that contradict the contract, because the resource token is **not** mechanically the path segment or the matrix row label:

| Matrix row / path                  | A derivation would give       | The contract says                               |
| ---------------------------------- | ----------------------------- | ----------------------------------------------- |
| `/children/{id}/medical-records`   | `medical-record:*`            | **`medical:*`**                                 |
| `/children/{id}/documents`         | `child-document:*`            | **`document:*`**                                |
| Medication authorizations          | `medication-authorization:*`  | **`med-auth:*`**                                |
| Medication administrations         | `medication-administration:*` | **`med-admin:*`**                               |
| Tenant settings                    | `setting:read`                | **`settings:read`** (plural — a real exception) |
| Fee plans / components / discounts | three tokens                  | **`fee-plan:*`** only                           |

Six contradictions in the one file whose entire job is to be the contract.

## Naming rules, observed rather than chosen

| Rule                                | Evidence                                                             |
| ----------------------------------- | -------------------------------------------------------------------- |
| Singular resource token             | `child:read`, `invoice:issue`, `payment:create`                      |
| lowercase kebab-case for multi-word | `role-assignment:create`, `credit-note:create`, `fee-plan:*`         |
| Abbreviations stay as written       | `med-auth`, `med-admin`                                              |
| `settings` is plural                | §2.2 `settings:read/update`                                          |
| Scope never appears in a code       | RBAC §2.3 / §2.4; superscripts ᵀ ᴮ ᶜ ᴼ are a separate pipeline stage |

## Wildcard expansion

Where §2 writes `resource:*`, the expansion is that resource's letters in the §3 matrix — C→create, R→read, U→update, D→delete, A→approve, E→export, Rs→restore, Ar→archive. A code exists if **any** role holds the letter.

| Wildcard                   | §3 row                             | Letters      | Codes emitted                          |
| -------------------------- | ---------------------------------- | ------------ | -------------------------------------- |
| `classroom:*` (§2.3)       | Classrooms                         | C R U Ar     | create, read, update, archive          |
| `guardian:*` (§2.5)        | Guardians                          | C R U        | create, read, update                   |
| `pickup:*` (§2.5)          | Authorized pickups                 | C R U D · A  | create, read, update, delete, approve  |
| `medical:*` (§2.5)         | Medical records                    | C R U        | create, read, update                   |
| `document:*` (§2.5)        | Child documents                    | C R U D E    | create, read, update, delete, export   |
| `fee-plan:*` (§2.11)       | Fee plans / components / discounts | C R U Ar · A | create, read, update, archive, approve |
| `fee-assignment:*` (§2.11) | Fee assignments                    | C R U        | create, read, update                   |
| `message:*` (§2.12)        | Conversations & messages           | C R          | create, read                           |
| `announcement:*` (§2.12)   | Announcements                      | C R U D · A  | create, read, update, delete, approve  |
| `platform:flags:*` (§2.17) | Feature flags (SUPER_ADMIN)        | C R U D      | create, read, update, delete           |

---

## Part A — transcribed codes, by §2 subsection

### §2.1 Authentication

Most `/auth` rows carry `public`, `public (cookie)`, `any authenticated` or `any` in the `Perm` column — declarations of _no code_, not codes. They appear in the spec as the sentinels `public` and `authenticated` (see `openapi.yaml` header).

| Code          | §2 row                                                                            |
| ------------- | --------------------------------------------------------------------------------- |
| `user:update` | POST `/auth/mfa/enroll` · POST `/auth/mfa/verify` — `Perm` = `user:update` (self) |

### §2.2 Organization & Settings

| Code                  | §2 row                                               |
| --------------------- | ---------------------------------------------------- |
| `organization:read`   | GET `/organization`; also §2.16 GET `/feature-flags` |
| `organization:update` | PATCH `/organization`                                |
| `settings:read`       | GET `/settings`                                      |
| `settings:update`     | PATCH `/settings`                                    |

### §2.3 Branches & Classrooms

| Code                | §2 row                                              |
| ------------------- | --------------------------------------------------- |
| `branch:create`     | POST `/branches`                                    |
| `branch:read`       | GET `/branches`, GET `/branches/{id}`               |
| `branch:update`     | PATCH `/branches/{id}`                              |
| `branch:archive`    | POST `/branches/{id}/archive`                       |
| `classroom:create`  | POST `/classrooms`                                  |
| `classroom:read`    | GET `/classrooms`, GET `/classrooms/{id}/roster`    |
| `classroom:update`  | PATCH `/classrooms/{id}` — via `classroom:*`        |
| `classroom:archive` | POST `/classrooms/{id}/archive` — via `classroom:*` |

### §2.4 Users, Roles & Permissions

| Code                     | §2 row                                        |
| ------------------------ | --------------------------------------------- |
| `user:create`            | POST `/users/invite`                          |
| `user:read`              | GET `/users`, GET `/users/{id}`               |
| `user:update`            | PATCH `/users/{id}`, `/users/{id}/sessions`   |
| `user:delete`            | POST `/users/{id}/deactivate`                 |
| `user:restore`           | POST `/users/{id}/reactivate`                 |
| `role:read`              | GET `/roles`                                  |
| `role-assignment:create` | POST `/users/{id}/roles`                      |
| `role-assignment:delete` | DELETE `/users/{id}/roles/{roleAssignmentId}` |

`role` has no row in the §3 matrix — `/roles` is reference data. The code is transcribed from §2 regardless; §2 is primary.

### §2.5 Children & Families

| Code                                                                                            | §2 row                                                                 |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `child:create`                                                                                  | POST `/children`                                                       |
| `child:read`                                                                                    | GET `/children`, GET `/children/{id}`                                  |
| `child:update`                                                                                  | PATCH `/children/{id}`                                                 |
| `child:archive`                                                                                 | POST `/children/{id}/withdraw`                                         |
| `guardian:create` · `guardian:read` · `guardian:update`                                         | `/children/{id}/guardians` (`guardian:*`); GET/PATCH `/guardians/{id}` |
| `pickup:create` · `pickup:read` · `pickup:update` · `pickup:delete`                             | `/children/{id}/authorized-pickups` (`pickup:*` per matrix)            |
| `pickup:approve`                                                                                | POST `…/authorized-pickups/{pickupId}/approve`                         |
| `medical:create` · `medical:read` · `medical:update`                                            | `/children/{id}/medical-records` (`medical:*`)                         |
| `consent:read`                                                                                  | GET `/children/{id}/consents`                                          |
| `consent:update`                                                                                | PUT `/children/{id}/consents`                                          |
| `document:create` · `document:read` · `document:update` · `document:delete` · `document:export` | `/children/{id}/documents` (`document:*`)                              |

### §2.6 Attendance

| Code                 | §2 row                                                                              |
| -------------------- | ----------------------------------------------------------------------------------- |
| `attendance:create`  | POST `/attendance-events`, POST `/attendance-events/sync`                           |
| `attendance:read`    | GET `/attendance-days`, `/children/{id}/attendance-days`, `/branches/{id}/presence` |
| `attendance:amend`   | POST `/attendance-days/{id}/amendments` — RBAC §2.4 named special                   |
| `attendance:approve` | POST `/attendance-amendments/{id}/approve`                                          |

The §2.6 cell reads `attendance:amend / request`. "Request" is the §3 _Attendance amendments_ `C` letter held by TEACHER and RECEPTIONIST "(request only)" — a scope-and-workflow distinction on the same code, **not** a fifth code.

### §2.7 Activities & Daily Reports

| Code              | §2 row                                                   |
| ----------------- | -------------------------------------------------------- |
| `activity:create` | POST `/activity-entries`, POST `/activity-entries/batch` |
| `activity:read`   | GET `/classrooms/{id}/activity-entries`                  |
| `activity:update` | PATCH `/activity-entries/{id}`                           |
| `activity:delete` | DELETE `/activity-entries/{id}` — **see Part C**         |
| `report:read`     | GET `/daily-reports`, GET `/children/{id}/daily-reports` |
| `report:update`   | PATCH `/daily-reports/{id}`, POST `…/request-draft`      |
| `report:approve`  | POST `/daily-reports/{id}/approve`, POST `…/reject`      |

### §2.8 Medication

| Code               | §2 row                                          |
| ------------------ | ----------------------------------------------- |
| `med-auth:create`  | POST `/children/{id}/medication-authorizations` |
| `med-auth:read`    | GET `…/medication-authorizations`               |
| `med-auth:approve` | POST `…/{authId}/approve`                       |
| `med-admin:create` | POST `/medication-administrations`              |
| `med-admin:read`   | GET `/children/{id}/medication-administrations` |

### §2.9 Incidents

| Code               | §2 row                                                                      |
| ------------------ | --------------------------------------------------------------------------- |
| `incident:create`  | POST `/incidents`                                                           |
| `incident:read`    | GET `/incidents`, GET `/incidents/{id}`, POST `/incidents/{id}/acknowledge` |
| `incident:update`  | PATCH `/incidents/{id}`                                                     |
| `incident:approve` | POST `/incidents/{id}/approve`                                              |

### §2.10 Media

| Code           | §2 row                                                     |
| -------------- | ---------------------------------------------------------- |
| `media:create` | POST `/media/uploads`, POST `/media/uploads/{id}/complete` |
| `media:read`   | GET `/media/{id}`                                          |
| `media:delete` | DELETE `/media/{id}`                                       |

### §2.11 Billing

| Code                                                                                              | §2 row                                                                              |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `fee-plan:create` · `fee-plan:read` · `fee-plan:update` · `fee-plan:archive` · `fee-plan:approve` | CRUD `/fee-plans` + `/fee-plans/{id}/archive` (`fee-plan:*`)                        |
| `fee-assignment:create` · `fee-assignment:read` · `fee-assignment:update`                         | POST/PATCH `/children/{id}/fee-assignment` (`fee-assignment:*`)                     |
| `invoice:create`                                                                                  | POST `/invoices/generate-cycle`                                                     |
| `invoice:read`                                                                                    | GET `/invoices`, GET `/invoices/{id}`, GET `/guardians/{id}/balance`                |
| `invoice:update`                                                                                  | PATCH `/invoices/{id}`                                                              |
| `invoice:issue`                                                                                   | POST `/invoices/{id}/issue`, POST `/invoices/issue-batch` — RBAC §2.4 named special |
| `payment:create`                                                                                  | POST `/payments`                                                                    |
| `payment:read`                                                                                    | GET `/payments`, GET `/payments/{id}`                                               |
| `credit-note:create`                                                                              | POST `/credit-notes`                                                                |

### §2.12 Communication

| Code                                                                                                                 | §2 row                                                                                          |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `message:create` · `message:read`                                                                                    | `/conversations`, `/conversations/{id}/messages` (`message:*`); `/escalate` uses `message:read` |
| `announcement:create` · `announcement:read` · `announcement:update` · `announcement:delete` · `announcement:approve` | CRUD `/announcements` + `/publish` (`announcement:*`)                                           |
| `notification:read`                                                                                                  | GET `/notifications`, POST `/notifications/mark-read`                                           |
| `notification:update`                                                                                                | PUT `/notification-preferences`                                                                 |

`/announcements/{id}/publish` maps to `announcement:approve`: §2.12 describes the flow as "Draft→approve→publish (teacher drafts, BM approves)" and the §3 letter is `A`. There is no `announcement:publish`; the only `publish` special RBAC §2.4 names is `report:publish` — see Part B.

### §2.13–§2.16 Analytics, AI, Audit, Subscription

| Code                | §2 row                                                                   |
| ------------------- | ------------------------------------------------------------------------ |
| `analytics:read`    | GET `/analytics/overview`, `/aging`, `/attendance-trends`, `/engagement` |
| `analytics:export`  | POST `/analytics/exports`                                                |
| `ai:read`           | GET `/ai/usage`                                                          |
| `ai:configure`      | GET/PATCH `/ai/settings` — **see Part C**                                |
| `audit:read`        | GET `/audit-log`                                                         |
| `audit:export`      | POST `/audit-log/exports`                                                |
| `subscription:read` | GET `/subscription`                                                      |

### §2.17 Super Admin — Platform Plane

| Code                                                                                                | §2 row                                                                               |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `platform:tenant:create`                                                                            | POST `/platform/tenants`                                                             |
| `platform:tenant:read`                                                                              | GET `/platform/tenants`, GET `…/{id}`                                                |
| `platform:tenant:update`                                                                            | POST `…/suspend`, `…/reactivate`, `…/request-deletion`                               |
| `platform:subscription:update`                                                                      | PATCH `/platform/tenants/{id}/subscription`                                          |
| `platform:flags:create` · `platform:flags:read` · `platform:flags:update` · `platform:flags:delete` | CRUD `/platform/feature-flags` (`platform:flags:*`)                                  |
| `platform:read`                                                                                     | GET `/platform/health`                                                               |
| `platform:export`                                                                                   | POST `/platform/tenants/{id}/exports`                                                |
| `breakglass:request`                                                                                | POST `/platform/break-glass`, GET `…/{id}`, POST `…/close` — RBAC §2.4 named special |

**These are three-segment codes.** RBAC §2.4 defines `{resource}:{action}`; the platform plane does not obey it. Both are approved content and the transcription rule forbids normalising one into the other. Registered as **DISC-014**.

---

## Part B — residue: letters in RBAC §3, no endpoint in §2

**None of these is in `permissions.ts`.** Each is registered under **DISC-015** with the code that would follow the naming rules, to be approved before it appears. A code invented here becomes a permission row in the database (`KF-S0-API-003` AC3) and a guard in the API, backed by no specification.

| §3 row                          | Letters with no §2 endpoint             | Code that would follow the rules                 |
| ------------------------------- | --------------------------------------- | ------------------------------------------------ |
| Children (profiles)             | D, Rs                                   | `child:delete`, `child:restore`                  |
| Consents                        | C (RECEPTIONIST), E (OWNER)             | `consent:create`, `consent:export`               |
| Attendance days/events          | E (OWNER)                               | `attendance:export`                              |
| Daily reports                   | E (OWNER)                               | `report:export`                                  |
| Incidents                       | E (OWNER)                               | `incident:export`                                |
| Invoices                        | E (OWNER), A (manual discount)          | `invoice:export`, `invoice:approve`              |
| Payments                        | E (OWNER)                               | `payment:export`                                 |
| Credit notes                    | R, A                                    | `credit-note:read`, `credit-note:approve`        |
| Role assignments                | R, U                                    | `role-assignment:read`, `role-assignment:update` |
| **Staff members & assignments** | C R U D Ar — **no §2 endpoints at all** | `staff:create/read/update/delete/archive`        |
| Tenant exports                  | C R ᵀ · A (tenant side)                 | `tenant-export:create/read/approve`              |
| Break-glass grants              | R (OWNER, notified)                     | `breakglass:read`                                |
| Subscription & plan             | C U (platform plane)                    | covered by `platform:subscription:update`        |
| Feature flags                   | R ᵀ (tenant own overrides)              | covered by `organization:read` at §2.16          |

`report:publish` is a fourth case: RBAC §2.4 names it as one of the four specials, and **no §2 row uses it**. §2.7 maps approval-and-publish to `report:approve`. Registered with DISC-015.

---

## Part C — reverse discrepancies: code in §2, no letter in §3

API Contract §2's closing line says "any discrepancy is a spec bug". Two exist. Both are transcribed as written, because §2 is primary; both are registered.

| Code              | Problem                                                                                                                                                                                                      | Register |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| `activity:delete` | §2.7 DELETE `/activity-entries/{id}` carries `activity:update/delete`, but the §3 _Activity entries_ row holds only `C R U` — **no role holds `D`**. As written, the code exists and nobody can ever use it. | DISC-015 |
| `ai:configure`    | `configure` is not one of RBAC §2.4's eight actions or four specials. The §3 _AI configuration & quotas_ row holds `R U`, which would give `ai:update`.                                                      | DISC-014 |

---

## Counts

| Measure                                   | Value                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| Codes in `permissions.ts`                 | **107**                                                                  |
| Resource tokens                           | **34**                                                                   |
| Two-segment codes                         | 99                                                                       |
| Three-segment (`platform:*`) codes        | 8 — `platform:read` and `platform:export` are ordinary two-segment codes |
| Residue registered, not added (DISC-015)  | 20                                                                       |
| Reverse discrepancies registered (Part C) | 2                                                                        |

The contracts test asserts this count against `ALL_PERMISSIONS.length`, so the table and the map cannot drift apart silently.
