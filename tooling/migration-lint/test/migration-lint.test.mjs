/**
 * KF-S0-CI-003 — migration linter assertions.
 *
 * Per pre-adjudicated decision D-6 this uses the Node 22 built-in test runner
 * (`node --test`). No test framework is installed, and none is authorized for
 * this task — adding one would be a DECISION REQUIRED escalation (workflow §4
 * rule 4).
 *
 * The linter is asserted through its COMMAND-LINE SURFACE — real process, real
 * exit code, real stdout — not by importing its internals. The acceptance
 * criteria are written in CI language ("fails CI naming the table"), and a CI
 * gate is its exit code. A test that imported a rule function could pass while
 * the gate exited 0, which is precisely the class of defect this rework fixes.
 *
 * Run: pnpm test:migration-lint
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const lintDir = path.resolve(here, '..');
const repoRoot = path.resolve(lintDir, '..', '..');
const LINT = path.join(lintDir, 'lint.mjs');
const fixturesDir = path.join(lintDir, '__fixtures__');

/** Fixtures are addressed by their numeric prefix so renames stay cheap. */
const fixture = (prefix) => {
  const hit = fs.readdirSync(fixturesDir).find((f) => f.startsWith(`${prefix}-`));
  assert.ok(hit, `no fixture with prefix ${prefix}`);
  return path.join(fixturesDir, hit);
};

/** Runs the gate exactly as CI would, and reports what CI would see. */
function run(args, cwd = repoRoot) {
  const r = spawnSync(process.execPath, [LINT, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

const lintFixture = (prefix, extra = []) => run(['--file', fixture(prefix), ...extra]);

/**
 * A throwaway repository root: a migration directory holding the named
 * fixtures, plus a model manifest with the given table sets.
 *
 * The manifest cross-check cannot be exercised against the real repository —
 * its manifest is empty until KF-S0-API-003, and the rule is inert by design
 * while it is. Rather than weaken the rule to make it testable, the test builds
 * the world the rule is meant to police.
 */
function workspace(fixturePrefixes, { scoped = [], global = [] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kf-migration-lint-'));
  const migrations = path.join(dir, 'apps', 'api', 'prisma', 'migrations');
  const tenancy = path.join(dir, 'apps', 'api', 'src', 'shared-kernel', 'tenancy');
  fs.mkdirSync(migrations, { recursive: true });
  fs.mkdirSync(tenancy, { recursive: true });

  for (const p of fixturePrefixes) {
    const src = fixture(p);
    fs.copyFileSync(src, path.join(migrations, path.basename(src)));
  }

  const set = (names) => names.map((n) => `  '${n}',`).join('\n');
  fs.writeFileSync(
    path.join(tenancy, 'model-manifest.generated.ts'),
    [
      '// GENERATED — test double for the migration linter.',
      "export const TENANT_FIELD = 'tenantId' as const;",
      'export const TENANT_SCOPED_MODELS: ReadonlySet<string> = new Set([]);',
      'export const GLOBAL_MODELS: ReadonlySet<string> = new Set([]);',
      `export const TENANT_SCOPED_TABLES: ReadonlySet<string> = new Set([\n${set(scoped)}\n]);`,
      `export const GLOBAL_TABLES: ReadonlySet<string> = new Set([\n${set(global)}\n]);`,
      '',
    ].join('\n'),
  );
  return dir;
}

const cleanup = (dir) => fs.rmSync(dir, { recursive: true, force: true });

// ===========================================================================
// The four original acceptance criteria. Previously demonstrated by hand;
// rework AC1 requires them to be demonstrated by this suite instead.
// ===========================================================================

test('AC1 — a tenant table with no policy annotation fails, naming the table', () => {
  const { code, out } = lintFixture('01');

  assert.equal(code, 1, 'the gate must fail');
  assert.match(out, /fixture_unannotated/, 'the failure must name the table');
  assert.match(out, /\[policy-class-missing\]/, 'the failure must name the rule');
  assert.match(out, /TENANT_STANDARD, TENANT_OR_PLATFORM, SELF_TENANT_ROOT, GLOBAL_READ/);
  assert.doesNotMatch(out, /PASS/);
});

test('AC1 — a tenant table with no CREATE POLICY fails, naming the table', () => {
  const { code, out } = lintFixture('05');

  assert.equal(code, 1);
  assert.match(out, /fixture_missing_policy/);
  assert.match(out, /\[policy-missing\]/);
});

test('AC2 — a table missing FORCE ROW LEVEL SECURITY fails', () => {
  const { code, out } = lintFixture('04');

  assert.equal(code, 1);
  assert.match(out, /fixture_missing_force/);
  assert.match(out, /\[rls-not-forced\]/);
  assert.match(out, /owner bypasses every policy/, 'the message must say why FORCE matters');
});

test('AC3 — a non-tenant-led index is a WARNING that still fails the run', () => {
  const { code, out } = lintFixture('06');

  assert.equal(code, 1, 'warnings fail too — a warning nobody must fix is a comment');
  assert.match(out, /WARNING\s+fixture_bad_index\s+\[index-not-tenant-led\]/);
  assert.match(out, /0 error\(s\), 1 warning\(s\)/, 'severity stays visually distinct');
});

test('AC4 — compliant migrations pass', () => {
  for (const prefix of ['07', '08', '09']) {
    const { code, out } = lintFixture(prefix);
    assert.equal(code, 0, `fixture ${prefix} must pass, got:\n${out}`);
    assert.match(out, /PASS/);
    assert.match(out, /0 error\(s\), 0 warning\(s\)/);
  }
});

// ===========================================================================
// The class-aware model. These two are the reason the rules are per-class and
// not a blanket "every table needs tenant_id and FORCE". Reintroducing a
// blanket rule would fail all six of M-001's reference tables and the single
// most important table in the schema, so both cases are pinned.
// ===========================================================================

test('GLOBAL_READ passes without FORCE — the T-1 trap, ADR-010 §7', () => {
  const { code, out } = lintFixture('08');
  assert.equal(code, 0, out);
  assert.doesNotMatch(out, /rls-not-forced/);
});

test('SELF_TENANT_ROOT passes without a tenant_id column — L-6, ADR-010 §7', () => {
  const { code, out } = lintFixture('09');
  assert.equal(code, 0, out);
  assert.doesNotMatch(out, /tenant-id-missing/);
});

test('an unrecognised policy class is an error, not a pass', () => {
  const { code, out } = lintFixture('02');
  assert.equal(code, 1);
  assert.match(out, /\[policy-class-unknown\]/);
  assert.match(out, /TENANT_ISH/, 'the message must quote what was written');
});

// ===========================================================================
// F-1 — an annotation on the same line as CREATE TABLE made the table invisible
// ===========================================================================

test('F-1 — a same-line annotation cannot hide the table (rework AC2)', () => {
  const { code, out } = lintFixture('12');

  assert.equal(code, 1, 'a tenant table with no RLS at all must never exit 0');
  assert.match(out, /tables inspected: 1/, 'the CREATE TABLE must be counted');
  assert.match(out, /fixture_sameline_leak/, 'the table must be named');
  assert.match(out, /\[policy-class-missing\]/, 'the table is unannotated');
  assert.match(out, /\[annotation-dangling\]/, 'the misplaced annotation is reported too');
  assert.doesNotMatch(out, /PASS/);
});

// ===========================================================================
// F-2 — a stale annotation was adopted by an unrelated later table
// ===========================================================================

test('F-2 — a stale annotation does not re-classify a later table (rework AC3)', () => {
  const { code, out } = lintFixture('13');

  assert.equal(code, 1);
  assert.match(out, /fixture_forgotten_tenant/, 'the table must be named');
  assert.match(out, /\[annotation-dangling\]/, 'a dangling annotation is itself an ERROR');
  assert.match(
    out,
    /\[policy-class-missing\]/,
    'the tenant table must NOT inherit the stale GLOBAL_READ class',
  );
  assert.doesNotMatch(out, /PASS/);
});

test('F-2 — a dangling annotation is an ERROR, never a silent discard', () => {
  const { out } = lintFixture('13');
  // Match the bracketed rule id, not the bare slug — the fixture's own filename
  // contains the slug and would otherwise be counted from the "at …" lines.
  const dangling = out.split('\n').filter((l) => l.includes('[annotation-dangling]'));
  assert.equal(dangling.length, 1);
  assert.match(dangling[0], /ERROR/, 'severity must be ERROR — a silent discard recreates F-1');
});

// ===========================================================================
// F-3 — resolution scope. Founder-approved 2026-08-31: the CORPUS rule.
// ===========================================================================

test('F-3 — obligations may be met by a later migration (corpus rule, rework AC4)', () => {
  const { code, out } = lintFixture('10');

  assert.equal(
    code,
    0,
    `a table secured by a sibling migration must pass under the corpus rule, got:\n${out}`,
  );
  assert.match(out, /fixture_split_table|PASS/);
  assert.doesNotMatch(out, /rls-not-enabled/);
  assert.doesNotMatch(out, /rls-not-forced/);
  assert.doesNotMatch(out, /policy-missing/);
  assert.doesNotMatch(out, /index-not-tenant-led/);
});

test('F-3 — the corpus is wider than the report scope', () => {
  const { out } = lintFixture('10');
  const corpus = /files in corpus: (\d+)/.exec(out);
  assert.ok(corpus, 'the run must state its corpus size');
  assert.ok(
    Number(corpus[1]) > 1,
    'narrowing the report scope must not narrow the resolution scope',
  );
  assert.match(out, /tables inspected: 1/, 'but only the named file is reported on');
});

test('F-3 — the split pair passes as a whole migration directory too', () => {
  const dir = workspace(['10', '11']);
  try {
    const { code, out } = run([], dir);
    assert.equal(code, 0, out);
    assert.match(out, /PASS/);
  } finally {
    cleanup(dir);
  }
});

// ===========================================================================
// F-4 — the manifest cross-check is a real rule now, not a NOTE
// ===========================================================================

test('F-4 — with an empty manifest the rule is inert AND says so (rework AC5)', () => {
  const { code, out } = lintFixture('07');

  assert.equal(code, 0);
  assert.match(out, /manifest declares NO tables/);
  assert.match(
    out,
    /verified nothing — it is not evidence of compliance/,
    'an empty manifest must never read as all-clear',
  );
});

test('F-4 — a tenant table absent from a populated manifest is an ERROR', () => {
  const dir = workspace(['16', '18'], { scoped: ['fixture_manifest_agreed'] });
  try {
    const { code, out } = run([], dir);
    assert.equal(code, 1, out);
    assert.match(out, /fixture_manifest_unknown/, 'the missing table must be named');
    assert.match(out, /\[manifest-table-missing\]/);
    assert.match(out, /generate\.mjs/, 'the message must name the remedy');
    assert.match(out, /cross-check ACTIVE/, 'the run must say the rule actually ran');
  } finally {
    cleanup(dir);
  }
});

test('F-4 — SELF_TENANT_ROOT listed as tenant-scoped is an ERROR citing L-6', () => {
  const dir = workspace(['17'], { scoped: ['fixture_manifest_org'] });
  try {
    const { code, out } = run([], dir);
    assert.equal(code, 1, out);
    assert.match(out, /fixture_manifest_org/);
    assert.match(out, /\[manifest-side-mismatch\]/);
    assert.match(out, /ADR-010 L-6/, 'the message must send the reader to the decision');
  } finally {
    cleanup(dir);
  }
});

test('F-4 — SQL and manifest in agreement passes', () => {
  const dir = workspace(['18'], { scoped: ['fixture_manifest_agreed'] });
  try {
    const { code, out } = run([], dir);
    assert.equal(code, 0, out);
    assert.match(out, /PASS/);
  } finally {
    cleanup(dir);
  }
});

test('F-4 — the reverse mismatch is an ERROR too', () => {
  const dir = workspace(['18'], { scoped: ['fixture_manifest_agreed', 'ghost_table'] });
  try {
    const { code, out } = run([], dir);
    assert.equal(code, 1, out);
    assert.match(out, /ghost_table/);
    assert.match(out, /\[manifest-table-uncreated\]/);
  } finally {
    cleanup(dir);
  }
});

// ===========================================================================
// F-5 — exit 0 over a scope that verified nothing
// ===========================================================================

test('F-5 — an absent default migration directory fails (rework AC6)', () => {
  const { code, out } = run([]);

  assert.equal(code, 1, 'a green required check over zero files is indistinguishable from a pass');
  assert.match(out, /Nothing was checked\. This is not a pass\./);
  assert.doesNotMatch(out, /PASS —/);
});

test('F-5 — --allow-empty is the only way an empty scope exits 0', () => {
  const { code, out } = run(['--allow-empty']);

  assert.equal(code, 0);
  assert.match(out, /--allow-empty was passed/, 'the opt-in must be visible in the output');
  assert.match(out, /Nothing was checked\. This is not a pass\./, 'and it must still say so');
  assert.doesNotMatch(out, /PASS —/, 'an empty scope never prints PASS');
});

test('F-5 — a named file that does not exist is a bad invocation, exit 2', () => {
  const { code, out } = run(['--file', 'does-not-exist.sql']);

  assert.equal(code, 2);
  assert.match(out, /do not exist/);
  assert.doesNotMatch(out, /PASS/);
});

test('F-5 — a named directory that does not exist is a bad invocation, exit 2', () => {
  const { code } = run(['--dir', 'no/such/dir']);
  assert.equal(code, 2);
});

test('F-5 — --diff without a base ref is a bad invocation, exit 2', () => {
  const { code, out } = run(['--diff']);
  assert.equal(code, 2);
  assert.match(out, /needs a base ref/);
});

test('F-5 — files with no CREATE TABLE are not a pass', () => {
  const { code, out } = lintFixture('11');

  assert.equal(code, 1);
  assert.match(out, /tables inspected: 0/);
  assert.match(out, /This is not a pass/);
  assert.doesNotMatch(out, /PASS —/);
});

// ===========================================================================
// F-6 — tenant_id had to start a line
// ===========================================================================

test('F-6 — a single-line column list is recognised', () => {
  const { code, out } = lintFixture('14');

  assert.equal(code, 0, `an inline column list must not produce tenant-id-missing:\n${out}`);
  assert.doesNotMatch(out, /tenant-id-missing/);
});

test('F-6 — REFERENCES other(tenant_id) is not a tenant column', () => {
  const { code, out } = lintFixture('03');

  assert.equal(code, 1);
  assert.match(out, /fixture_no_tenant_column/);
  assert.match(
    out,
    /\[tenant-id-missing\]/,
    'a nested REFERENCES must not make the table look compliant',
  );
});

// ===========================================================================
// F-7 — index clause variants produced false warnings
// ===========================================================================

test('F-7 — USING btree, CONCURRENTLY, quoted, partial, PK and ALTER constraint all pass', () => {
  const { code, out } = lintFixture('15');

  assert.equal(code, 0, `no index form here should warn, got:\n${out}`);
  assert.match(out, /tables inspected: 6/, 'all six index forms must be exercised');
  assert.doesNotMatch(out, /index-not-tenant-led/);
});

test('F-7 — widening the matcher did not switch the rule off', () => {
  const { code, out } = lintFixture('06');
  assert.equal(code, 1, 'a genuinely wrong index order must still be caught');
  assert.match(out, /index-not-tenant-led/);
});

// ===========================================================================
// F-8 — dependent rules fired after a fatal one
// ===========================================================================

test('F-8 — the tenant-led-index rule is suppressed when tenant_id is missing', () => {
  const { out } = lintFixture('03');

  assert.match(out, /1 error\(s\), 0 warning\(s\)/, 'exactly one finding, not two');
  assert.doesNotMatch(
    out,
    /index-not-tenant-led/,
    'do not ask for an index on a column that does not exist',
  );
});

// ===========================================================================
// Fixture hygiene — rework AC9
// ===========================================================================

test('every fixture states what it proves', () => {
  const files = fs.readdirSync(fixturesDir).filter((f) => f.endsWith('.sql'));
  assert.ok(files.length >= 18, `expected the full fixture set, found ${files.length}`);

  for (const f of files) {
    const head = fs.readFileSync(path.join(fixturesDir, f), 'utf8').split('\n')[0];
    assert.match(head, /^-- FIXTURE — /, `${f} must open with a "-- FIXTURE — " header line`);
  }
});
