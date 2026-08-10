# 05 — Sprint 1: Identity & Tenancy (Detailed Task Specifications)

| Field | Value |
|-------|-------|
| Sprint goal | Authenticated, tenant-scoped, permission-guarded access — the substrate every later sprint builds on |
| Entry criteria | Sprint 0 exit checklist green; **ADR-010 merged** (no DB task may start otherwise) |
| Exit criteria | Login→refresh→logout lifecycle with session revocation; RBAC guard pipeline enforcing one permission code per endpoint; tenant provisioning <5 min; isolation suite covering every shipped endpoint; auth/permission audit events flowing |
| Authority | Blueprint §6 (S1); RBAC §1–§3, §6–§7; API Contract §2.1–§2.4, §7; Domain Model Part 2.1–2.2, Part 3 (tables 1–14), Part 6; SAD §5 |

## Inherited Defaults (apply to every task below unless overridden)

- **Source of Truth (baseline):** ADR-010 (tenant context), Domain Model Part 6 (RLS classes), API Contract §1 (standards), RBAC §2.2 (evaluation order), `15_Definition_of_Done.md`.
- **Security (baseline):** tenant context from JWT only; fail-closed on missing context; every mutation audited per RBAC §6; input validated at edge + domain.
- **Testing (baseline):** unit (domain), integration (Testcontainers), contract (OpenAPI diff), isolation (cross-tenant 404 + SQL probe), negative RBAC tests per role.
- **DoD (baseline):** the universal 17-point checklist.

---

### KF-S1-TENANT-001 — Migration M-002: tenancy core tables
**Objective** Create organizations, branches, classrooms, subscriptions, tenant_settings with isolation.
**Source of Truth** Domain Model Part 3 (tables 1,2,3,5,7), Part 5 (standards), Part 6.2; Blueprint §4 M-002.
**Dependencies** KF-S0-API-003, KF-S0-CI-003.
**Files/Areas** `apps/api/prisma/`, model manifest.
**Implementation** Tables per catalog with UUIDv7 PKs, `version` columns on all five, soft delete on organizations/branches/classrooms, `updated_at` triggers; hand-SQL block: RLS policies (`SELF_TENANT_ROOT` for organizations, `TENANT_STANDARD` elsewhere), `FORCE ROW LEVEL SECURITY`, partial unique for one active subscription per tenant, checks (`capacity > 0`, `age_min < age_max`).
**Security** Policy class annotations; `tenant_id` on all but organizations (where `tenant_id = id`).
**Database** Indexes `(tenant_id,status)`, `(tenant_id,branch_id,status)`; FK `branches→organizations`, `classrooms→branches` with RESTRICT.
**Testing** Migration applies clean; linter passes; isolation SQL probes for each table; constraint tests (capacity 0 rejected, second active subscription rejected).
**Acceptance** (1) Given tenant A context, selecting branches returns only A's rows and zero of B's. (2) Inserting a classroom with `age_min >= age_max` is rejected by the DB. (3) A second active subscription for the same organization is rejected by the partial unique index.
**Risk** High · **Cx** L

### KF-S1-TENANT-002 — Organization repository and read/update endpoints
**Objective** `GET /organization`, `PATCH /organization` with optimistic locking.
**Source of Truth** API Contract §2.2; RBAC §3 (Organization row); ADR-010 (repository pattern).
**Dependencies** KF-S1-TENANT-001, KF-S1-IAM-002.
**Implementation** Clean-architecture slice: domain entity + invariants, application use cases, Prisma repository via the ADR-010 tenant transaction, controller with DTOs from `@kf/contracts`.
**API** `GET /organization` perm `organization:read`; `PATCH /organization` perm `organization:update`, requires `If-Match`, errors `VERSION_CONFLICT`, `VALIDATION_FAILED`; audit: settings/profile diff.
**Testing** Version conflict returns 409; RBAC negative (Teacher → 403; cross-tenant id → 404 + tripwire).
**Acceptance** (1) Given an Owner in tenant A, PATCH with a stale `If-Match` returns 409 `VERSION_CONFLICT` and does not modify the row. (2) A Teacher token receives 403 `PERMISSION_DENIED` with no data leakage. (3) **This task is also the ADR-010 comprehension check**: it must be implemented by an engineer other than the spike author, using only ADR-010 (per KF-S0-RLS-002 acceptance).
**Risk** Medium · **Cx** M

### KF-S1-TENANT-003 — Branches CRUD + archive
**Source of Truth** API Contract §2.3; RBAC §3; Domain Model Part 2.1 lifecycle.
**Dependencies** KF-S1-TENANT-002.
**API** `GET/POST /branches`, `GET/PATCH /branches/{id}`, `POST /branches/{id}/archive`; perms `branch:read|create|update|archive`; error `BRANCH_NOT_EMPTY`; audited.
**Implementation** Archive blocked while active classrooms/children exist; branch carries timezone, closing time, grace window (feeds S3 late-pickup rule).
**Testing** Archive with dependents → 422 `BRANCH_NOT_EMPTY`; scope test (BranchManager restricted to own branch).
**Acceptance** (1) Archiving a branch with one active classroom returns 422 with the documented code. (2) A BranchManager scoped to branch 1 receives 404 for branch 2's id.
**Risk** Medium · **Cx** M

### KF-S1-TENANT-004 — Classrooms CRUD + roster endpoint skeleton
**Source of Truth** API Contract §2.3; Domain Model Part 2.1; BRD BR-02/BR-03.
**Dependencies** KF-S1-TENANT-003.
**API** `GET/POST /classrooms`, `GET/PATCH /classrooms/{id}`, `POST /classrooms/{id}/archive`, `GET /classrooms/{id}/roster` (children list empty until S2); perms `classroom:*`; error `CLASSROOM_HAS_CHILDREN`.
**Implementation** Capacity and age-range fields validated; roster returns staff assignments (empty until S1-IAM) and children (S2).
**Acceptance** (1) Creating a classroom with capacity 0 returns 422 with a field pointer. (2) Roster endpoint returns a well-formed empty structure with correct permissions applied.
**Risk** Low · **Cx** M

### KF-S1-TENANT-005 — Tenant settings (locale, timezone, quiet hours, billing day)
**Source of Truth** API Contract §2.2; Domain Model Part 2.1; BRD BR-18 (quiet hours source), D7/D8.
**Dependencies** KF-S1-TENANT-002.
**API** `GET /settings`, `PATCH /settings`; perms `settings:read|update`; audited (security-relevant fields flagged).
**Implementation** Defaults on provisioning: locale `ar-EG`, timezone `Africa/Cairo`, quiet hours, billing cycle day, retention 5 years (D8).
**Acceptance** (1) A newly provisioned tenant has exactly the documented defaults. (2) Changing quiet hours writes an audit entry with before/after values.
**Risk** Low · **Cx** S

### KF-S1-TENANT-006 — Subscription read + plan/quota resolution service
**Source of Truth** Domain Model Part 2.1, Part 3 (tables 4,5); BRD BR-21/BR-22; API Contract §2.16.
**Dependencies** KF-S1-TENANT-001.
**Implementation** Service resolving active plan → limits (capacity, storage, AI tokens, features); `GET /subscription` returns plan + quotas + usage placeholders; quota values seeded with `TODO-F1` markers (DISC-006) — structure final, numbers provisional.
**API** `GET /subscription` perm `subscription:read`.
**Acceptance** (1) Resolution returns plan limits for the tenant's active subscription. (2) With no active subscription the service fails closed (deny) rather than defaulting to unlimited.
**Risk** Medium · **Cx** M

### KF-S1-TENANT-007 — Feature flag resolution (global + tenant override)
**Source of Truth** Domain Model Part 3 (table 6), Part 6.2; API Contract §2.16.
**Dependencies** KF-S1-TENANT-006.
**Implementation** Two-tier resolution with 30–60 s cache and invalidation on change; `GET /feature-flags`.
**Acceptance** (1) A tenant override supersedes the global value. (2) Cache invalidates within one TTL of a change (integration test).
**Risk** Low · **Cx** S

### KF-S1-TENANT-008 — Tenant provisioning workflow (idempotent)
**Objective** Create a fully usable tenant in one operation.
**Source of Truth** SAD §4.3 (provisioning); API Contract §2.17 (`POST /platform/tenants`); Blueprint §6 S1.
**Dependencies** KF-S1-TENANT-005, KF-S1-AUTH-008, KF-S1-IAM-001.
**Implementation** Workflow: organization → owner user (invited) → default role assignments → subscription/plan → tenant settings defaults → seed template data; idempotent by external key; emits `TenantProvisioned`.
**API** `POST /platform/tenants` perm `platform:tenant:create`, `Idempotency-Key` required; audited.
**Testing** Replay with same key returns the original result; partial-failure rollback (transactional where possible, compensating otherwise) leaves no half-tenant.
**Acceptance** (1) Provisioning completes in <5 minutes end-to-end including owner invitation email in Mailpit. (2) Re-running with the same idempotency key creates nothing new and returns the original response. (3) A failure midway leaves no organization row (or a clearly marked failed row that cannot be logged into).
**Risk** High · **Cx** L

---

### KF-S1-AUTH-001 — Migration M-003: users, sessions, tokens, MFA tables
**Source of Truth** Domain Model Part 3 (tables 8,9,10,14), Part 6; RBAC §1.
**Dependencies** KF-S1-TENANT-001.
**Implementation** `users` (tenant nullable for platform staff), `refresh_token_families`, `mfa_enrollments`, `user_roles`; RLS `TENANT_STANDARD` + platform predicate; unique `(tenant_id,email)`.
**Acceptance** (1) Two tenants may each have a user with the same email address. (2) Cross-tenant SQL probe on users returns zero rows.
**Risk** High · **Cx** M

### KF-S1-AUTH-002 — Password hashing and policy service
**Source of Truth** RBAC §1.1; SAD §5.1.
**Dependencies** KF-S1-AUTH-001.
**Implementation** Argon2id with documented parameters; policy: ≥10 chars, breach-list check, no forced rotation; timing-safe verification.
**Testing** Unit: hash/verify, parameter assertions, policy rejections; a known breached password is rejected.
**Acceptance** (1) `password123` and other breach-list entries are rejected with a specific validation code. (2) Verification time does not vary measurably between unknown-user and wrong-password paths.
**Risk** High · **Cx** M

### KF-S1-AUTH-003 — Login use case and endpoint
**Source of Truth** API Contract §2.1; RBAC §1.2 (claims), §7 (SEC-AUTH-001/002).
**Dependencies** KF-S1-AUTH-002, KF-S1-AUTH-004, KF-S1-AUTH-005.
**API** `POST /auth/login` public, RL-A (10/min/IP); errors `AUTH_INVALID_CREDENTIALS`, `AUTH_ACCOUNT_LOCKED`, `TENANT_SUSPENDED`; audit SEC-AUTH-001/002.
**Implementation** Tenant resolved from user record (email unique per tenant → tenant selector strategy documented in the task: login accepts optional tenant slug; ambiguous email across tenants resolves via slug, otherwise returns the generic invalid-credentials error to avoid enumeration).
**Security** No user enumeration in any response or timing; progressive lockout counters in Redis.
**Acceptance** (1) Valid credentials return an access token whose `tid` matches the user's tenant and a rotating refresh cookie (httpOnly, Secure, SameSite=Strict, path-scoped to `/auth/refresh`). (2) Five failed attempts trigger the documented lockout and SEC-AUTH-004. (3) A suspended tenant's user receives `TENANT_SUSPENDED` and no token.
**Risk** Critical · **Cx** L

### KF-S1-AUTH-004 — JWT issuance and verification (RS256, claims contract)
**Source of Truth** RBAC §1.2; SAD §5.1; API Contract §7.
**Dependencies** KF-S1-AUTH-001.
**Implementation** RS256 keypair per environment from secrets; claims `sub,tid,rls,scp,jti,ver`; 15-minute access TTL; key-rotation-ready (kid header); verification middleware.
**Security** Permissions are **not** embedded; `ver` claim compared against the user's current permissions version.
**Acceptance** (1) A token with a stale `ver` is rejected with `AUTH_TOKEN_INVALID` forcing refresh. (2) A tampered signature is rejected. (3) Claims match the RBAC §1.2 contract exactly (contract test).
**Risk** Critical · **Cx** M

### KF-S1-AUTH-005 — Refresh token rotation with reuse detection
**Source of Truth** RBAC §1.1; SAD §5.1; RBAC §7 (SEC-TOKEN-001/002).
**Dependencies** KF-S1-AUTH-004.
**API** `POST /auth/refresh` (cookie), RL-A; error `AUTH_TOKEN_REUSED`.
**Implementation** Token families with rotation; reuse of a rotated token revokes the entire family and all its sessions; device fingerprint recorded.
**Testing** Reuse scenario; concurrent refresh race (only one rotation wins, loser retries safely).
**Acceptance** (1) Presenting a previously rotated refresh token revokes the family, returns `AUTH_TOKEN_REUSED`, emits SEC-TOKEN-002 as critical, and forces re-authentication on all devices in that family. (2) Two simultaneous refreshes do not both succeed with different new tokens.
**Risk** Critical · **Cx** L

### KF-S1-AUTH-006 — Redis session registry and revocation
**Source of Truth** RBAC §1.1; SAD §5.1, §6.1; ADR-005.
**Dependencies** KF-S1-AUTH-004.
**Implementation** `jti` allowlist with TTL; revoke single session, all sessions for a user, all sessions for a tenant; check integrated into the auth guard.
**Acceptance** (1) After logout, the previously valid access token is rejected within one request. (2) Deactivating a user revokes all their sessions immediately (integration test with two active tokens). (3) Suspending a tenant blocks all its users' tokens.
**Risk** Critical · **Cx** M

### KF-S1-AUTH-007 — Logout and session listing/revocation endpoints
**Source of Truth** API Contract §2.1, §2.4; RBAC §3 (Users row).
**Dependencies** KF-S1-AUTH-006.
**API** `POST /auth/logout`; `GET /users/{id}/sessions`; `DELETE /users/{id}/sessions/{jti}` (self or admin per matrix); audit SEC-AUTH-003, SEC-SESS-001.
**Acceptance** (1) A user can list and revoke their own device sessions. (2) A user cannot list another user's sessions unless the matrix grants it (403/404 per contract).
**Risk** Medium · **Cx** S

### KF-S1-AUTH-008 — Invitation flow (staff and parent activation)
**Source of Truth** API Contract §2.1 (`/auth/invitations/accept`), §2.4 (`/users/invite`); RBAC §1.1.
**Dependencies** KF-S1-AUTH-002, KF-S1-IAM-005.
**Implementation** Signed, single-use, expiring invitation links; acceptance sets password and activates the account; role+scope assigned at invite time.
**Security** Token single-use enforced server-side; expiry ≤7 days; no role escalation via the invite payload (role is stored server-side at issue time, not carried in the link).
**Acceptance** (1) An accepted invitation cannot be replayed (`AUTH_INVITE_EXPIRED`). (2) Tampering with the link's role parameter has no effect because the role is not read from the link. (3) The invited user's first login carries the intended role and scope.
**Risk** High · **Cx** M

### KF-S1-AUTH-009 — Password reset flow
**Source of Truth** API Contract §2.1; RBAC §7 (SEC-AUTH-005).
**Dependencies** KF-S1-AUTH-002, KF-S1-AUTH-006.
**API** `POST /auth/password/forgot` (always 202), `POST /auth/password/reset`; RL-A.
**Implementation** Signed one-time token, 15-minute TTL; completion invalidates all sessions and refresh families.
**Acceptance** (1) Requesting reset for a non-existent email returns 202 with no timing or content difference. (2) Completing a reset logs out every existing session. (3) A used reset token returns `AUTH_RESET_TOKEN_INVALID`.
**Risk** High · **Cx** M

---

### KF-S1-IAM-001 — Roles, permissions, and role-permission seed alignment
**Source of Truth** RBAC §2.1, §2.4, §3; Domain Model Part 3 (tables 11–13); `@kf/contracts/permissions`.
**Dependencies** KF-S0-API-003, KF-S0-CONTRACT-001.
**Implementation** Seed the 7 roles and every permission code; role→permission mapping derived directly from the RBAC §3 matrix; a test asserts DB state ≡ contracts map ≡ matrix rows (three-way parity).
**Acceptance** (1) Every permission code in `@kf/contracts` exists in the database and vice versa. (2) Adding a permission to the matrix without updating the seed fails the parity test.
**Risk** High · **Cx** M

### KF-S1-IAM-002 — Guard pipeline (auth → tenant context → permission → scope)
**Objective** Implement RBAC §2.2 evaluation order as framework infrastructure.
**Source of Truth** RBAC §2.2, §2.3; Blueprint §3; ADR-010.
**Dependencies** KF-S1-AUTH-004, KF-S1-AUTH-006, KF-S1-IAM-001.
**Implementation** `JwtAuthGuard` (jti + ver) → `TenantContextInterceptor` (sets ALS + RLS session var) → `PermissionGuard` (`@RequirePermission('code')`, accepts only `@kf/contracts` constants) → `ScopeGuard` (tenant/branch/classroom/own-children resolvers); startup assertion that every registered route declares exactly one permission code and that it matches the OpenAPI `x-permission-code`.
**Security** Fail-closed at each step; denials emit SEC-PERM-002; cross-tenant resource access returns 404 and emits SEC-PERM-003 (critical).
**Testing** Unit per guard; integration for order; a route without a permission decorator must fail application startup.
**Acceptance** (1) Booting the app with a route missing `@RequirePermission` exits non-zero naming the route. (2) A route whose decorator code differs from its OpenAPI `x-permission-code` fails startup. (3) Requesting another tenant's resource id returns 404 and emits SEC-PERM-003 exactly once.
**Risk** Critical · **Cx** L

### KF-S1-IAM-003 — Scope resolvers (branch, classroom, own-children stub)
**Source of Truth** RBAC §2.3; BRD BR-15.
**Dependencies** KF-S1-IAM-002.
**Implementation** Resolvers reading `user_roles` scope bindings; own-children resolver stubbed until S2 (returns empty set, documented) — **must fail closed**, not open.
**Acceptance** (1) A BranchManager with a branch-1 binding cannot read branch-2 resources. (2) The stubbed parent scope denies access rather than allowing it, and the stub is covered by a test that will be updated in S2.
**Risk** High · **Cx** M

### KF-S1-IAM-004 — `GET /auth/me` (identity, roles, scopes, tenant)
**Source of Truth** API Contract §2.1; RBAC §1.2; Design System §06 (nav depends on this payload).
**Dependencies** KF-S1-IAM-003.
**Acceptance** (1) Response contains user, tenant, roles, scopes and drives the frontend navigation tree with no additional call. (2) Cache headers are `no-store`.
**Risk** Low · **Cx** S

### KF-S1-IAM-005 — User invite, list, update, deactivate/reactivate
**Source of Truth** API Contract §2.4; RBAC §3 (Users row).
**Dependencies** KF-S1-IAM-002, KF-S1-AUTH-008.
**API** `GET /users`, `POST /users/invite`, `GET/PATCH /users/{id}`, `POST /users/{id}/deactivate|reactivate`; perms `user:read|create|update|delete|restore`; audited (SEC-PERM-001 when a role is granted at invite).
**Implementation** BranchManager may only manage staff roles below their own (matrix constraint) — enforced in the use case, not the controller.
**Acceptance** (1) A BranchManager attempting to invite an Owner receives 403. (2) Deactivation immediately revokes sessions (assert with an active token). (3) Reactivation does not restore old sessions.
**Risk** High · **Cx** M

### KF-S1-IAM-006 — Role assignment endpoints
**Source of Truth** API Contract §2.4; RBAC §2.3, §7 (SEC-PERM-001).
**Dependencies** KF-S1-IAM-005.
**API** `POST /users/{id}/roles`, `DELETE /users/{id}/roles/{assignmentId}`; perms `role-assignment:create|delete`.
**Implementation** Validates role/scope consistency (teacher→classroom, manager→branch, owner/accountant→tenant); bumps the user's permissions `ver` forcing token refresh.
**Acceptance** (1) Assigning a Teacher role with a branch-level scope is rejected with a validation code. (2) After a role change, the user's existing access token is rejected on the next request due to `ver` mismatch. (3) Every assignment/revocation writes SEC-PERM-001.
**Risk** High · **Cx** M

---

### KF-S1-AUDIT-001 — Wire audit events for identity and tenancy actions
**Source of Truth** RBAC §6 (what is audited), §7 (event catalog); Domain Model Part 7.
**Dependencies** KF-S0-API-004, KF-S1-IAM-006.
**Implementation** Emit the S1-relevant catalog: SEC-AUTH-001…006, SEC-TOKEN-001/002, SEC-SESS-001, SEC-PERM-001/002/003, SEC-PLAT-002; ensure actor/trace/ip enrichment.
**Acceptance** (1) Each listed event is produced by its trigger action in an integration test asserting the exact code. (2) SEC-PERM-003 is emitted exactly once per cross-tenant attempt and is marked critical severity.
**Risk** High · **Cx** M

### KF-S1-AUDIT-002 — Audit log read API (role-scoped subsets)
**Source of Truth** API Contract §2.15; RBAC §6 (who reads what).
**Dependencies** KF-S1-AUDIT-001.
**API** `GET /audit-log` with filters; perm `audit:read`; cursor pagination; RL-C.
**Implementation** Owner: full tenant trail; BranchManager: operational subset for own branch; Accountant: financial subset; no write path exposed.
**Acceptance** (1) An Accountant querying attendance-related audit entries receives none (subset enforced server-side, not by UI). (2) No HTTP verb other than GET exists for audit resources (route table assertion).
**Risk** Medium · **Cx** M

---

### KF-S1-QA-001 — Extend isolation suite to S1 endpoints
**Source of Truth** Blueprint §8; instruction §9; KF-S0-RLS-003.
**Dependencies** All S1 API tasks.
**Implementation** Register every S1 endpoint in the matrix runner; add SQL probes for the five new tenant tables; add the negative RBAC matrix (each role × each S1 endpoint, expected allow/deny from RBAC §3).
**Acceptance** (1) The suite reports 100% coverage of S1 endpoints and tables. (2) Removing a `@RequirePermission` decorator or an RLS policy causes a failure that names the route/table.
**Risk** Critical · **Cx** M

### KF-S1-FE-CON-001 — Console login, app shell, role-based navigation
**Source of Truth** Design System §04 (console shell), §06 (nav trees), §16 (session expiry, permission denied); API Contract §2.1.
**Dependencies** KF-S0-FE-005, KF-S1-IAM-004.
**Implementation** Login page (ar/en), token handling per Blueprint §2 (access in memory, refresh cookie), silent refresh, sidebar/topbar shell, navigation rendered from `/auth/me` roles+scopes — unauthorized routes never rendered and direct navigation shows the 404 page.
**Testing** E2E: login → shell → navigate; expired session → silent refresh → preserved state; RTL and LTR snapshots.
**Acceptance** (1) A Teacher account logging into the console URL is routed to the teacher surface, not the console. (2) An Owner sees exactly the Owner nav items from Design §06; a BranchManager sees exactly theirs. (3) Session expiry triggers silent refresh; if refresh fails, a re-login modal preserves unsaved form state.
**Risk** Medium · **Cx** L

### KF-S1-FE-PLT-001 — Minimal platform console: tenant provisioning
**Source of Truth** API Contract §2.17; Design System §04 (platform shell, distinct topbar), §06.
**Dependencies** KF-S1-TENANT-008, KF-S1-FE-CON-001.
**Implementation** Tenant list + provisioning form; visually distinct platform chrome to prevent tenant/platform confusion.
**Acceptance** (1) A SUPER_ADMIN can provision a tenant end-to-end from the UI in under 5 minutes. (2) The platform surface is visually unmistakable (dark topbar per Design §4.1) and inaccessible to tenant roles.
**Risk** Medium · **Cx** M

---

## Sprint 1 Exit Checklist

| Gate | Evidence |
|---|---|
| Auth lifecycle | E2E: login → refresh → logout → revoked token rejected |
| Token theft handling | SEC-TOKEN-002 test: family revoked, all devices forced to re-auth |
| RBAC parity | Startup assertion active; three-way parity test (matrix ≡ contracts ≡ DB) green |
| Isolation | Suite covers all S1 endpoints + 5 new tables; leak fixture still detected |
| Provisioning | Tenant created <5 min, idempotent replay proven |
| Audit | Every S1 security event emitted and readable via role-scoped API |
| Frontend | Login + role-based nav in ar and en; session expiry handled without data loss |
