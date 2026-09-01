#!/usr/bin/env node
/* global console */
/**
 * Migration linter — RLS annotation gate (KF-S0-CI-003, mitigates TR-01/IR-02).
 *
 * Makes it impossible to add a tenant table without isolation. Every
 * `CREATE TABLE` must declare a policy class from the approved vocabulary
 * (Domain Model Part 6.1), and each class carries its own obligations.
 *
 *     -- @kf-rls TENANT_STANDARD
 *     CREATE TABLE children (...);
 *
 * It reads MIGRATION SQL, not Prisma models (decision D-25). That is what lets
 * it work today, before any schema exists, and it is also the more honest
 * subject: SQL is what actually reaches the database. A model can be correct
 * while the migration that ships it is not.
 *
 * ---------------------------------------------------------------------------
 * DECISION — resolution scope is the CORPUS, not the file.
 * (Finding F-3, founder-approved 2026-08-31 during the KF-S0-CI-003 rework.)
 *
 * A table's class obligations may be satisfied by ANY migration in the
 * migration root, not only by the migration that creates it. The gate models
 * the database's actual end state, so a legitimate "enable RLS on an existing
 * table" remediation migration passes instead of being blocked.
 *
 * Two scopes therefore exist, and they are not the same thing:
 *
 *   REPORT scope — the files whose tables are checked and reported on.
 *                  `--dir` walks it, `--diff` narrows it, `--file` names it.
 *   CORPUS scope — the SQL consulted to decide whether an obligation is met.
 *                  Always every `.sql` under the migration root, PLUS every
 *                  `.sql` under the directory of each report-scope file.
 *
 * The corpus is never narrowed by `--diff` or `--file`. That is what keeps
 * `--diff` usable: narrowing the report scope must never invent findings just
 * because the ENABLE/FORCE/policy statements live in an unchanged file.
 * Fixtures: `10-corpus-split-create.sql` + `11-corpus-split-secure.sql`.
 *
 * The rejected alternative was the same-file rule — obligations must be met in
 * the creating migration. Stricter and cheaper, and it matches Blueprint §4's
 * M-001…M-007 plan, which does bundle each table with its RLS. It was rejected
 * because it permanently forbids the remediation migration, and a gate that
 * blocks correct work gets switched off.
 * ---------------------------------------------------------------------------
 *
 * Usage:
 *   node tooling/migration-lint/lint.mjs                    whole migration root (default)
 *   node tooling/migration-lint/lint.mjs --dir <path>       report on a specific directory
 *   node tooling/migration-lint/lint.mjs --diff <base>      report on SQL changed since <base>
 *   node tooling/migration-lint/lint.mjs --file a.sql b.sql report on specific files
 *   node tooling/migration-lint/lint.mjs --allow-empty      an empty scope exits 0
 *
 * Whole-directory is the default deliberately (D-27): a diff-scoped default
 * would pass a repository that was already broken before the change.
 *
 * `--allow-empty` exists for KF-S0-CI-001. Before KF-S0-API-003 there are no
 * migrations at all, and CI needs a green check without the gate ever claiming
 * it verified something. CI-001 passes `--allow-empty` until API-003 lands and
 * then removes it. Without the flag an empty scope FAILS, because a green
 * required check over zero files is indistinguishable from a real pass.
 *
 * Exit codes:
 *   0  clean, and something was actually checked
 *   1  findings (ERROR or WARNING), or an empty scope without --allow-empty
 *   2  bad invocation — a named `--file`/`--dir` that does not exist, or
 *      `--diff` with no base ref. Naming a path that is not there is an
 *      operator error; the DEFAULT migration root being absent is not, because
 *      that is the expected state until KF-S0-API-003 creates it.
 *
 * See "Severity" near the bottom for why warnings also fail.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();

/** Where the real migrations will live once KF-S0-API-003 creates them. */
const DEFAULT_DIR = 'apps/api/prisma/migrations';

/** The manifest the runtime tenancy extension consumes (ADR-010). */
const MANIFEST = 'apps/api/src/shared-kernel/tenancy/model-manifest.generated.ts';

/**
 * The approved policy-class vocabulary — Domain Model Part 6.1. Exactly four.
 * An unrecognised class is an ERROR, never a pass: accepting arbitrary strings
 * would let `-- @kf-rls PROBABLY_FINE` satisfy the gate.
 *
 * Each class carries its own obligations. A blanket "every table needs
 * tenant_id" rule is wrong in two directions, and both appear in the real
 * schema: GLOBAL_READ reference tables have no tenant column at all, and
 * SELF_TENANT_ROOT (organizations) uses `id` AS the tenant discriminator.
 *
 * `manifestSide` is which set of the generated manifest the table must appear
 * in. SELF_TENANT_ROOT maps to the global set, not the tenant-scoped one —
 * that is ADR-010 L-6 verbatim: "the extension treats it as global and relies
 * on RLS alone … must not mark it tenant-scoped in the manifest". The Prisma
 * extension cannot inject a tenantId filter on a model that has no tenantId
 * field, so listing it as scoped would describe a filter that cannot exist.
 */
const POLICY_CLASSES = {
  TENANT_STANDARD: {
    tenantColumn: 'required',
    enableRls: true,
    forceRls: true,
    policy: true,
    tenantLedIndex: true,
    manifestSide: 'scoped',
    note: 'all tenant-scoped tables',
  },
  TENANT_OR_PLATFORM: {
    // audit_log and friends carry a NULLABLE tenant_id (platform actions have
    // none), so the column must exist but its nullability is not our business.
    tenantColumn: 'required',
    enableRls: true,
    forceRls: true,
    policy: true,
    tenantLedIndex: true,
    manifestSide: 'scoped',
    note: 'tenant predicate OR platform break-glass',
  },
  SELF_TENANT_ROOT: {
    // organizations: the tenant IS the row (`id = app.tenant_id`). Demanding a
    // separate tenant_id column here is the classic blanket-rule failure.
    tenantColumn: 'not-required',
    enableRls: true,
    forceRls: true,
    policy: true,
    tenantLedIndex: false, // the primary key already leads with id
    manifestSide: 'global', // ADR-010 L-6 — NOT tenant-scoped in the manifest
    note: 'organizations — id is the tenant discriminator',
  },
  GLOBAL_READ: {
    // Reference data: subscription_plans, roles, permissions, role_permissions,
    // feature_flags, prompt_versions. No tenant column exists.
    tenantColumn: 'not-required',
    enableRls: true,
    // FORCE is deliberately NOT required. FORCE removes the owner's exemption,
    // and kf_migrator owns these tables — forcing it would break the tier-1
    // seed that M-001 runs post-migrate (the same trap as finding T-1).
    forceRls: false,
    policy: true,
    tenantLedIndex: false,
    manifestSide: 'global',
    note: 'global reference data, writes platform-only',
  },
};

const CLASS_NAMES = Object.keys(POLICY_CLASSES);

// ---------------------------------------------------------------------------
// Lexing. Deliberately not a real SQL parser: migrations here are generated
// Prisma DDL plus hand-written blocks (Blueprint §4), and a full parser would
// be a large dependency for a gate that must stay obvious. No new dependency is
// authorized for this task, so the standard library does the work.
//
// What IS handled, because each one has produced a real false result:
//   · `--` comments and `/* */` blocks   (annotations are read separately)
//   · single-quoted literals             ('tenant_id' inside a policy string)
//   · $tag$ dollar-quoted bodies         (trigger functions, M-004/M-005)
// Double-quoted identifiers are PRESERVED — `"tenant_id"` is a name we need.
// ---------------------------------------------------------------------------

/**
 * Blanks comments and literals while preserving every newline, so line numbers
 * in the cleaned text still match the original file exactly.
 */
function stripNoise(sql) {
  let out = '';
  let i = 0;
  const keepNewlines = (from, to) => {
    for (let k = from; k < to && k < sql.length; k += 1) if (sql[k] === '\n') out += '\n';
  };

  while (i < sql.length) {
    const c = sql[i];
    const d = sql[i + 1];

    if (c === '-' && d === '-') {
      const start = i;
      while (i < sql.length && sql[i] !== '\n') i += 1;
      keepNewlines(start, i);
      continue;
    }
    if (c === '/' && d === '*') {
      const start = i;
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i += 1;
      i += 2;
      keepNewlines(start, i);
      continue;
    }
    if (c === "'") {
      const start = i;
      i += 1;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          i += 1;
          break;
        }
        i += 1;
      }
      out += "''";
      keepNewlines(start, i);
      continue;
    }
    const dollar = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i, i + 64));
    if (dollar) {
      const tag = dollar[0];
      const start = i;
      const end = sql.indexOf(tag, i + tag.length);
      i = end === -1 ? sql.length : end + tag.length;
      keepNewlines(start, i);
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

const stripQuotes = (s) => s.replace(/^["`]|["`]$/g, '').toLowerCase();

/** `public.children` -> `children` */
const bareName = (s) => {
  const parts = stripQuotes(s.trim()).split('.');
  return stripQuotes(parts[parts.length - 1]);
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The comma-separated items of a `CREATE TABLE (...)` body, at paren depth 1.
 * Column definitions and table constraints come back as separate entries, which
 * is what lets `tenant_id` be recognised anywhere in the list — including a
 * single-line body — without matching `REFERENCES other(tenant_id)` (nested, so
 * it belongs to an item that starts with some other column name) or a
 * `PRIMARY KEY (tenant_id, …)` constraint (starts with PRIMARY, not with the
 * column name). Finding F-6.
 */
function topLevelItems(body) {
  const start = body.indexOf('(');
  if (start === -1) return [];
  const items = [];
  let cur = '';
  let depth = 0;

  for (let i = start; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === '(') {
      depth += 1;
      if (depth === 1) continue;
    } else if (ch === ')') {
      depth -= 1;
      if (depth === 0) break;
    }
    if (depth === 1 && ch === ',') {
      items.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  items.push(cur);
  return items.map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/** A column definition whose name is `tenant_id`. */
const isTenantColumn = (item) => /^"?tenant_id"?(?=\s|$)/i.test(item);

/**
 * A constraint or column in the table body that already produces an index
 * leading with tenant_id. `PRIMARY KEY (tenant_id, …)` and `UNIQUE (tenant_id,
 * …)` both create a real btree index, so demanding a separate CREATE INDEX
 * would be a false warning.
 */
const isTenantLedConstraint = (item) =>
  /^(?:PRIMARY\s+KEY|UNIQUE)\s*\(\s*"?tenant_id"?(?=[\s,)"])/i.test(item) ||
  (isTenantColumn(item) && /\b(?:PRIMARY\s+KEY|UNIQUE)\b/i.test(item));

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const ANNOTATION = /--\s*@kf-rls\s+([A-Za-z_]+)/;
const CREATE_TABLE_G = /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(;]+)/gi;

/** Index of each line start, so a match offset becomes a 1-based line number. */
function lineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) if (text[i] === '\n') starts.push(i + 1);
  return (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

/** Captures the balanced `( … )` body that follows `from` in the cleaned text. */
function captureBody(clean, from) {
  let depth = 0;
  let started = false;
  for (let i = from; i < clean.length; i += 1) {
    const ch = clean[i];
    if (ch === '(') {
      depth += 1;
      started = true;
    } else if (ch === ')') {
      depth -= 1;
      if (started && depth <= 0) return clean.slice(from, i + 1);
    } else if (!started && ch === ';') {
      return clean.slice(from, i);
    }
  }
  return clean.slice(from);
}

/**
 * Finds every `CREATE TABLE` in one file and binds each to the policy-class
 * annotation IMMEDIATELY above it.
 *
 * Every CREATE TABLE is found by scanning the whole cleaned file, not by
 * testing each line in isolation. A line that carried both an annotation and a
 * CREATE TABLE used to be consumed as an annotation only, so the table was
 * never counted at all and a tenant table with no RLS whatsoever left the gate
 * with exit 0 (finding F-1). Two CREATE TABLEs on one line are found too, for
 * the same reason: no line may cause a table to go uncounted.
 *
 * Binding is deliberately tight (finding F-2): the annotation must be the LAST
 * NON-BLANK LINE before the CREATE TABLE. Anything else in between — another
 * statement, or a descriptive comment — discards it, and the discard is
 * reported. Without that, an annotation left behind by a deleted table
 * silently re-classified the next table created anywhere later in the file,
 * which is how a TENANT_STANDARD table inherited GLOBAL_READ and shipped with
 * `USING (true)` and no FORCE.
 *
 * A comment counts as content, and that is the point rather than an oversight.
 * F-2's own reproduction puts one comment line between the annotation and the
 * table; a rule that skipped comments would leave exactly that leak open. The
 * convention is therefore simple enough to state in one line — `-- @kf-rls X`
 * goes directly above `CREATE TABLE` — and descriptive prose goes above the
 * annotation, where it reads better anyway.
 *
 * A dangling annotation is itself an ERROR rather than a silent discard.
 * Discarding it quietly would recreate F-1's shape: the author sees an
 * annotation in the file, the gate sees an unannotated table, and only one of
 * them is right.
 */
function parseFile(raw, file) {
  const rawLines = raw.split(/\r?\n/);
  const clean = stripNoise(raw);
  const lineOf = lineIndex(clean);

  // Pass 1 — every CREATE TABLE in the file, grouped by the line it starts on.
  const byLine = new Map();
  CREATE_TABLE_G.lastIndex = 0;
  let m;
  while ((m = CREATE_TABLE_G.exec(clean)) !== null) {
    const line = lineOf(m.index);
    const record = {
      name: bareName(m[1]),
      file,
      line,
      policyClass: null,
      policyClassRaw: null,
      items: topLevelItems(captureBody(clean, m.index)),
      enableRls: false,
      forceRls: false,
      policies: 0,
      tenantLedIndex: false,
    };
    if (!byLine.has(line)) byLine.set(line, []);
    byLine.get(line).push(record);
  }

  // Pass 2 — walk the lines to bind annotations by adjacency.
  const tables = [];
  const danglers = [];
  let pending = null;

  for (let i = 0; i < rawLines.length; i += 1) {
    const here = byLine.get(i + 1);

    if (here) {
      // The annotation binds to the FIRST table on the line; a second table on
      // the same line is unannotated, which is correct — one annotation cannot
      // describe two tables.
      if (pending) {
        here[0].policyClass = pending.cls;
        here[0].policyClassRaw = pending.raw;
        pending = null;
      }
      tables.push(...here);
    } else if (pending && rawLines[i].trim() !== '') {
      // Raw, not cleaned: a comment line is content for binding purposes.
      danglers.push({ ...pending, reason: 'statement' });
      pending = null;
    }

    const ann = ANNOTATION.exec(rawLines[i]);
    if (ann) {
      if (pending) danglers.push({ ...pending, reason: 'annotation' });
      pending = {
        cls: ann[1].toUpperCase(),
        raw: ann[1],
        line: i + 1,
        sameLineAsCreate: Boolean(here),
      };
    }
  }

  if (pending) danglers.push({ ...pending, reason: 'eof' });

  return { tables, danglers };
}

/**
 * Resolves each table's obligations against the CORPUS text (see the DECISION
 * block at the top of this file), not against the file that created it.
 */
function resolveAgainstCorpus(tables, corpusText) {
  const whole = corpusText.replace(/\r?\n/g, ' ');

  for (const t of tables) {
    const n = escapeRe(t.name);
    const q = `(?:"?${n}"?|"?public"?\\."?${n}"?)`;
    const tbl = `ALTER\\s+TABLE\\s+(?:ONLY\\s+)?${q}`;

    if (new RegExp(`${tbl}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i').test(whole))
      t.enableRls = true;
    if (new RegExp(`${tbl}\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i').test(whole))
      t.forceRls = true;

    const pol = whole.match(
      new RegExp(`CREATE\\s+POLICY\\s+[^;]*?\\sON\\s+(?:ONLY\\s+)?${q}`, 'gi'),
    );
    t.policies = pol ? pol.length : 0;

    // An index "leading with tenant_id" means tenant_id is the FIRST column.
    //
    // The optional clauses below are not decoration — every one appears in
    // Prisma-generated or hand-written DDL, and each used to produce a false
    // `index-not-tenant-led` warning on a correct table (finding F-7):
    //   CONCURRENTLY · IF NOT EXISTS · USING btree · ON ONLY · "quoted" names
    // A trailing `DESC`/`ASC`/`NULLS …` on the first column is matched and
    // ignored, and a partial index's `WHERE …` sits outside the captured
    // group, so neither can affect the result.
    const idx = whole.match(
      new RegExp(
        `CREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+(?:CONCURRENTLY\\s+)?(?:IF\\s+NOT\\s+EXISTS\\s+)?` +
          `[^;]*?\\sON\\s+(?:ONLY\\s+)?${q}\\s*(?:USING\\s+[A-Za-z_][A-Za-z0-9_]*\\s*)?\\(([^)]*)`,
        'gi',
      ),
    );
    if (idx) {
      for (const stmt of idx) {
        const cols = stmt.slice(stmt.lastIndexOf('(') + 1);
        const first = cols.split(',')[0]?.trim() ?? '';
        if (/^"?tenant_id"?(?=[\s"]|$)/i.test(first)) t.tenantLedIndex = true;
      }
    }

    // A constraint added by a later ALTER carries an index too.
    if (
      new RegExp(
        `${tbl}\\s+ADD\\s+CONSTRAINT\\s+[^;]*?\\b(?:PRIMARY\\s+KEY|UNIQUE)\\s*\\(\\s*"?tenant_id"?`,
        'i',
      ).test(whole)
    )
      t.tenantLedIndex = true;

    // A composite primary key or unique constraint in the body counts too.
    if (t.items.some(isTenantLedConstraint)) t.tenantLedIndex = true;
  }
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

function checkTable(t, findings, manifest) {
  const at = `${t.file}:${t.line}`;
  const err = (rule, msg) => findings.push({ severity: 'ERROR', table: t.name, rule, msg, at });
  const warn = (rule, msg) => findings.push({ severity: 'WARNING', table: t.name, rule, msg, at });

  // (a) annotation present and recognised
  if (!t.policyClass) {
    err(
      'policy-class-missing',
      `no policy-class annotation. Add one of: ${CLASS_NAMES.join(', ')} — e.g. "-- @kf-rls TENANT_STANDARD" on its OWN line directly above CREATE TABLE`,
    );
    return;
  }
  const spec = POLICY_CLASSES[t.policyClass];
  if (!spec) {
    err(
      'policy-class-unknown',
      `unknown policy class "${t.policyClassRaw}". Approved vocabulary (Domain Model Part 6.1): ${CLASS_NAMES.join(', ')}`,
    );
    return;
  }

  // (b) tenant column, per class
  let tenantColumnMissing = false;
  if (spec.tenantColumn === 'required' && !t.items.some(isTenantColumn)) {
    tenantColumnMissing = true;
    err(
      'tenant-id-missing',
      `class ${t.policyClass} requires a tenant_id column, and this table has none`,
    );
  }

  // (c) ENABLE + FORCE, per class
  if (spec.enableRls && !t.enableRls) {
    err(
      'rls-not-enabled',
      `missing "ALTER TABLE ${t.name} ENABLE ROW LEVEL SECURITY" — a CREATE POLICY without it is inert`,
    );
  }
  if (spec.forceRls && !t.forceRls) {
    err(
      'rls-not-forced',
      `missing "ALTER TABLE ${t.name} FORCE ROW LEVEL SECURITY" — without FORCE the table owner bypasses every policy`,
    );
  }

  // (d) at least one policy
  if (spec.policy && t.policies === 0) {
    err(
      'policy-missing',
      `no CREATE POLICY targets this table; class ${t.policyClass} requires one`,
    );
  }

  // (e) tenant-led index — WARNING (acceptance criterion 3)
  //
  // Suppressed when the tenant column itself is missing (finding F-8). Telling
  // an author to index a column that does not exist is noise stacked on the
  // real error, and it invites them to "fix" the warning by adding an index
  // rather than the column.
  if (spec.tenantLedIndex && !t.tenantLedIndex && !tenantColumnMissing) {
    warn(
      'index-not-tenant-led',
      `no index leads with tenant_id. Tenant-led composite indexes are required by Domain Model Part 6.2; every query is tenant-filtered, so an index that does not lead with tenant_id will not be used`,
    );
  }

  // (f) manifest cross-check
  checkManifest(t, spec, manifest, err);
}

/**
 * The model manifest must be updated in the same PR (task Implementation
 * Requirements). This is that rule — previously the manifest was read and only
 * printed as a NOTE, so the requirement was declared but never enforced
 * (finding F-4).
 *
 * The comparison is table-name to table-name. The manifest gained
 * TENANT_SCOPED_TABLES / GLOBAL_TABLES for exactly this reason: it used to
 * carry only Prisma MODEL names, and Domain Model Part 7 maps PascalCase
 * singular models onto `@@map` snake_case plural tables. `Child` ↔ `children`
 * is not recoverable by string normalisation, so guessing the mapping here
 * would have produced false errors on real tables. The generator reads `@@map`
 * and emits both sets, which is the only place the mapping actually exists.
 *
 * While the manifest is empty the rule is inert and the NOTE says so.
 */
function checkManifest(t, spec, manifest, err) {
  if (!manifest.populated) return;

  const inScoped = manifest.scopedTables.includes(t.name);
  const inGlobal = manifest.globalTables.includes(t.name);

  if (!inScoped && !inGlobal) {
    err(
      'manifest-table-missing',
      `classed ${t.policyClass} in SQL but absent from the model manifest. Add the model to schema.prisma and regenerate: node tooling/tenancy-manifest/generate.mjs`,
    );
    return;
  }

  if (spec.manifestSide === 'scoped' && !inScoped) {
    err(
      'manifest-side-mismatch',
      `classed ${t.policyClass} in SQL but listed as global in the model manifest. A tenant-scoped table the extension treats as global gets no injected filter`,
    );
  }
  if (spec.manifestSide === 'global' && !inGlobal) {
    err(
      'manifest-side-mismatch',
      t.policyClass === 'SELF_TENANT_ROOT'
        ? `classed SELF_TENANT_ROOT in SQL but listed as tenant-scoped in the model manifest. ADR-010 L-6: the extension treats it as global and relies on RLS alone — it must not be marked tenant-scoped`
        : `classed ${t.policyClass} in SQL but listed as tenant-scoped in the model manifest. Reference data has no tenant column for the extension to filter on`,
    );
  }
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

function readManifest() {
  const file = path.join(ROOT, MANIFEST);
  if (!fs.existsSync(file)) {
    return {
      present: false,
      hasTableSets: false,
      populated: false,
      scopedTables: [],
      globalTables: [],
    };
  }
  const text = fs.readFileSync(file, 'utf8');
  const grab = (name) => {
    const m = text.match(new RegExp(`${name}\\s*:[^=]*=\\s*new Set\\(\\[([^\\]]*)\\]`, 's'));
    if (!m) return [];
    return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  };

  const scopedTables = grab('TENANT_SCOPED_TABLES').map((s) => s.toLowerCase());
  const globalTables = grab('GLOBAL_TABLES').map((s) => s.toLowerCase());

  return {
    present: true,
    hasTableSets: /TENANT_SCOPED_TABLES\s*:/.test(text),
    populated: scopedTables.length + globalTables.length > 0,
    scopedTables,
    globalTables,
  };
}

// ---------------------------------------------------------------------------
// Input selection
// ---------------------------------------------------------------------------

function collectSqlFiles(dir) {
  const abs = path.isAbsolute(dir) ? dir : path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return null;
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.toLowerCase().endsWith('.sql')) out.push(full);
    }
  };
  walk(abs);
  return out.sort();
}

function changedSqlFiles(base) {
  const out = execFileSync(
    'git',
    ['diff', '--name-only', '--diff-filter=ACMR', base, '--', '*.sql'],
    { cwd: ROOT, encoding: 'utf8' },
  );
  return out
    .split(/\r?\n/)
    .filter(Boolean)
    .map((p) => path.join(ROOT, p))
    .filter((p) => fs.existsSync(p));
}

/** See the DECISION block: the corpus is never narrowed by --diff or --file. */
function buildCorpus(reportFiles, rootDir) {
  const seen = new Set();
  for (const f of reportFiles) seen.add(path.resolve(f));
  for (const f of collectSqlFiles(rootDir) ?? []) seen.add(path.resolve(f));
  for (const d of new Set(reportFiles.map((f) => path.dirname(f)))) {
    for (const f of collectSqlFiles(d) ?? []) seen.add(path.resolve(f));
  }
  return [...seen].sort();
}

// ---------------------------------------------------------------------------

function main() {
  const argv = process.argv.slice(2);
  const notes = [];
  const allowEmpty = argv.includes('--allow-empty');

  const flag = (name) => {
    const i = argv.indexOf(name);
    return i === -1 ? null : argv[i + 1];
  };

  const explicitDir = flag('--dir');
  const rootDir = explicitDir ?? DEFAULT_DIR;

  let reportFiles;
  let scopeLabel;

  if (argv.includes('--file')) {
    reportFiles = argv
      .slice(argv.indexOf('--file') + 1)
      .filter((a) => !a.startsWith('--'))
      .map((p) => path.resolve(ROOT, p));

    if (reportFiles.length === 0) {
      console.error('migration-lint: --file needs at least one path');
      process.exit(2);
    }
    // A named file that is not there is an operator error, not a clean run over
    // zero tables. Finding F-5.
    const missing = reportFiles.filter((f) => !fs.existsSync(f));
    if (missing.length > 0) {
      console.error('migration-lint: named file(s) do not exist:');
      for (const f of missing) console.error(`  ${path.relative(ROOT, f).replace(/\\/g, '/')}`);
      process.exit(2);
    }
    scopeLabel = `${reportFiles.length} file(s) named on the command line`;
  } else if (argv.includes('--diff')) {
    const base = flag('--diff');
    if (!base || base.startsWith('--')) {
      console.error('migration-lint: --diff needs a base ref, e.g. --diff origin/main');
      process.exit(2);
    }
    reportFiles = changedSqlFiles(base);
    scopeLabel = `SQL changed since ${base}`;
  } else {
    const walked = collectSqlFiles(rootDir);
    if (walked === null) {
      if (explicitDir) {
        console.error(`migration-lint: --dir does not exist: ${explicitDir}`);
        process.exit(2);
      }
      reportFiles = [];
      scopeLabel = `all SQL under ${rootDir} (directory does not exist yet)`;
      notes.push(`migration directory not found: ${rootDir}`);
      notes.push('no migrations exist yet — KF-S0-API-003 creates them.');
    } else {
      reportFiles = walked;
      scopeLabel = `all SQL under ${rootDir}`;
    }
  }

  console.log('migration-lint: RLS annotation gate (TR-01)');
  console.log(`  scope: ${scopeLabel} — ${reportFiles.length} file(s) reported`);

  // ---- empty scope (finding F-5) ----
  // Nothing was checked. Never print PASS over an empty set, and never exit 0
  // unless the caller explicitly said an empty scope is acceptable here.
  if (reportFiles.length === 0) {
    for (const n of notes) console.log(`  NOTE  ${n}`);
    console.log('        Nothing was checked. This is not a pass.');
    if (allowEmpty) {
      console.log('  NOTE  --allow-empty was passed, so this exits 0 anyway.');
      console.log('        Remove it once KF-S0-API-003 has landed migrations.');
      process.exit(0);
    }
    console.log('  Re-run with --allow-empty if an empty scope is expected here.');
    process.exit(1);
  }

  const corpusFiles = buildCorpus(reportFiles, rootDir);
  const reportSet = new Set(reportFiles.map((f) => path.resolve(f)));

  const manifest = readManifest();
  if (!manifest.present) {
    notes.push(`model manifest not found at ${MANIFEST} — the cross-check verified NOTHING`);
  } else if (!manifest.hasTableSets) {
    notes.push(
      'model manifest carries no table sets — regenerate it ' +
        '(node tooling/tenancy-manifest/generate.mjs). The cross-check verified NOTHING',
    );
  } else if (!manifest.populated) {
    notes.push(
      'model manifest declares NO tables. That is expected before KF-S0-API-003, ' +
        'but it means the manifest cross-check verified nothing — it is not evidence of compliance.',
    );
  } else {
    notes.push(
      `model manifest cross-check ACTIVE — ${manifest.scopedTables.length} tenant-scoped, ` +
        `${manifest.globalTables.length} global table(s)`,
    );
  }

  // ---- parse ----
  const findings = [];
  const allTables = [];
  const reported = [];

  for (const f of corpusFiles) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    const { tables, danglers } = parseFile(fs.readFileSync(f, 'utf8'), rel);
    allTables.push(...tables);

    if (!reportSet.has(f)) continue;
    reported.push(...tables);

    for (const d of danglers) {
      findings.push({
        severity: 'ERROR',
        table: '(no table)',
        rule: 'annotation-dangling',
        at: `${rel}:${d.line}`,
        msg: d.sameLineAsCreate
          ? `"-- @kf-rls ${d.raw}" is on the same line as a CREATE TABLE, so it annotates nothing. The annotation must sit on its OWN line directly above the table it describes`
          : `"-- @kf-rls ${d.raw}" binds to no CREATE TABLE. Put it on its own line directly above the table it describes, or delete it — a stale annotation would otherwise re-classify whatever table comes next`,
      });
    }
  }

  const corpusText = corpusFiles.map((f) => stripNoise(fs.readFileSync(f, 'utf8'))).join('\n;\n');
  resolveAgainstCorpus(allTables, corpusText);

  for (const t of reported) checkTable(t, findings, manifest);

  // ---- reverse manifest check ----
  // Only when the whole migration root is the report scope. Under --file or
  // --diff the manifest legitimately names tables whose migrations are simply
  // not in scope, and reporting those would make the narrow scopes unusable.
  const wholeRoot = !argv.includes('--file') && !argv.includes('--diff');
  if (manifest.populated && wholeRoot) {
    const created = new Set(allTables.map((t) => t.name));
    for (const name of [...manifest.scopedTables, ...manifest.globalTables]) {
      if (!created.has(name)) {
        findings.push({
          severity: 'ERROR',
          table: name,
          rule: 'manifest-table-uncreated',
          at: MANIFEST,
          msg: `named in the model manifest but no CREATE TABLE for it exists under ${rootDir}. Either the migration is missing or the manifest is stale`,
        });
      }
    }
  }

  console.log(`  files in corpus: ${corpusFiles.length} (resolution scope)`);
  console.log(`  tables inspected: ${reported.length}`);
  for (const n of notes) console.log(`  NOTE  ${n}`);

  const errors = findings.filter((f) => f.severity === 'ERROR');
  const warnings = findings.filter((f) => f.severity === 'WARNING');

  if (findings.length > 0) console.log('');
  for (const f of findings) {
    console.log(`  ${f.severity}  ${f.table}  [${f.rule}]  ${f.msg}`);
    console.log(`         at ${f.at}`);
  }

  console.log('');
  console.log(`  ${errors.length} error(s), ${warnings.length} warning(s)`);

  if (findings.length > 0) {
    // Severity: warnings fail too. A tenant table without a tenant-led index is
    // a correctness problem waiting to become a performance incident, and a
    // "warning" nobody has to fix is a comment. Severity is kept visually
    // distinct in the output so a reviewer can tell the two apart at a glance.
    process.exit(1);
  }

  if (reported.length === 0) {
    // Files were read but none of them created a table. Legitimate (a migration
    // can be pure ALTER), but it is not evidence that anything was verified.
    console.log('  NOTE  no CREATE TABLE in the report scope — nothing was checked.');
    console.log('        This is not a pass.');
    if (allowEmpty) {
      console.log('  NOTE  --allow-empty was passed, so this exits 0 anyway.');
      process.exit(0);
    }
    process.exit(1);
  }

  console.log('  PASS — every table declares a policy class and satisfies it.');
}

main();
