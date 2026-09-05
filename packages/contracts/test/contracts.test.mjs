/**
 * KF-S0-CONTRACT-001 — contract assertions.
 *
 * Per pre-adjudicated decision D-6 this uses the Node 22 built-in test runner
 * (`node --test`). No test framework is installed.
 *
 * SPEC LINTING (task Testing Requirements: "spectral or equivalent"). The
 * "equivalent" is taken, and here is the recorded reason. Structural validation
 * already runs: `openapi-typescript` bundles the Redocly validator, and
 * `generate.mjs` fails on an invalid document or an unresolvable `$ref` — it
 * caught both while this package was being written. What spectral would add on
 * top is a generic style ruleset, and the rules this contract actually needs
 * are not generic: every operation must carry `x-permission-code`, every code
 * must exist in `permissions.ts`, every error code named in a path must exist
 * in `errors.ts`. Those are the acceptance criteria, they are asserted below,
 * and none of them is expressible as a stock spectral rule. Installing a
 * linter to check rules it does not have would be a dependency for the
 * appearance of coverage.
 *
 * Run: pnpm --filter @kf/contracts test   (turbo runs ^build first — O-11)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  isPermissionCode,
  ALL_ERROR_CODES,
  ERRORS,
  errorTypeUri,
  ENUMS,
  ENUMS_PENDING_DEFINITION,
  ALL_DOMAIN_EVENTS,
  isDomainEventName,
  OPERATIONS,
} from '../dist/index.js';

import { readOperations, readReferencedErrorCodes } from '../scripts/spec-reader.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, '..');

/**
 * Sentinels, not permission codes. API Contract §2.1's `Perm` column writes
 * `public`, `public (cookie)`, `any authenticated` and `any`; the spec
 * normalises those four to two. They are declarations that no code applies —
 * which is a different thing from an operation that forgot to declare one, and
 * that difference is the whole point of forbidding omission.
 */
const SENTINELS = new Set(['public', 'authenticated']);

// --- the rules, as functions, so the negative fixtures exercise the same code
//     path the real spec does rather than a paraphrase of it -----------------

/** AC2: an operation with no `x-permission-code`, or an unknown one. */
function permissionViolations(operations) {
  const problems = [];
  for (const op of operations) {
    const where = `${path.basename(op.file ?? '?')}:${op.line ?? '?'} ${op.operationId ?? '(no operationId)'}`;
    if (!op.permissionCode) {
      problems.push(`${where} — no x-permission-code`);
      continue;
    }
    if (SENTINELS.has(op.permissionCode)) continue;
    if (!isPermissionCode(op.permissionCode)) {
      problems.push(`${where} — x-permission-code "${op.permissionCode}" is not in permissions.ts`);
    }
  }
  return problems;
}

/** AC3: an error code written into the spec that the catalog does not define. */
function errorCodeViolations(referenced) {
  const known = new Set(ALL_ERROR_CODES);
  return [...referenced.entries()]
    .filter(([code]) => !known.has(code))
    .map(([code, where]) => `${where} — "${code}" is not in errors.ts`);
}

/** A throwaway `paths/` directory holding one hand-written operation. */
function specFixture(yaml) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kf-contracts-'));
  fs.writeFileSync(path.join(dir, 'fixture.yaml'), yaml);
  return dir;
}
const cleanup = (dir) => fs.rmSync(dir, { recursive: true, force: true });

// ===========================================================================
// Acceptance criterion 1 — codegen produces types with zero TS errors
// ===========================================================================

test('AC1 — the committed generated output matches the spec', () => {
  const result = spawnSync(process.execPath, ['scripts/generate.mjs', '--check'], {
    cwd: pkgRoot,
    encoding: 'utf8',
  });

  assert.equal(
    result.status,
    0,
    `generate --check must pass; the spec and the generated files disagree:\n${result.stdout}${result.stderr}`,
  );
});

test('AC1 — the generated types compiled, and this suite is running against them', () => {
  // The import at the top of this file IS the assertion: `dist/` only exists
  // because `tsc -b` succeeded over the generated types, and turbo runs
  // ^build before test (KF-S0-INFRA-004 O-11). A separate `tsc` spawn here
  // would just be the same check, slower.
  assert.ok(fs.existsSync(path.join(pkgRoot, 'dist', 'index.js')));
  assert.ok(fs.existsSync(path.join(pkgRoot, 'src', 'generated', 'api-types.ts')));
  assert.ok(OPERATIONS.length > 0, 'the operation manifest must not be empty');
});

// ===========================================================================
// Acceptance criterion 2 — x-permission-code is mandatory
// ===========================================================================

test('AC2 — every operation in the spec declares x-permission-code', () => {
  const operations = readOperations(path.join(pkgRoot, 'paths'));
  assert.deepEqual(permissionViolations(operations), []);
});

test('AC2 — an operation WITHOUT x-permission-code fails', () => {
  const dir = specFixture(
    [
      'widgets:',
      '  get:',
      '    operationId: listWidgets',
      '    summary: An operation that forgot its permission code',
      '    responses:',
      "      '200':",
      '        description: ok',
      '',
    ].join('\n'),
  );
  try {
    const problems = permissionViolations(readOperations(dir));
    assert.equal(problems.length, 1, 'exactly one violation expected');
    assert.match(problems[0], /listWidgets/, 'the failure must name the operation');
    assert.match(problems[0], /no x-permission-code/);
  } finally {
    cleanup(dir);
  }
});

test('AC2 — an operation with an INVENTED permission code fails', () => {
  // The failure mode the map exists to prevent: a plausible-looking code that
  // no approved document authorises.
  const dir = specFixture(
    [
      'widgets:',
      '  post:',
      '    operationId: createWidget',
      '    x-permission-code: widget:create',
      '    responses:',
      "      '201':",
      '        description: created',
      '',
    ].join('\n'),
  );
  try {
    const problems = permissionViolations(readOperations(dir));
    assert.equal(problems.length, 1);
    assert.match(problems[0], /widget:create/);
    assert.match(problems[0], /not in permissions\.ts/);
  } finally {
    cleanup(dir);
  }
});

test('AC2 — the sentinels are accepted, and only those two', () => {
  const ok = specFixture(
    [
      'a:',
      '  get:',
      '    operationId: publicOp',
      '    x-permission-code: public',
      '    responses:',
      "      '200':",
      '        description: ok',
      'b:',
      '  get:',
      '    operationId: sessionOp',
      '    x-permission-code: authenticated',
      '    responses:',
      "      '200':",
      '        description: ok',
      '',
    ].join('\n'),
  );
  const bad = specFixture(
    [
      'c:',
      '  get:',
      '    operationId: vagueOp',
      '    x-permission-code: any',
      '    responses:',
      "      '200':",
      '        description: ok',
      '',
    ].join('\n'),
  );
  try {
    assert.deepEqual(permissionViolations(readOperations(ok)), []);
    assert.equal(
      permissionViolations(readOperations(bad)).length,
      1,
      '"any" is §2 prose, not a sentinel — normalising it is the spec author\'s job, not the gate\'s',
    );
  } finally {
    cleanup(ok);
    cleanup(bad);
  }
});

// ===========================================================================
// Acceptance criterion 3 — error codes must exist in the catalog
// ===========================================================================

test('AC3 — every error code named in the spec exists in errors.ts', () => {
  const referenced = readReferencedErrorCodes([
    path.join(pkgRoot, 'paths'),
    path.join(pkgRoot, 'components'),
  ]);
  assert.ok(
    referenced.size > 10,
    'the spec must actually name error codes for this to mean anything',
  );
  assert.deepEqual(errorCodeViolations(referenced), []);
});

test('AC3 — an error code absent from the catalog fails', () => {
  const dir = specFixture(
    [
      'a:',
      '  get:',
      '    operationId: op',
      '    x-permission-code: public',
      '    responses:',
      "      '418':",
      '        description: TEAPOT_UNAVAILABLE happens here',
      '',
    ].join('\n'),
  );
  try {
    const problems = errorCodeViolations(readReferencedErrorCodes([dir]));
    assert.equal(problems.length, 1);
    assert.match(problems[0], /TEAPOT_UNAVAILABLE/);
    assert.match(problems[0], /not in errors\.ts/);
  } finally {
    cleanup(dir);
  }
});

// ===========================================================================
// The crude reader is checked by the real parser
// ===========================================================================

test('the spec reader finds exactly the operations openapi-typescript found', () => {
  // scripts/spec-reader.mjs is line-oriented, not a YAML parser. A reader that
  // silently skipped an operation would make AC2 vacuous — the gate would pass
  // because it never looked. openapi-typescript's `operations` interface comes
  // from the Redocly resolver over the same files, so it is an independent
  // witness.
  const generated = fs.readFileSync(path.join(pkgRoot, 'src', 'generated', 'api-types.ts'), 'utf8');
  const block = generated.slice(generated.indexOf('export interface operations'));
  const fromParser = [...block.matchAll(/^ {4}(\w+): \{$/gm)].map((m) => m[1]).sort();
  const fromReader = OPERATIONS.map((op) => op.operationId).sort();

  assert.ok(fromParser.length > 0, 'could not read operation ids out of the generated types');
  assert.deepEqual(fromReader, fromParser);
});

// ===========================================================================
// The map itself — the assertions that stop AC2 passing vacuously
// ===========================================================================

test('the permission map is non-empty and matches the derivation table', () => {
  const doc = fs.readFileSync(path.join(pkgRoot, 'PERMISSIONS_DERIVATION.md'), 'utf8');

  assert.ok(ALL_PERMISSIONS.length > 100, 'the seeded paths use few codes; the map must be whole');
  assert.equal(ALL_PERMISSIONS.length, 107);
  assert.ok(
    doc.includes(`**${ALL_PERMISSIONS.length}**`),
    'the derivation table must state the same count as the map',
  );
});

test('every code in the map appears in the derivation table', () => {
  const doc = fs.readFileSync(path.join(pkgRoot, 'PERMISSIONS_DERIVATION.md'), 'utf8');
  const untraceable = ALL_PERMISSIONS.filter((code) => !doc.includes(`\`${code}\``));
  assert.deepEqual(untraceable, [], 'a code with no document row cannot be reviewed');
});

test('no permission code carries scope — RBAC §2.3 / §2.4', () => {
  // `child:read:branch` is the shape this forbids. Scope is a separate stage
  // of the pipeline; putting it in the code doubles the map and makes the
  // guard's contract unreadable.
  const twoSegment = /^[a-z][a-z-]*:[a-z-]+$/;
  const platformThreeSegment = /^platform:[a-z-]+:[a-z-]+$/;

  for (const code of ALL_PERMISSIONS) {
    assert.ok(
      twoSegment.test(code) || platformThreeSegment.test(code),
      `"${code}" is neither {resource}:{action} nor an approved platform:{resource}:{action}`,
    );
    assert.doesNotMatch(code, /[ᵀᴮᶜᴼ]/, `"${code}" carries a scope superscript`);
  }
});

test('the platform plane is the only three-segment family', () => {
  const threeSegment = ALL_PERMISSIONS.filter((code) => code.split(':').length === 3);
  // Eight, not ten: `platform:read` and `platform:export` are ordinary
  // two-segment codes that happen to live on the platform plane.
  assert.equal(threeSegment.length, 8);
  assert.ok(
    threeSegment.every((code) => code.startsWith('platform:')),
    'DISC-014 covers platform only; a second three-segment family would be a new deviation',
  );
});

test('isPermissionCode narrows, and rejects a near-miss', () => {
  assert.ok(isPermissionCode(PERMISSIONS.CHILD_READ));
  assert.equal(isPermissionCode('child:reed'), false);
  assert.equal(isPermissionCode('children:read'), false, 'the token is singular');
  assert.equal(isPermissionCode('medical-record:read'), false, 'the contract writes medical:*');
});

// ===========================================================================
// Error catalog
// ===========================================================================

test('the whole §4 catalog is present', () => {
  assert.equal(ALL_ERROR_CODES.length, 46);
  for (const code of ['PERMISSION_DENIED', 'PICKUP_NOT_AUTHORIZED', 'INTERNAL_ERROR']) {
    assert.ok(ALL_ERROR_CODES.includes(code), `${code} missing from the catalog`);
  }
});

test('i18n keys are derived, never authored', () => {
  for (const code of ALL_ERROR_CODES) {
    assert.equal(
      ERRORS[code].i18nKey,
      `errors.${code.toLowerCase()}`,
      'the derivation rule in the file header must hold for every code, with no exceptions',
    );
  }
});

test('the dual-status rows carry both statuses §4 gives them', () => {
  const dual = ALL_ERROR_CODES.filter((code) => Array.isArray(ERRORS[code].status));
  // Nine: the three plan-limit codes (402/422), the three media codes
  // (415/422) and the three upstream codes (502/503).
  assert.deepEqual(dual.sort(), [
    'AI_PROVIDER_UNAVAILABLE',
    'AI_QUOTA_EXCEEDED',
    'MEDIA_QUARANTINED',
    'MEDIA_TOO_LARGE',
    'MEDIA_TYPE_UNSUPPORTED',
    'SERVICE_UNAVAILABLE',
    'STORAGE_QUOTA_EXCEEDED',
    'STORAGE_UNAVAILABLE',
    'SUBSCRIPTION_LIMIT_REACHED',
  ]);
  assert.deepEqual(ERRORS.STORAGE_QUOTA_EXCEEDED.status, [402, 422]);
  assert.deepEqual(ERRORS.MEDIA_TOO_LARGE.status, [415, 422]);
  assert.deepEqual(ERRORS.SERVICE_UNAVAILABLE.status, [502, 503]);
});

test('security events are attached only where §4 names one', () => {
  assert.equal(ERRORS.PERMISSION_DENIED.securityEvent, 'SEC-PERM-002');
  assert.equal(ERRORS.PICKUP_NOT_AUTHORIZED.securityEvent, 'SEC-SAFE-001');
  assert.equal(
    ERRORS.RESOURCE_NOT_FOUND.securityEvent,
    undefined,
    'SEC-PERM-003 fires on the cross-tenant probe, not on every 404',
  );
});

test('the problem type URI is derived from the code', () => {
  assert.equal(
    errorTypeUri('VERSION_CONFLICT'),
    'https://docs.kinderflow.app/errors/VERSION_CONFLICT',
  );
});

// ===========================================================================
// Enums
// ===========================================================================

test('all sixteen Part 8 enums are present', () => {
  assert.equal(Object.keys(ENUMS).length, 16);
  assert.ok('MediaStatus' in ENUMS, 'Part 8 writes "Media Status"; DISC-018 corrects the spelling');
  assert.equal('Media Status' in ENUMS, false);
});

test('enums with no approved member set are empty and declared as such', () => {
  assert.deepEqual([...ENUMS_PENDING_DEFINITION].sort(), [
    'NotificationChannel',
    'PlanCode',
    'SyncStatus',
  ]);
  for (const name of ENUMS_PENDING_DEFINITION) {
    assert.equal(ENUMS[name].length, 0, `${name} must stay empty until DISC-017 is answered`);
  }
});

test('the enums that could be established carry their members', () => {
  assert.deepEqual(
    [...ENUMS.ActivityType],
    ['MEAL', 'NAP', 'DIAPER', 'MOOD', 'LEARNING', 'NOTE', 'MEDICATION_ADMIN'],
  );
  assert.deepEqual([...ENUMS.AttendanceDirection], ['CHECK_IN', 'CHECK_OUT']);
  assert.deepEqual([...ENUMS.ConsentType], ['PHOTO_INTERNAL', 'PHOTO_GROUP', 'DATA_PROCESSING']);
  assert.equal(ENUMS.InvoiceStatus.length, 7);
  assert.equal(
    ENUMS.NotificationStatus.includes('DLQ'),
    false,
    'the DLQ is a destination, not a status',
  );
});

// ===========================================================================
// Domain events
// ===========================================================================

test('the §1.5 event catalog is transcribed whole', () => {
  assert.equal(ALL_DOMAIN_EVENTS.length, 45);
  assert.ok(isDomainEventName('ChildWithdrawn'));
  assert.equal(isDomainEventName('ChildWithdrawnV2'), false);
});

// ===========================================================================
// The operation manifest KF-S0-API-001 will diff decorators against
// ===========================================================================

test('every operation carries all four contract extensions', () => {
  for (const op of OPERATIONS) {
    assert.ok(op.permissionCode, `${op.operationId} has no x-permission-code`);
    assert.ok(op.rateLimitTier, `${op.operationId} has no x-rate-limit-tier`);
    assert.ok(Array.isArray(op.auditEvents), `${op.operationId} has no x-audit-events`);
    assert.ok(op.idempotency, `${op.operationId} has no x-idempotency`);
  }
});

test('the seeded scope is health plus §2.1 auth, and nothing else', () => {
  // Requirement 2 is definitions only. An operation appearing here that is not
  // health or auth means someone started Sprint 1 inside this task.
  const ids = OPERATIONS.map((op) => op.operationId).sort();
  assert.deepEqual(ids, [
    'authInvitationsAccept',
    'authLogin',
    'authLogout',
    'authMe',
    'authMfaEnroll',
    'authMfaVerify',
    'authPasswordForgot',
    'authPasswordReset',
    'authRefresh',
    'healthLive',
    'healthReady',
  ]);
});
