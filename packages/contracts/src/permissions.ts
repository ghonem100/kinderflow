/**
 * Permission codes — the authorization vocabulary of the product.
 *
 * KF-S0-CONTRACT-001. This map is the ONLY permitted source of permission
 * codes (task Security Requirements): guards must not accept string literals,
 * and a code that is not here does not exist.
 *
 * ---------------------------------------------------------------------------
 * PROVENANCE — this file is a TRANSCRIPTION, not a design.
 *
 * API Contract §2 carries a `Perm` column on almost every endpoint row holding
 * the literal permission code, and RBAC §2.4 says so in as many words: "The
 * Phase 5 API contract maps every endpoint to exactly one code." Every code
 * below is copied verbatim from that column. Nothing is renamed, normalised or
 * improved — a code that differs by one character from the contract makes this
 * file a second, competing source of truth, which is the one thing it must
 * never be.
 *
 * Where §2 writes a wildcard (`guardian:*`, `document:*`, `fee-plan:*`, …) the
 * expansion is decided by that resource's letters in the RBAC §3 matrix, per
 * the notation C→create · R→read · U→update · D→delete · A→approve · E→export
 * · Rs→restore · Ar→archive. A code exists if ANY role holds that letter; which
 * roles hold it is KF-S1-IAM-*'s problem, not this map's.
 *
 * Every entry is traceable to a document row in `PERMISSIONS_DERIVATION.md`,
 * which is part of this deliverable. A reviewer must be able to check any code
 * against the contract without re-deriving anything.
 * ---------------------------------------------------------------------------
 * SCOPE IS NOT PART OF A CODE. RBAC §2.3 enforces scope (tenant · branch ·
 * classroom · own-children) as a separate pipeline stage; §2.4 defines the
 * code. The matrix's superscripts (ᵀ ᴮ ᶜ ᴼ) and §2's parenthetical notes
 * ("(self)", "per matrix") are scope, and none of them appear below.
 * ---------------------------------------------------------------------------
 * TWO CODE SHAPES EXIST, and that is the contract's doing, not a slip here.
 * RBAC §2.4 defines codes as `{resource}:{action}`, and the tenant plane obeys
 * that throughout. The platform plane (§2.17) does not: it uses a three-segment
 * `platform:{resource}:{action}` form — `platform:tenant:create`,
 * `platform:subscription:update`, `platform:flags:*`. Both are approved
 * content, and C-1R's transcription rule forbids normalising one into the
 * other, so `PermissionCode` admits both. The conflict is registered as
 * DISC-014, not resolved here.
 * ---------------------------------------------------------------------------
 * WHAT IS DELIBERATELY ABSENT. Several resources hold letters in the RBAC §3
 * matrix but appear in no §2 `Perm` cell — staff members, feature flags as a
 * tenant resource, tenant exports, and a handful of individual actions such as
 * `child:delete`. They are NOT invented here. Each is registered as DISC-015
 * with the code that would follow the rules above, to be approved before it
 * appears. A code invented in this file becomes a permission row in the
 * database (KF-S0-API-003 AC3) and a guard in the API, backed by no
 * specification anywhere.
 */

/**
 * §2.1 Authentication. Most `/auth` operations are `public` or "any
 * authenticated" and carry no code; only MFA enrollment does.
 */
const AUTH = {
  /** §2.1 POST /auth/mfa/enroll · POST /auth/mfa/verify */
  USER_UPDATE: 'user:update',
} as const;

/** §2.2 Organization & Settings. */
const ORGANIZATION = {
  /** §2.2 GET /organization · §2.16 GET /feature-flags */
  ORGANIZATION_READ: 'organization:read',
  /** §2.2 PATCH /organization */
  ORGANIZATION_UPDATE: 'organization:update',
  /** §2.2 GET /settings */
  SETTINGS_READ: 'settings:read',
  /** §2.2 PATCH /settings */
  SETTINGS_UPDATE: 'settings:update',
} as const;

/** §2.3 Branches & Classrooms. `classroom:*` expanded from §3 (C R U Ar). */
const STRUCTURE = {
  /** §2.3 POST /branches */
  BRANCH_CREATE: 'branch:create',
  /** §2.3 GET /branches · GET /branches/{id} */
  BRANCH_READ: 'branch:read',
  /** §2.3 PATCH /branches/{id} */
  BRANCH_UPDATE: 'branch:update',
  /** §2.3 POST /branches/{id}/archive */
  BRANCH_ARCHIVE: 'branch:archive',

  /** §2.3 POST /classrooms */
  CLASSROOM_CREATE: 'classroom:create',
  /** §2.3 GET /classrooms · GET /classrooms/{id}/roster */
  CLASSROOM_READ: 'classroom:read',
  /** §2.3 PATCH /classrooms/{id} — from `classroom:*`, §3 letter U */
  CLASSROOM_UPDATE: 'classroom:update',
  /** §2.3 POST /classrooms/{id}/archive — from `classroom:*`, §3 letter Ar */
  CLASSROOM_ARCHIVE: 'classroom:archive',
} as const;

/** §2.4 Users, Roles & Permissions. */
const IAM = {
  /** §2.4 POST /users/invite */
  USER_CREATE: 'user:create',
  /** §2.4 GET /users · GET /users/{id} */
  USER_READ: 'user:read',
  /** §2.4 POST /users/{id}/deactivate */
  USER_DELETE: 'user:delete',
  /** §2.4 POST /users/{id}/reactivate */
  USER_RESTORE: 'user:restore',

  /** §2.4 GET /roles */
  ROLE_READ: 'role:read',
  /** §2.4 POST /users/{id}/roles */
  ROLE_ASSIGNMENT_CREATE: 'role-assignment:create',
  /** §2.4 DELETE /users/{id}/roles/{roleAssignmentId} */
  ROLE_ASSIGNMENT_DELETE: 'role-assignment:delete',
} as const;

/**
 * §2.5 Children & Families. Four wildcards expand here, and two of them are
 * the reason this vocabulary could not be derived from the §3 matrix alone:
 * `/children/{id}/medical-records` maps to `medical:*`, not `medical-record:*`,
 * and `/children/{id}/documents` maps to `document:*`, not `child-document:*`.
 * The resource token is not mechanically the path segment.
 */
const CHILDREN = {
  /** §2.5 POST /children */
  CHILD_CREATE: 'child:create',
  /** §2.5 GET /children · GET /children/{id} */
  CHILD_READ: 'child:read',
  /** §2.5 PATCH /children/{id} */
  CHILD_UPDATE: 'child:update',
  /** §2.5 POST /children/{id}/withdraw */
  CHILD_ARCHIVE: 'child:archive',

  /** §2.5 `guardian:*` — §3 Guardians letters C R U */
  GUARDIAN_CREATE: 'guardian:create',
  GUARDIAN_READ: 'guardian:read',
  GUARDIAN_UPDATE: 'guardian:update',

  /** §2.5 `pickup:*` per matrix — §3 Authorized pickups letters C R U D A */
  PICKUP_CREATE: 'pickup:create',
  PICKUP_READ: 'pickup:read',
  PICKUP_UPDATE: 'pickup:update',
  PICKUP_DELETE: 'pickup:delete',
  /** §2.5 POST /children/{id}/authorized-pickups/{pickupId}/approve */
  PICKUP_APPROVE: 'pickup:approve',

  /** §2.5 `medical:*` — §3 Medical records letters C R U */
  MEDICAL_CREATE: 'medical:create',
  MEDICAL_READ: 'medical:read',
  MEDICAL_UPDATE: 'medical:update',

  /** §2.5 GET /children/{id}/consents */
  CONSENT_READ: 'consent:read',
  /** §2.5 PUT /children/{id}/consents */
  CONSENT_UPDATE: 'consent:update',

  /** §2.5 `document:*` — §3 Child documents letters C R U D E */
  DOCUMENT_CREATE: 'document:create',
  DOCUMENT_READ: 'document:read',
  DOCUMENT_UPDATE: 'document:update',
  DOCUMENT_DELETE: 'document:delete',
  DOCUMENT_EXPORT: 'document:export',
} as const;

/**
 * §2.6 Attendance. `attendance:amend` is one of RBAC §2.4's four named
 * specials. The §2.6 row reads "`attendance:amend` / request": the "request"
 * half is the §3 "Attendance amendments" C letter held by TEACHER and
 * RECEPTIONIST "(request only)" — a scope-and-workflow distinction on the same
 * code, not a fifth code.
 */
const ATTENDANCE = {
  /** §2.6 POST /attendance-events · POST /attendance-events/sync */
  ATTENDANCE_CREATE: 'attendance:create',
  /** §2.6 GET /attendance-days · /children/{id}/attendance-days · /branches/{id}/presence */
  ATTENDANCE_READ: 'attendance:read',
  /** §2.6 POST /attendance-days/{id}/amendments */
  ATTENDANCE_AMEND: 'attendance:amend',
  /** §2.6 POST /attendance-amendments/{id}/approve */
  ATTENDANCE_APPROVE: 'attendance:approve',
} as const;

/** §2.7 Activities & Daily Reports. */
const ACTIVITIES = {
  /** §2.7 POST /activity-entries · POST /activity-entries/batch */
  ACTIVITY_CREATE: 'activity:create',
  /** §2.7 GET /classrooms/{id}/activity-entries */
  ACTIVITY_READ: 'activity:read',
  /** §2.7 PATCH /activity-entries/{id} */
  ACTIVITY_UPDATE: 'activity:update',
  /** §2.7 DELETE /activity-entries/{id} */
  ACTIVITY_DELETE: 'activity:delete',

  /** §2.7 GET /daily-reports · GET /children/{id}/daily-reports */
  REPORT_READ: 'report:read',
  /** §2.7 PATCH /daily-reports/{id} · POST /daily-reports/{id}/request-draft */
  REPORT_UPDATE: 'report:update',
  /** §2.7 POST /daily-reports/{id}/approve · /reject */
  REPORT_APPROVE: 'report:approve',
} as const;

/** §2.8 Medication. Abbreviated tokens are as written in the contract. */
const MEDICATION = {
  /** §2.8 POST /children/{id}/medication-authorizations */
  MED_AUTH_CREATE: 'med-auth:create',
  /** §2.8 GET …/medication-authorizations */
  MED_AUTH_READ: 'med-auth:read',
  /** §2.8 POST …/{authId}/approve */
  MED_AUTH_APPROVE: 'med-auth:approve',

  /** §2.8 POST /medication-administrations */
  MED_ADMIN_CREATE: 'med-admin:create',
  /** §2.8 GET /children/{id}/medication-administrations */
  MED_ADMIN_READ: 'med-admin:read',
} as const;

/** §2.9 Incidents. Guardian acknowledgment reuses `incident:read`. */
const INCIDENTS = {
  /** §2.9 POST /incidents */
  INCIDENT_CREATE: 'incident:create',
  /** §2.9 GET /incidents · GET /incidents/{id} · POST /incidents/{id}/acknowledge */
  INCIDENT_READ: 'incident:read',
  /** §2.9 PATCH /incidents/{id} */
  INCIDENT_UPDATE: 'incident:update',
  /** §2.9 POST /incidents/{id}/approve */
  INCIDENT_APPROVE: 'incident:approve',
} as const;

/** §2.10 Media. */
const MEDIA = {
  /** §2.10 POST /media/uploads · POST /media/uploads/{id}/complete */
  MEDIA_CREATE: 'media:create',
  /** §2.10 GET /media/{id} */
  MEDIA_READ: 'media:read',
  /** §2.10 DELETE /media/{id} */
  MEDIA_DELETE: 'media:delete',
} as const;

/**
 * §2.11 Billing. `invoice:issue` is a §2.4 named special. The §3 row "Fee
 * plans / components / discounts" names three things and resolves to the
 * single `fee-plan` token, because that is what §2 writes — components and
 * discount rules have no separate code.
 */
const BILLING = {
  /** §2.11 `fee-plan:*` — §3 Fee plans letters C R U Ar A */
  FEE_PLAN_CREATE: 'fee-plan:create',
  FEE_PLAN_READ: 'fee-plan:read',
  FEE_PLAN_UPDATE: 'fee-plan:update',
  FEE_PLAN_ARCHIVE: 'fee-plan:archive',
  FEE_PLAN_APPROVE: 'fee-plan:approve',

  /** §2.11 `fee-assignment:*` — §3 Fee assignments letters C R U */
  FEE_ASSIGNMENT_CREATE: 'fee-assignment:create',
  FEE_ASSIGNMENT_READ: 'fee-assignment:read',
  FEE_ASSIGNMENT_UPDATE: 'fee-assignment:update',

  /** §2.11 POST /invoices/generate-cycle */
  INVOICE_CREATE: 'invoice:create',
  /** §2.11 GET /invoices · GET /invoices/{id} · GET /guardians/{id}/balance */
  INVOICE_READ: 'invoice:read',
  /** §2.11 PATCH /invoices/{id} */
  INVOICE_UPDATE: 'invoice:update',
  /** §2.11 POST /invoices/{id}/issue · POST /invoices/issue-batch (§2.4 special) */
  INVOICE_ISSUE: 'invoice:issue',

  /** §2.11 POST /payments */
  PAYMENT_CREATE: 'payment:create',
  /** §2.11 GET /payments · GET /payments/{id} */
  PAYMENT_READ: 'payment:read',

  /** §2.11 POST /credit-notes */
  CREDIT_NOTE_CREATE: 'credit-note:create',
} as const;

/** §2.12 Communication. */
const COMMUNICATION = {
  /** §2.12 `message:*` — §3 Conversations & messages letters C R */
  MESSAGE_CREATE: 'message:create',
  /** §2.12 GET /conversations · POST /conversations/{id}/escalate */
  MESSAGE_READ: 'message:read',

  /** §2.12 `announcement:*` — §3 Announcements letters C R U D A */
  ANNOUNCEMENT_CREATE: 'announcement:create',
  ANNOUNCEMENT_READ: 'announcement:read',
  ANNOUNCEMENT_UPDATE: 'announcement:update',
  ANNOUNCEMENT_DELETE: 'announcement:delete',
  /** Publish is the approval gate: §2.12 draft→approve→publish, §3 letter A. */
  ANNOUNCEMENT_APPROVE: 'announcement:approve',

  /** §2.12 GET /notifications · POST /notifications/mark-read */
  NOTIFICATION_READ: 'notification:read',
  /** §2.12 PUT /notification-preferences */
  NOTIFICATION_UPDATE: 'notification:update',
} as const;

/** §2.13–§2.15 Analytics, AI, Audit. */
const INSIGHTS = {
  /** §2.13 GET /analytics/overview · /aging · /attendance-trends · /engagement */
  ANALYTICS_READ: 'analytics:read',
  /** §2.13 POST /analytics/exports */
  ANALYTICS_EXPORT: 'analytics:export',

  /** §2.14 GET /ai/usage */
  AI_READ: 'ai:read',
  /**
   * §2.14 GET/PATCH /ai/settings. `configure` is not one of RBAC §2.4's eight
   * actions or four specials; it is written this way in the contract and is
   * transcribed unchanged. Registered as DISC-014.
   */
  AI_CONFIGURE: 'ai:configure',

  /** §2.15 GET /audit-log */
  AUDIT_READ: 'audit:read',
  /** §2.15 POST /audit-log/exports */
  AUDIT_EXPORT: 'audit:export',
} as const;

/** §2.16 Subscription. */
const SUBSCRIPTION = {
  /** §2.16 GET /subscription */
  SUBSCRIPTION_READ: 'subscription:read',
} as const;

/**
 * §2.17 Super Admin — Platform Plane. Three-segment codes; see the header note
 * and DISC-014. `breakglass:request` is a §2.4 named special and keeps the
 * two-segment shape even here.
 */
const PLATFORM = {
  /** §2.17 POST /platform/tenants */
  PLATFORM_TENANT_CREATE: 'platform:tenant:create',
  /** §2.17 GET /platform/tenants · GET /platform/tenants/{id} */
  PLATFORM_TENANT_READ: 'platform:tenant:read',
  /** §2.17 POST /platform/tenants/{id}/suspend · /reactivate · /request-deletion */
  PLATFORM_TENANT_UPDATE: 'platform:tenant:update',
  /** §2.17 PATCH /platform/tenants/{id}/subscription */
  PLATFORM_SUBSCRIPTION_UPDATE: 'platform:subscription:update',

  /** §2.17 `platform:flags:*` — §3 Feature flags letters C R U D (SUPER_ADMIN) */
  PLATFORM_FLAGS_CREATE: 'platform:flags:create',
  PLATFORM_FLAGS_READ: 'platform:flags:read',
  PLATFORM_FLAGS_UPDATE: 'platform:flags:update',
  PLATFORM_FLAGS_DELETE: 'platform:flags:delete',

  /** §2.17 GET /platform/health */
  PLATFORM_READ: 'platform:read',
  /** §2.17 POST /platform/tenants/{id}/exports */
  PLATFORM_EXPORT: 'platform:export',

  /** §2.17 POST /platform/break-glass · GET/close (§2.4 special) */
  BREAKGLASS_REQUEST: 'breakglass:request',
} as const;

/**
 * The authorization vocabulary. Flat on purpose: a guard asks "does this code
 * exist", never "which module owns it", and a nested shape would invite a
 * second lookup path into the one map that must have exactly one.
 */
export const PERMISSIONS = {
  ...AUTH,
  ...ORGANIZATION,
  ...STRUCTURE,
  ...IAM,
  ...CHILDREN,
  ...ATTENDANCE,
  ...ACTIVITIES,
  ...MEDICATION,
  ...INCIDENTS,
  ...MEDIA,
  ...BILLING,
  ...COMMUNICATION,
  ...INSIGHTS,
  ...SUBSCRIPTION,
  ...PLATFORM,
} as const;

/** The literal union of every code. Guards accept this, never `string`. */
export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Stable, sorted list — the seed order for the `permissions` table (M-001). */
export const ALL_PERMISSIONS: readonly PermissionCode[] = Object.freeze(
  [...new Set(Object.values(PERMISSIONS))].sort(),
) as readonly PermissionCode[];

const PERMISSION_LOOKUP: ReadonlySet<string> = new Set(ALL_PERMISSIONS);

/**
 * Narrows an untrusted string to a known code. The only sanctioned way to get
 * a `PermissionCode` out of configuration, a database row, or a spec file —
 * everything else would be a cast, which is how string literals get back in.
 */
export function isPermissionCode(value: string): value is PermissionCode {
  return PERMISSION_LOOKUP.has(value);
}
