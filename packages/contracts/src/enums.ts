/**
 * Domain enums — the closed string enums the API and the database share.
 *
 * KF-S0-CONTRACT-001. Domain Model Part 8 names sixteen PostgreSQL enums, and
 * all sixteen are here. Part 8 names them and stops: it lists no members. The
 * members below come from the lifecycle state machines in Domain Model Part 2
 * and the exemplar DTOs in API Contract §3.2 — cited per enum, so every member
 * traces to a document line.
 *
 * ---------------------------------------------------------------------------
 * THREE ENUMS SHIP WITH NO MEMBERS, ON PURPOSE.
 *
 * `SyncStatus`, `NotificationChannel` and `PlanCode` have no usable member set
 * in any approved document. Inventing one here is the worst available option: KF-S0-API-003 creates real PostgreSQL enums from this file
 * (its Testing Requirements assert parity against it), and a wrong member set
 * becomes an expand-contract migration — Part 8's own words — rather than an
 * edit. Each is registered as a documentation gap under DISC-017.
 *
 * They are declared with an empty member tuple, which makes their type
 * `never`. That is deliberate: the name exists so the inventory is complete
 * and the gap is visible in the file that should hold the answer, and any
 * attempt to USE one fails to compile rather than silently accepting a string.
 * Fail closed, at build time, in the file that caused it.
 * ---------------------------------------------------------------------------
 * `MediaStatus` — Part 8 writes "Media Status", with a space, which is not a
 * valid identifier in TypeScript, Prisma or PostgreSQL. Corrected to
 * `MediaStatus` here and registered as DISC-018; the approved document is not
 * patched.
 * ---------------------------------------------------------------------------
 * Forward compatibility is a client obligation, not an enum property. API
 * Contract §3.1 requires clients to render a fallback for unknown enum values,
 * and §10 makes new members an additive, non-breaking change. So these unions
 * describe what the server may send TODAY; code that switches on one needs a
 * default branch regardless of how complete the list looks.
 */

/** Organization lifecycle. Domain Model §2.1 L; SAD §4.3. */
export const LIFECYCLE_STATUS = [
  'PROVISIONING',
  'ACTIVE',
  'PAST_DUE',
  'SUSPENDED',
  'PENDING_DELETION',
  'DELETED',
] as const;
export type LifecycleStatus = (typeof LIFECYCLE_STATUS)[number];

/** Child lifecycle. Domain Model §2.3 L — retention/purge per D8, BR-20. */
export const CHILD_STATUS = [
  'ADMITTED',
  'ENROLLED',
  'PAUSED',
  'WITHDRAWN',
  'ARCHIVED_RETENTION',
  'PURGED',
] as const;
export type ChildStatus = (typeof CHILD_STATUS)[number];

/** Invoice lifecycle. Domain Model §2.7 L; `ISSUED` confirmed by API §3.2. */
export const INVOICE_STATUS = [
  'DRAFT',
  'ISSUED',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
  'CREDIT_ADJUSTED',
  'CLOSED',
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUS)[number];

/** API Contract §3.2 PaymentCreateRequest. */
export const PAYMENT_METHOD = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'OTHER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHOD)[number];

/**
 * Domain Model §2.5 A — the ActivityEntry aggregate's own type list.
 *
 * Seven members, including `MEDICATION_ADMIN`. API Contract §2.7 describes the
 * endpoint with six, omitting it; the two documents disagree and Part 8 points
 * at the Domain Model for enums, so the Domain Model's list ships (founder
 * decision, 2026-08-31). The §2.7 omission is registered as DISC-019.
 */
export const ACTIVITY_TYPE = [
  'MEAL',
  'NAP',
  'DIAPER',
  'MOOD',
  'LEARNING',
  'NOTE',
  'MEDICATION_ADMIN',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPE)[number];

/**
 * Domain Model §2.6 R — the two branches of the BR-14 severity workflow:
 * MINOR auto-notifies, SERIOUS requires manager approval and a logged phone
 * contact. BRD BR-14 calls severity "configurable", so a third level may be
 * added later; that is an additive change (§10) and needs no placeholder now.
 */
export const INCIDENT_SEVERITY = ['MINOR', 'SERIOUS'] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITY)[number];

/** Incident lifecycle. Domain Model §2.6 L. */
export const INCIDENT_STATUS = [
  'FILED',
  'UNDER_REVIEW',
  'APPROVED',
  'NOTIFIED',
  'ACKNOWLEDGED',
  'CLOSED',
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUS)[number];

/** DailyReport lifecycle. Domain Model §2.5 L; BR-13 gate. */
export const REPORT_STATUS = [
  'EMPTY',
  'DRAFTING',
  'PENDING_REVIEW',
  'APPROVED',
  'PUBLISHED',
] as const;
export type ReportStatus = (typeof REPORT_STATUS)[number];

/** API Contract §3.2 AttendanceEventCreateRequest. */
export const ATTENDANCE_DIRECTION = ['CHECK_IN', 'CHECK_OUT'] as const;
export type AttendanceDirection = (typeof ATTENDANCE_DIRECTION)[number];

/** Staff employment lifecycle. Domain Model §2.8 L. */
export const EMPLOYMENT_STATUS = ['ONBOARDED', 'ACTIVE', 'SUSPENDED', 'TERMINATED'] as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUS)[number];

/**
 * Media pipeline lifecycle. Domain Model §2.10 L.
 * Part 8 spells this enum "Media Status" — see the header note and DISC-018.
 */
export const MEDIA_STATUS = ['UPLOADING', 'PROCESSING', 'READY', 'QUARANTINED', 'PURGED'] as const;
export type MediaStatus = (typeof MEDIA_STATUS)[number];

/**
 * Notification dispatch lifecycle. Domain Model §2.9 L:
 * `Pending→Sent→Delivered/Failed(→DLQ)`.
 *
 * `DLQ` is not included. The state machine writes it in parentheses after
 * Failed, and SAD §10 treats the dead-letter queue as a destination for failed
 * dispatch records rather than a status a record holds — a row is Failed and
 * then sits in the DLQ. Reading the parenthetical as a fifth member would put
 * infrastructure into a domain enum. Registered with DISC-017 as the one
 * judgement call in this file's member sets.
 */
export const NOTIFICATION_STATUS = ['PENDING', 'SENT', 'DELIVERED', 'FAILED'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUS)[number];

// ---------------------------------------------------------------------------
// The three with no approved member set. See the header. DISC-017.
// ---------------------------------------------------------------------------

/**
 * PENDING — DISC-017. `attendance_events.sync_status` (Domain Part 3 row 25).
 *
 * API Contract §5 enumerates `APPLIED | DUPLICATE | PENDING_REVIEW | REJECTED`,
 * but that is the per-event RESULT in the sync RESPONSE, not the domain of the
 * stored column — a duplicate is rejected at the door and never becomes a
 * stored row with `sync_status=DUPLICATE`. §5 confirms exactly one stored
 * value, `pending_review`. One member is not a member set.
 */
export const SYNC_STATUS = [] as const;
export type SyncStatus = (typeof SYNC_STATUS)[number];

/**
 * PENDING — DISC-017. `notifications.channel` (Domain Part 3 row 47),
 * `notification_preferences` unique(user_id, channel, category) (row 48).
 *
 * Not simply absent — ambiguous, which is worse to guess at. SAD §10 describes
 * the `notifications` worker as "Push/email/SMS dispatch", giving three; SAD
 * §2 says iOS push limits are covered by "in-app + fallback channels", which
 * reads as a fourth. Three or four is exactly the kind of difference that is
 * cheap to settle now and an expand-contract migration later, so the question
 * is asked rather than answered here.
 */
export const NOTIFICATION_CHANNEL = [] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNEL)[number];

/**
 * Domain Model §1.4 value objects: `ConsentSet {photo_internal, photo_group,
 * data_processing}`. That is the member set, upper-cased to match every other
 * enum here — BR-19 explains why the two photo facets are separate (a group
 * photo needs per-child consent from every child in it, which is not the same
 * decision as consenting to your own child's photo).
 */
export const CONSENT_TYPE = ['PHOTO_INTERNAL', 'PHOTO_GROUP', 'DATA_PROCESSING'] as const;
export type ConsentType = (typeof CONSENT_TYPE)[number];

/**
 * PENDING — DISC-017. `subscription_plans` unique(code) (Domain Part 3 row 4),
 * "3 plans (D2)". The count is approved; the three codes are named nowhere.
 * KF-S0-API-003's tier-1 seed inserts these rows, so it needs the answer.
 */
export const PLAN_CODE = [] as const;
export type PlanCode = (typeof PLAN_CODE)[number];

// ---------------------------------------------------------------------------

/**
 * Every Part 8 enum by its Part 8 name, for the parity test KF-S0-API-003 runs
 * against the PostgreSQL enums it creates. An enum with an empty member list is
 * one still awaiting DISC-017.
 */
export const ENUMS = Object.freeze({
  LifecycleStatus: LIFECYCLE_STATUS,
  ChildStatus: CHILD_STATUS,
  InvoiceStatus: INVOICE_STATUS,
  PaymentMethod: PAYMENT_METHOD,
  ActivityType: ACTIVITY_TYPE,
  IncidentSeverity: INCIDENT_SEVERITY,
  IncidentStatus: INCIDENT_STATUS,
  ReportStatus: REPORT_STATUS,
  AttendanceDirection: ATTENDANCE_DIRECTION,
  SyncStatus: SYNC_STATUS,
  NotificationChannel: NOTIFICATION_CHANNEL,
  NotificationStatus: NOTIFICATION_STATUS,
  ConsentType: CONSENT_TYPE,
  EmploymentStatus: EMPLOYMENT_STATUS,
  MediaStatus: MEDIA_STATUS,
  PlanCode: PLAN_CODE,
}) satisfies Record<string, readonly string[]>;

/** Enum names still waiting on DISC-017 — asserted by the contracts test. */
export const ENUMS_PENDING_DEFINITION: readonly string[] = Object.freeze(
  Object.entries(ENUMS)
    .filter(([, members]) => members.length === 0)
    .map(([name]) => name),
);
