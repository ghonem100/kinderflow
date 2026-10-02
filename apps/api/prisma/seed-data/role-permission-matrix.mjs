/**
 * RBAC §3 permission matrix, transcribed (KF-S0-API-003).
 *
 * This is the source for `role_permissions`. Requirement 4 does not list that
 * table, but Requirement 2 creates it and Domain Part 3 row 13 makes it
 * reference data — and reference data that ships empty is not reference data.
 * Sprint 1's guard pipeline reads it.
 *
 * ---------------------------------------------------------------------------
 * WHY THE ACTIONS ARE WRITTEN OUT RATHER THAN PARSED FROM THE LETTERS
 *
 * Every cell keeps its raw matrix text AND an explicit action list. A reviewer
 * checks `raw` against RBAC §3 and `actions` against `raw`; nothing is inferred
 * at runtime. Parsing the letters would have been shorter and wrong: real cells
 * read `R ᴮ · A (amendments)`, `C R U(draft) ᵀ · issue`, `C (day-close job) R`
 * and `R (platform + bg)`. A regex over that is a guess dressed as automation.
 *
 * Letter → action, from the §3 legend:
 *   C→create · R→read · U→update · D→delete · A→approve · E→export
 *   Rs→restore · Ar→archive
 *
 * ---------------------------------------------------------------------------
 * THREE RULES THAT SHAPE EVERY ROW
 *
 * 1. SCOPE IS NOT HERE. The superscripts ᵀ ᴮ ᶜ ᴼ are kept in `raw` for review
 *    and appear in no emitted pair. RBAC §2.3 makes scope a separate pipeline
 *    stage, resolved from `user_roles` (Domain row 14, M-003). Folding scope in
 *    would double this table and make the guard's contract unreadable.
 *
 * 2. SUPER_ADMIN'S TENANT-DATA CELLS ARE NOT SEEDED. RBAC §3's header says that
 *    column "reflects break-glass mode only (otherwise no tenant data access)".
 *    A `role_permissions` row IS a standing grant, so seeding them would give
 *    SUPER_ADMIN permanent tenant access and reduce break-glass to advisory.
 *    Elevation stays a runtime path through `break_glass_grants` (M-007, BR-17),
 *    which already carries the time-box, the reason and the owner notification.
 *    Founder decision, 2026-09-06. SUPER_ADMIN appears below only on the
 *    platform-plane rows, where its grants are ordinary and standing.
 *
 * 3. A CELL MAY DECODE TO NO CODE, AND THAT IS RECORDED, NOT FIXED. The
 *    authorization vocabulary is `@kf/contracts/permissions`, which is a
 *    transcription of API Contract §2 — so a matrix letter with no §2 endpoint
 *    has no code to grant. Those cells carry `unmapped`, the seed skips them,
 *    and the derivation table prints them. Most are SYSTEM job-creates
 *    (`report:create`, `audit:create`, `notification:create`) that no endpoint
 *    performs. Registered as DISC-023 — inventing a code here would put a
 *    permission in the database that no specification authorises.
 */

/** RBAC §2.1 spelling. Eight roles — see DISC-022 for the "7 roles" citations. */
export const ROLE_CODES = [
  'OWNER',
  'BRANCH_MANAGER',
  'TEACHER',
  'RECEPTIONIST',
  'ACCOUNTANT',
  'PARENT',
  'SUPER_ADMIN',
  'SYSTEM',
];

const cell = (raw, actions, unmapped) => ({ raw, actions, ...(unmapped ? { unmapped } : {}) });

/**
 * One entry per RBAC §3 row.
 *
 * `tokens` are the permission resource tokens the row maps to, taken from
 * `packages/contracts/PERMISSIONS_DERIVATION.md` — the row label is NOT the
 * token (Medical records → `medical`, Child documents → `document`).
 *
 * `extra` adds codes a cell implies that its letters do not spell, such as the
 * named specials of RBAC §2.4.
 */
export const MATRIX = [
  {
    row: 'Organization profile & settings',
    // One row, two tokens: §2.2 splits it into /organization and /settings.
    tokens: ['organization', 'settings'],
    cells: {
      OWNER: cell('R U ᵀ', ['read', 'update']),
      BRANCH_MANAGER: cell('R ᴮ', ['read']),
      ACCOUNTANT: cell('R ᵀ', ['read']),
      SYSTEM: cell('R', ['read']),
    },
  },
  {
    row: 'Branches',
    tokens: ['branch'],
    cells: {
      OWNER: cell('C R U Ar ᵀ', ['create', 'read', 'update', 'archive']),
      BRANCH_MANAGER: cell('R U ᴮ', ['read', 'update']),
      RECEPTIONIST: cell('R ᴮ', ['read']),
      ACCOUNTANT: cell('R ᵀ', ['read']),
      SYSTEM: cell('R', ['read']),
    },
  },
  {
    row: 'Classrooms',
    tokens: ['classroom'],
    cells: {
      OWNER: cell('C R U Ar ᵀ', ['create', 'read', 'update', 'archive']),
      BRANCH_MANAGER: cell('C R U Ar ᴮ', ['create', 'read', 'update', 'archive']),
      TEACHER: cell('R ᶜ', ['read']),
      RECEPTIONIST: cell('R ᴮ', ['read']),
      ACCOUNTANT: cell('R ᵀ', ['read']),
      SYSTEM: cell('R', ['read']),
    },
  },
  {
    row: 'Users (staff accounts)',
    tokens: ['user'],
    cells: {
      OWNER: cell('C R U D Rs ᵀ', ['create', 'read', 'update', 'delete', 'restore']),
      BRANCH_MANAGER: cell('C R U ᴮ (staff below self)', ['create', 'read', 'update']),
      TEACHER: cell('R ᴼ (self)', ['read']),
      RECEPTIONIST: cell('R ᴼ', ['read']),
      ACCOUNTANT: cell('R ᴼ', ['read']),
      PARENT: cell('R ᴼ', ['read']),
    },
  },
  {
    row: 'Role assignments',
    tokens: ['role-assignment'],
    cells: {
      // `role-assignment:read` and `:update` have no §2 endpoint (DISC-015), so
      // R and U decode to nothing here.
      OWNER: cell(
        'C R U D ᵀ',
        ['create', 'delete'],
        ['role-assignment:read', 'role-assignment:update'],
      ),
      BRANCH_MANAGER: cell(
        'C R U ᴮ (TE/RC only)',
        ['create'],
        ['role-assignment:read', 'role-assignment:update'],
      ),
    },
  },
  {
    row: 'Children (profiles)',
    tokens: ['child'],
    cells: {
      // child:delete and child:restore are DISC-015 residue — no §2 endpoint.
      OWNER: cell(
        'C R U D Rs Ar ᵀ',
        ['create', 'read', 'update', 'archive'],
        ['child:delete', 'child:restore'],
      ),
      BRANCH_MANAGER: cell('C R U ᴮ', ['create', 'read', 'update']),
      TEACHER: cell('R ᶜ', ['read']),
      RECEPTIONIST: cell('C R U ᴮ', ['create', 'read', 'update']),
      ACCOUNTANT: cell('R ᵀ (billing fields)', ['read']),
      PARENT: cell('R ᴼ', ['read']),
      SYSTEM: cell('R', ['read']),
    },
  },
  {
    row: 'Guardians',
    tokens: ['guardian'],
    cells: {
      OWNER: cell('C R U ᵀ', ['create', 'read', 'update']),
      BRANCH_MANAGER: cell('C R U ᴮ', ['create', 'read', 'update']),
      TEACHER: cell('R ᶜ (contact only)', ['read']),
      RECEPTIONIST: cell('C R U ᴮ', ['create', 'read', 'update']),
      ACCOUNTANT: cell('R ᵀ', ['read']),
      PARENT: cell('R U ᴼ (self)', ['read', 'update']),
      SYSTEM: cell('R', ['read']),
    },
  },
  {
    row: 'Authorized pickups',
    tokens: ['pickup'],
    cells: {
      OWNER: cell('R ᵀ · A', ['read', 'approve']),
      BRANCH_MANAGER: cell('C R U D ᴮ · A', ['create', 'read', 'update', 'delete', 'approve']),
      TEACHER: cell('R ᶜ', ['read']),
      RECEPTIONIST: cell('R ᴮ (verify only)', ['read']),
      PARENT: cell('C R U D ᴼ (own child, pending approval)', [
        'create',
        'read',
        'update',
        'delete',
      ]),
      SYSTEM: cell('R', ['read']),
    },
  },
  {
    row: 'Medical records',
    tokens: ['medical'],
    cells: {
      OWNER: cell('R ᵀ', ['read']),
      BRANCH_MANAGER: cell('C R U ᴮ', ['create', 'read', 'update']),
      TEACHER: cell('R ᶜ (alerts)', ['read']),
      RECEPTIONIST: cell('R ᴮ (alerts)', ['read']),
      PARENT: cell('C R U ᴼ', ['create', 'read', 'update']),
      SYSTEM: cell('R (alerts for jobs)', ['read']),
    },
  },
  {
    row: 'Consents',
    tokens: ['consent'],
    cells: {
      // consent:export and consent:create are DISC-015 residue.
      OWNER: cell('R ᵀ E', ['read'], ['consent:export']),
      BRANCH_MANAGER: cell('R U ᴮ', ['read', 'update']),
      TEACHER: cell('R ᶜ', ['read']),
      RECEPTIONIST: cell('C R U ᴮ', ['read', 'update'], ['consent:create']),
      PARENT: cell('R U ᴼ', ['read', 'update']),
      SYSTEM: cell('R', ['read']),
    },
  },
  {
    row: 'Child documents',
    tokens: ['document'],
    cells: {
      OWNER: cell('C R U D ᵀ E', ['create', 'read', 'update', 'delete', 'export']),
      BRANCH_MANAGER: cell('C R U D ᴮ', ['create', 'read', 'update', 'delete']),
      RECEPTIONIST: cell('C R U ᴮ', ['create', 'read', 'update']),
      PARENT: cell('C R ᴼ', ['create', 'read']),
    },
  },
  {
    row: 'Attendance days/events',
    tokens: ['attendance'],
    cells: {
      OWNER: cell('R ᵀ E', ['read'], ['attendance:export']),
      // The `· A (amendments)` half is the amendment approval, §2.6.
      BRANCH_MANAGER: cell('R ᴮ · A (amendments)', ['read', 'approve']),
      TEACHER: cell('C R ᶜ', ['create', 'read']),
      RECEPTIONIST: cell('C R ᴮ', ['create', 'read']),
      ACCOUNTANT: cell('R ᵀ', ['read']),
      PARENT: cell('R ᴼ', ['read']),
      SYSTEM: cell('C (day-close job) R', ['create', 'read']),
    },
  },
  {
    row: 'Attendance amendments',
    tokens: ['attendance'],
    cells: {
      // C on this row is the §2.4 special `attendance:amend`, not a create.
      OWNER: cell('R ᵀ', ['read']),
      BRANCH_MANAGER: cell('C A ᴮ', ['amend', 'approve']),
      TEACHER: cell('C ᶜ (request only)', ['amend']),
      RECEPTIONIST: cell('C ᴮ (request only)', ['amend']),
    },
  },
  {
    row: 'Activity entries',
    tokens: ['activity'],
    cells: {
      OWNER: cell('R ᵀ', ['read']),
      BRANCH_MANAGER: cell('R ᴮ', ['read']),
      // `activity:delete` exists in §2.7 but no role holds D here — the reverse
      // discrepancy from DISC-015. The code stays, ungranted.
      TEACHER: cell('C R U ᴼᶜ (until report approval)', ['create', 'read', 'update']),
      RECEPTIONIST: cell('R ᴮ', ['read']),
      PARENT: cell('R ᴼ (published only)', ['read']),
      SYSTEM: cell('R', ['read']),
    },
  },
  {
    row: 'Daily reports',
    tokens: ['report'],
    cells: {
      OWNER: cell('R ᵀ E', ['read'], ['report:export']),
      BRANCH_MANAGER: cell('R ᴮ · A', ['read', 'approve']),
      TEACHER: cell('R U A ᶜ (approve = publish gate)', ['read', 'update', 'approve']),
      RECEPTIONIST: cell('R ᴮ', ['read']),
      PARENT: cell('R ᴼ (published)', ['read']),
      // No endpoint creates a daily report; the day-close job does. DISC-023.
      SYSTEM: cell('C (draft trigger)', [], ['report:create']),
    },
  },
  {
    row: 'Medication authorizations',
    tokens: ['med-auth'],
    cells: {
      OWNER: cell('R ᵀ', ['read']),
      BRANCH_MANAGER: cell('C R U A ᴮ', ['create', 'read', 'approve'], ['med-auth:update']),
      TEACHER: cell('R ᶜ', ['read']),
      RECEPTIONIST: cell('C R ᴮ', ['create', 'read']),
      PARENT: cell('C R ᴼ', ['create', 'read']),
      SYSTEM: cell('R (expiry job)', ['read']),
    },
  },
  {
    row: 'Medication administrations',
    tokens: ['med-admin'],
    cells: {
      OWNER: cell('R ᵀ', ['read']),
      BRANCH_MANAGER: cell('R ᴮ', ['read']),
      TEACHER: cell('C R ᶜ', ['create', 'read']),
      PARENT: cell('R ᴼ', ['read']),
    },
  },
  {
    row: 'Incidents',
    tokens: ['incident'],
    cells: {
      OWNER: cell('R ᵀ E', ['read'], ['incident:export']),
      BRANCH_MANAGER: cell('C R U A ᴮ', ['create', 'read', 'update', 'approve']),
      TEACHER: cell('C R ᴼᶜ', ['create', 'read']),
      RECEPTIONIST: cell('C R ᴮ', ['create', 'read']),
      PARENT: cell('R ᴼ (own child, approved)', ['read']),
      SYSTEM: cell('R', ['read']),
    },
  },
  {
    row: 'Media assets',
    tokens: ['media'],
    cells: {
      OWNER: cell('R D ᵀ', ['read', 'delete']),
      BRANCH_MANAGER: cell('R D ᴮ', ['read', 'delete']),
      TEACHER: cell('C R ᶜ', ['create', 'read']),
      RECEPTIONIST: cell('C R ᴮ', ['create', 'read']),
      PARENT: cell('R ᴼ (consented)', ['read']),
      SYSTEM: cell('C (processing) R D (lifecycle)', ['create', 'read', 'delete']),
    },
  },
  {
    row: 'Fee plans / components / discounts',
    // One row, one token: §2.11 gives components and discounts no code.
    tokens: ['fee-plan'],
    cells: {
      OWNER: cell('C R U Ar ᵀ · A', ['create', 'read', 'update', 'archive', 'approve']),
      BRANCH_MANAGER: cell('R ᴮ', ['read']),
      RECEPTIONIST: cell('R ᴮ (assigned plan names)', ['read']),
      ACCOUNTANT: cell('C R U ᵀ', ['create', 'read', 'update']),
      SYSTEM: cell('R', ['read']),
    },
  },
  {
    row: 'Fee assignments',
    tokens: ['fee-assignment'],
    cells: {
      OWNER: cell('C R U ᵀ', ['create', 'read', 'update']),
      BRANCH_MANAGER: cell('R ᴮ', ['read']),
      RECEPTIONIST: cell('R ᴮ', ['read']),
      ACCOUNTANT: cell('C R U ᵀ', ['create', 'read', 'update']),
      PARENT: cell("R ᴼ (own child's plan)", ['read']),
      SYSTEM: cell('R', ['read']),
    },
  },
  {
    row: 'Invoices',
    tokens: ['invoice'],
    cells: {
      // invoice:export and invoice:approve are DISC-015 residue.
      OWNER: cell('R ᵀ E · A (manual discount)', ['read'], ['invoice:export', 'invoice:approve']),
      BRANCH_MANAGER: cell('R ᴮ', ['read']),
      RECEPTIONIST: cell('R ᴮ (balance status only)', ['read']),
      // `issue` is the §2.4 named special, written out in the cell itself.
      ACCOUNTANT: cell('C R U(draft) ᵀ · issue', ['create', 'read', 'update', 'issue']),
      PARENT: cell('R ᴼ', ['read']),
      SYSTEM: cell('C (cycle job) U (overdue)', ['create', 'update']),
    },
  },
  {
    row: 'Payments',
    tokens: ['payment'],
    cells: {
      OWNER: cell('R ᵀ E', ['read'], ['payment:export']),
      BRANCH_MANAGER: cell('R ᴮ', ['read']),
      RECEPTIONIST: cell('C R ᴮ (cash receipt)', ['create', 'read']),
      ACCOUNTANT: cell('C R ᵀ', ['create', 'read']),
      PARENT: cell('R ᴼ (receipts)', ['read']),
    },
  },
  {
    row: 'Credit notes',
    tokens: ['credit-note'],
    cells: {
      // credit-note:read and :approve are DISC-015 residue.
      OWNER: cell('R ᵀ · A', [], ['credit-note:read', 'credit-note:approve']),
      ACCOUNTANT: cell('C R ᵀ', ['create'], ['credit-note:read']),
      PARENT: cell('R ᴼ', [], ['credit-note:read']),
    },
  },
  {
    row: 'Staff members & assignments',
    // No §2 endpoints at all, so no tokens and no grants. The largest DISC-015
    // residue item; the whole row waits on a contract decision.
    tokens: [],
    cells: {
      OWNER: cell('C R U D Ar ᵀ', [], ['staff:*']),
      BRANCH_MANAGER: cell('C R U ᴮ', [], ['staff:*']),
      TEACHER: cell('R ᴼ', [], ['staff:*']),
      RECEPTIONIST: cell('R ᴮ (roster)', [], ['staff:*']),
      SYSTEM: cell('R (ratio jobs)', [], ['staff:*']),
    },
  },
  {
    row: 'Conversations & messages',
    tokens: ['message'],
    cells: {
      OWNER: cell('R ᵀ (metadata; content on incident escalation, audited)', ['read']),
      BRANCH_MANAGER: cell('R ᴮ (same rule)', ['read']),
      TEACHER: cell('C R ᶜ (assigned-parent threads)', ['create', 'read']),
      RECEPTIONIST: cell('C R ᴮ', ['create', 'read']),
      PARENT: cell('C R ᴼ', ['create', 'read']),
      SYSTEM: cell('C (system messages)', ['create']),
    },
  },
  {
    row: 'Announcements',
    tokens: ['announcement'],
    cells: {
      OWNER: cell('C R U D ᵀ · A', ['create', 'read', 'update', 'delete', 'approve']),
      BRANCH_MANAGER: cell('C R U ᴮ · A', ['create', 'read', 'update', 'approve']),
      TEACHER: cell('C ᶜ (draft, BM approves)', ['create']),
      RECEPTIONIST: cell('R ᴮ', ['read']),
      PARENT: cell('R ᴼ (audience)', ['read']),
    },
  },
  {
    row: 'Notifications & preferences',
    tokens: ['notification'],
    cells: {
      OWNER: cell('R ᵀ (delivery stats)', ['read']),
      BRANCH_MANAGER: cell('R ᴮ', ['read']),
      TEACHER: cell('R U ᴼ (own prefs)', ['read', 'update']),
      RECEPTIONIST: cell('R U ᴼ', ['read', 'update']),
      ACCOUNTANT: cell('R U ᴼ', ['read', 'update']),
      PARENT: cell('R U ᴼ', ['read', 'update']),
      // No endpoint creates a notification; dispatch does. DISC-023.
      SYSTEM: cell('C R U (dispatch)', ['read', 'update'], ['notification:create']),
    },
  },
  {
    row: 'AI report drafts',
    // Drafts live under /daily-reports (§2.7), so this row reuses `report`.
    tokens: ['report'],
    cells: {
      OWNER: cell('R ᵀ', ['read']),
      BRANCH_MANAGER: cell('R ᴮ', ['read']),
      TEACHER: cell('R U ᶜ (edit before approve)', ['read', 'update']),
      SYSTEM: cell('C (generation)', [], ['report:create']),
    },
  },
  {
    row: 'AI configuration & quotas',
    tokens: ['ai'],
    cells: {
      OWNER: cell('R ᵀ', ['read']),
      // U is `ai:configure` in §2.14, not `ai:update` — see DISC-014.
      SUPER_ADMIN: cell('R U (platform plane)', ['read', 'configure']),
      SYSTEM: cell('R', ['read']),
    },
  },
  {
    row: 'Analytics / KPI dashboards',
    tokens: ['analytics'],
    cells: {
      OWNER: cell('R E ᵀ', ['read', 'export']),
      BRANCH_MANAGER: cell('R ᴮ', ['read']),
      ACCOUNTANT: cell('R ᵀ (financial)', ['read']),
      // The projection job writes snapshots; no endpoint does. DISC-023.
      SYSTEM: cell('C R U (projections)', ['read'], ['analytics:create', 'analytics:update']),
    },
  },
  {
    row: 'Audit log',
    tokens: ['audit'],
    cells: {
      OWNER: cell('R ᵀ (read-only UI) E', ['read', 'export']),
      BRANCH_MANAGER: cell('R ᴮ (operational subset)', ['read']),
      ACCOUNTANT: cell('R ᵀ (financial subset)', ['read']),
      // The audit writer inserts; no endpoint does. DISC-023.
      SYSTEM: cell('C (writer)', [], ['audit:create']),
    },
  },
  {
    row: 'Subscription & plan',
    tokens: ['subscription'],
    cells: {
      OWNER: cell('R ᵀ', ['read']),
      ACCOUNTANT: cell('R ᵀ', ['read']),
      SYSTEM: cell('R U (billing jobs)', ['read'], ['subscription:update']),
    },
    // SUPER_ADMIN's C R U on this row is the platform plane, and §2.17 gives it
    // its own three-segment code rather than a `subscription:*` one.
    extra: { SUPER_ADMIN: ['platform:subscription:update'] },
  },
  {
    row: 'Feature flags',
    // OWNER's tenant read is `organization:read` at §2.16, already granted by
    // the Organization row — there is no tenant-side `feature-flag:*` code.
    tokens: [],
    cells: {
      OWNER: cell('R ᵀ (own overrides)', []),
      SUPER_ADMIN: cell('C R U D (platform)', []),
    },
    extra: {
      SUPER_ADMIN: [
        'platform:flags:create',
        'platform:flags:read',
        'platform:flags:update',
        'platform:flags:delete',
      ],
    },
  },
  {
    row: 'Tenant exports',
    // Tenant-side `tenant-export:*` is DISC-015 residue; the platform side has
    // `platform:export` at §2.17.
    tokens: [],
    cells: {
      OWNER: cell(
        'C R ᵀ (request) · A',
        [],
        ['tenant-export:create', 'tenant-export:read', 'tenant-export:approve'],
      ),
      ACCOUNTANT: cell('R ᵀ (financial exports)', [], ['tenant-export:read']),
      SUPER_ADMIN: cell('C R A (platform, offboarding)', []),
      SYSTEM: cell('C (executor)', [], ['tenant-export:create']),
    },
    extra: { SUPER_ADMIN: ['platform:export'] },
  },
  {
    row: 'Break-glass grants',
    tokens: [],
    cells: {
      // OWNER's R is `breakglass:read`, DISC-015 residue.
      OWNER: cell('R ᵀ (notified, sees history)', [], ['breakglass:read']),
      SUPER_ADMIN: cell('C (request) R', []),
    },
    extra: { SUPER_ADMIN: ['breakglass:request'] },
  },
  {
    row: 'Platform plane operations',
    // Not a §3 row. §2.17's tenant-lifecycle and health codes have no matrix
    // row of their own, but they are SUPER_ADMIN's ordinary standing grants and
    // the endpoints exist. Listed separately so the gap is visible rather than
    // smuggled into a row above. Registered with DISC-023.
    tokens: [],
    cells: {
      SUPER_ADMIN: cell('(no §3 row — §2.17 endpoints)', []),
    },
    extra: {
      SUPER_ADMIN: [
        'platform:tenant:create',
        'platform:tenant:read',
        'platform:tenant:update',
        'platform:read',
      ],
    },
  },
];

/**
 * Every (role, permission) pair the matrix implies, plus the cells that decoded
 * to no code.
 *
 * Deduplicated: several rows legitimately map to the same token — "Daily
 * reports" and "AI report drafts" both to `report`, "Attendance days/events"
 * and "Attendance amendments" both to `attendance` — and `role_permissions` has
 * `unique(role_id, permission_id)`.
 */
export function derivePairs(knownCodes) {
  const known = new Set(knownCodes);
  const pairs = new Map();
  const unmapped = [];

  for (const entry of MATRIX) {
    for (const [role, c] of Object.entries(entry.cells)) {
      for (const action of c.actions) {
        for (const token of entry.tokens) {
          const code = `${token}:${action}`;
          if (!known.has(code)) {
            unmapped.push({ row: entry.row, role, code, reason: 'not in the contract map' });
            continue;
          }
          pairs.set(`${role}\u0000${code}`, { role, code, row: entry.row });
        }
      }
      for (const code of c.unmapped ?? []) {
        unmapped.push({ row: entry.row, role, code, reason: 'no API Contract §2 endpoint' });
      }
    }
    for (const [role, codes] of Object.entries(entry.extra ?? {})) {
      for (const code of codes) {
        if (!known.has(code)) {
          unmapped.push({ row: entry.row, role, code, reason: 'not in the contract map' });
          continue;
        }
        pairs.set(`${role}\u0000${code}`, { role, code, row: entry.row });
      }
    }
  }

  return {
    pairs: [...pairs.values()].sort(
      (a, b) => a.role.localeCompare(b.role) || a.code.localeCompare(b.code),
    ),
    unmapped,
  };
}
