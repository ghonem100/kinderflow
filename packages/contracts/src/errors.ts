/**
 * Error catalog — RFC 7807 problem codes.
 *
 * KF-S0-CONTRACT-001. A transcription of API Contract §4, which states that
 * "codes are stable API contract". Every code the API can return is here; a
 * code used by an endpoint but absent from this file fails the contracts test.
 *
 * ---------------------------------------------------------------------------
 * STATUS IS A TUPLE, NOT A NUMBER.
 *
 * §4 gives three rows two statuses rather than one — `402/422` for the plan
 * limits, `415/422` for the media pipeline, and `502/503` for upstream
 * failures. That is the document as approved, and this file carries both
 * rather than picking one, so nothing is invented here and the reading stays
 * checkable against §4 (founder decision, 2026-08-31).
 *
 * The single status each of those codes actually returns is settled where the
 * endpoint is built (KF-S0-API-001), which is the only place with the request
 * context to choose — 415 belongs to a rejected Content-Type, 422 to a
 * rejected body. It costs nothing to defer: none of the nine dual-status
 * codes appears on this task's seeded `/health` or `/auth` paths, so no
 * OpenAPI response needs a single number yet.
 *
 * Note the third dual row. §4's `502/503` line is the same shape as the two
 * the rework brief named, and is registered with them as DISC-016.
 * ---------------------------------------------------------------------------
 * I18N KEYS ARE DERIVED, NOT AUTHORED. §4 enumerates no keys. The rule is
 * mechanical and total, so a reviewer can check it by inspection and a new
 * code cannot be given a key that disagrees with its code:
 *
 *     i18nKey = 'errors.' + code.toLowerCase()
 *
 * `PICKUP_NOT_AUTHORIZED` → `errors.pickup_not_authorized`. One namespace, one
 * key per code, no exceptions and nothing hand-picked. The contracts test
 * re-derives every key from its code and fails on drift, so the rule cannot
 * rot into a hand-maintained list.
 * ---------------------------------------------------------------------------
 * SECURITY EVENTS ARE CARRIED HERE. §4 annotates three codes with a security
 * event id, and this file records the association rather than leaving it to
 * KF-S0-API-001 (the brief left the choice open; this is the recorded pick).
 * The reason is that the association is data about the code, and it is written
 * in the same table as the code — splitting them means the catalog and the
 * emitter can disagree. What stays with API-001 is the EMISSION: deciding when
 * an event fires and writing it to the audit log. This file only says which
 * event a code belongs to.
 *
 * `RESOURCE_NOT_FOUND` deliberately carries no event even though §4's prose
 * mentions SEC-PERM-003. That tripwire fires on the cross-tenant probe that
 * PRODUCED the 404, not on every 404 — most are ordinary misses. Attaching it
 * to the code would make every mistyped id a security event.
 */

/** The HTTP status(es) §4 assigns to a code. Two means §4 gives two. */
export type ErrorStatus = number | readonly [number, number];

export interface ErrorDefinition {
  /** HTTP status, or the pair §4 leaves open. */
  readonly status: ErrorStatus;
  /** Derived: `errors.` + lowercased code. Never hand-written. */
  readonly i18nKey: string;
  /** The §4 row this came from, for review. */
  readonly meaning: string;
  /** Security event id where §4 names one (RBAC §7 catalog). */
  readonly securityEvent?: string;
  /** Business rule or field-level rule §4 cites. */
  readonly rule?: string;
}

/** `errors.` + the code, lowercased. The whole i18n key rule. */
const key = (code: string): string => `errors.${code.toLowerCase()}`;

const define = <T extends Record<string, Omit<ErrorDefinition, 'i18nKey'>>>(
  rows: T,
): { readonly [K in keyof T]: ErrorDefinition } =>
  Object.freeze(
    Object.fromEntries(
      Object.entries(rows).map(([code, row]) => [
        code,
        Object.freeze({ ...row, i18nKey: key(code) }),
      ]),
    ),
  ) as { readonly [K in keyof T]: ErrorDefinition };

export const ERRORS = define({
  // --- 400 ---
  REQUEST_MALFORMED: { status: 400, meaning: 'Unparseable body/query' },

  // --- 401 authentication ---
  AUTH_REQUIRED: { status: 401, meaning: 'Authentication failures' },
  AUTH_TOKEN_EXPIRED: { status: 401, meaning: 'Authentication failures' },
  AUTH_TOKEN_INVALID: { status: 401, meaning: 'Authentication failures' },
  AUTH_SESSION_REVOKED: { status: 401, meaning: 'Authentication failures' },

  // --- 401 credential flows ---
  AUTH_INVALID_CREDENTIALS: { status: 401, meaning: 'Credential flows' },
  AUTH_RESET_TOKEN_INVALID: { status: 401, meaning: 'Credential flows' },
  AUTH_INVITE_EXPIRED: { status: 401, meaning: 'Credential flows' },

  // --- 403 authorization ---
  PERMISSION_DENIED: {
    status: 403,
    meaning: 'Authorization',
    securityEvent: 'SEC-PERM-002',
  },
  SCOPE_DENIED: { status: 403, meaning: 'Authorization' },
  TENANT_SUSPENDED: { status: 403, meaning: 'Authorization' },
  MFA_REQUIRED: { status: 403, meaning: 'Authorization' },

  // --- 403 domain-security ---
  PICKUP_NOT_AUTHORIZED: {
    status: 403,
    meaning: 'Domain-security',
    securityEvent: 'SEC-SAFE-001',
  },
  CONSENT_REQUIRED: { status: 403, meaning: 'Domain-security', rule: 'BR-19' },
  AUTH_ACCOUNT_LOCKED: { status: 403, meaning: 'Domain-security' },

  // --- 404 ---
  RESOURCE_NOT_FOUND: {
    status: 404,
    meaning: 'Also returned for cross-tenant IDs (no existence leak)',
  },

  // --- 409 conflicts ---
  VERSION_CONFLICT: { status: 409, meaning: 'Conflicts', rule: 'If-Match' },
  DUPLICATE_RESOURCE: { status: 409, meaning: 'Conflicts' },
  ATTENDANCE_SEQUENCE_CONFLICT: { status: 409, meaning: 'Conflicts', rule: 'BR-11' },
  STATE_TRANSITION_INVALID: { status: 409, meaning: 'Conflicts' },

  // --- 422 validation / business ---
  VALIDATION_FAILED: { status: 422, meaning: 'Validation/business (+errors[])' },
  VAL_PICKUP_PERSON_REQUIRED: { status: 422, meaning: 'Validation/business' },
  LAST_PRIMARY_GUARDIAN: { status: 422, meaning: 'Validation/business', rule: 'BR-04' },
  CLASSROOM_CAPACITY_EXCEEDED: { status: 422, meaning: 'Validation/business', rule: 'BR-02' },
  AGE_RANGE_VIOLATION: { status: 422, meaning: 'Validation/business', rule: 'BR-03' },

  // --- 422 business rules ---
  INVOICE_IMMUTABLE: { status: 422, meaning: 'Business rules', rule: 'BR-08' },
  ALLOCATION_EXCEEDS_BALANCE: { status: 422, meaning: 'Business rules', rule: 'BR-09' },
  MED_AUTH_INVALID: { status: 422, meaning: 'Business rules' },
  REPORT_ALREADY_APPROVED: { status: 422, meaning: 'Business rules', rule: 'FL-07' },
  BRANCH_NOT_EMPTY: { status: 422, meaning: 'Business rules' },
  CLASSROOM_HAS_CHILDREN: { status: 422, meaning: 'Business rules' },
  CONVERSATION_NOT_ALLOWED: { status: 422, meaning: 'Business rules' },

  // --- 402/422 plan limits (dual status — see header) ---
  SUBSCRIPTION_LIMIT_REACHED: { status: [402, 422], meaning: 'Plan limits', rule: 'BR-22' },
  STORAGE_QUOTA_EXCEEDED: { status: [402, 422], meaning: 'Plan limits', rule: 'BR-21' },
  AI_QUOTA_EXCEEDED: { status: [402, 422], meaning: 'Plan limits' },

  // --- 409 offline sync (§5) ---
  SYNC_DUPLICATE: { status: 409, meaning: 'Offline sync (§5)' },
  SYNC_CONFLICT_PENDING_REVIEW: { status: 409, meaning: 'Offline sync (§5)' },
  SYNC_CLOCK_SKEW: { status: 409, meaning: 'Offline sync (§5)' },

  // --- 415/422 media pipeline (dual status — see header) ---
  MEDIA_TYPE_UNSUPPORTED: { status: [415, 422], meaning: 'Media pipeline' },
  MEDIA_TOO_LARGE: { status: [415, 422], meaning: 'Media pipeline' },
  MEDIA_QUARANTINED: { status: [415, 422], meaning: 'Media pipeline' },

  // --- 429 ---
  RATE_LIMITED: { status: 429, meaning: 'All tiers (+Retry-After)' },

  // --- 502/503 upstream/infra (dual status — see header, DISC-016) ---
  AI_PROVIDER_UNAVAILABLE: { status: [502, 503], meaning: 'Upstream/infra (fallback engaged)' },
  STORAGE_UNAVAILABLE: { status: [502, 503], meaning: 'Upstream/infra' },
  SERVICE_UNAVAILABLE: { status: [502, 503], meaning: 'Upstream/infra' },

  // --- 500 ---
  INTERNAL_ERROR: { status: 500, meaning: 'Generic, trace_id always present' },
});

/** The literal union of every catalog code. */
export type ErrorCode = keyof typeof ERRORS;

/** Stable, sorted list. */
export const ALL_ERROR_CODES: readonly ErrorCode[] = Object.freeze(
  (Object.keys(ERRORS) as ErrorCode[]).sort(),
);

const ERROR_LOOKUP: ReadonlySet<string> = new Set(ALL_ERROR_CODES);

/** Narrows an untrusted string to a catalog code. */
export function isErrorCode(value: string): value is ErrorCode {
  return ERROR_LOOKUP.has(value);
}

/**
 * The `type` URI §4 puts in every problem document. Derived from the code for
 * the same reason the i18n key is.
 */
export const errorTypeUri = (code: ErrorCode): string =>
  `https://docs.kinderflow.app/errors/${code}`;

/**
 * The RFC 7807 body §4 specifies. `detail` is localized by the API via
 * `Accept-Language`; this package defines the shape, never the message.
 */
export interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly code: ErrorCode;
  readonly detail?: string;
  readonly errors?: readonly { pointer: string; code: string; message: string }[];
  readonly trace_id: string;
}
