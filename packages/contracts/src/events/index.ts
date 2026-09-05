/**
 * Domain event catalog — Domain Model §1.5 "published language".
 *
 * KF-S0-CONTRACT-001. Names and their owning context, transcribed. This is the
 * vocabulary of the transactional outbox (Domain Part 3 row 55), the BullMQ
 * consumers, and the Phase-2 webhook payloads (API Contract §6).
 *
 * PAYLOADS ARE NOT DEFINED HERE, and their absence is not an oversight. §1.5
 * publishes the names; no approved document specifies the `data` shape of a
 * single event. Inventing shapes now would freeze a guess into the one
 * contract that outside consumers eventually depend on — §6 makes webhook
 * payloads a published interface with a 6-month deprecation window (§10).
 * Each event's payload is settled by the sprint task that first emits it.
 *
 * What IS fixed here is the envelope, which §6 does specify, and the name set,
 * so a producer cannot invent an event type that no consumer knows.
 */

/** Domain Model §1.5, by bounded context. */
export const DOMAIN_EVENTS = Object.freeze({
  tenancy: [
    'TenantProvisioned',
    'BranchCreated',
    'PlanChanged',
    'QuotaExceeded',
    'TenantSuspended',
    'TenantDeletionRequested',
  ],
  iam: ['UserCreated', 'LoginSucceeded', 'LoginFailed', 'RoleAssigned', 'UserDeactivated'],
  children: [
    'ChildEnrolled',
    'ChildWithdrawn',
    'GuardianLinked',
    'PickupListChanged',
    'ConsentChanged',
    'MedicalRecordUpdated',
  ],
  attendance: [
    'ChildCheckedIn',
    'ChildCheckedOut',
    'UnauthorizedPickupAttempted',
    'LatePickupFlagged',
    'AttendanceAmended',
    'AttendanceDayClosed',
  ],
  activities: [
    'ActivityLogged',
    'ReportDraftRequested',
    'ReportApproved',
    'ReportPublished',
    'MedicationAdministered',
    'IncidentFiled',
    'IncidentAcknowledged',
  ],
  billing: ['InvoiceIssued', 'InvoiceOverdue', 'PaymentRecorded', 'CreditIssued', 'FeePlanChanged'],
  communication: ['MessageSent', 'AnnouncementPublished', 'NotificationDispatched'],
  media: ['MediaUploaded', 'MediaQuarantined', 'StorageQuotaWarning'],
  ai: ['ReportDraftGenerated', 'AiQuotaExceeded'],
  platform: ['BreakGlassAccessed', 'TenantExportCompleted'],
}) satisfies Record<string, readonly string[]>;

/** The bounded context that publishes an event. */
export type EventContext = keyof typeof DOMAIN_EVENTS;

/** Every published event name. */
export type DomainEventName = (typeof DOMAIN_EVENTS)[EventContext][number];

/** Flat, sorted list. */
export const ALL_DOMAIN_EVENTS: readonly DomainEventName[] = Object.freeze(
  Object.values(DOMAIN_EVENTS).flat().sort(),
) as readonly DomainEventName[];

const EVENT_LOOKUP: ReadonlySet<string> = new Set(ALL_DOMAIN_EVENTS);

/** Narrows an untrusted string to a published event name. */
export function isDomainEventName(value: string): value is DomainEventName {
  return EVENT_LOOKUP.has(value);
}

/**
 * The event envelope — API Contract §6, which mirrors the domain events of
 * Domain Model §1.5. `data` is intentionally `unknown`: see the header. A
 * consumer narrows it with the schema the emitting task ships.
 *
 * `version` is the event's own schema version, not the API's. §1.5 says events
 * are "past tense, versioned `v1`", so a payload change is a new version
 * rather than a mutation of the existing one.
 */
export interface DomainEventEnvelope<TData = unknown> {
  /** UUIDv7. The webhook consumer's dedupe key (§6 consumer guidance). */
  readonly id: string;
  readonly type: DomainEventName;
  /** ISO-8601 UTC. */
  readonly occurred_at: string;
  /** Null for platform-plane events, which belong to no tenant. */
  readonly tenant_id: string | null;
  readonly data: TData;
  readonly version: number;
}

/**
 * The subset §6 exposes as webhooks at Phase 2 activation. These are wire
 * names, not domain names — `invoice.paid` is the webhook event, and it does
 * not correspond one-to-one with a §1.5 domain event, so the two lists are
 * kept separate rather than derived from one another.
 */
export const WEBHOOK_EVENTS = Object.freeze([
  'invoice.paid',
  'attendance.recorded',
  'child.checked_out',
  'report.approved',
  'subscription.updated',
  'media.uploaded',
]);
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
