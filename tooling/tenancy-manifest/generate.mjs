#!/usr/bin/env node
/* global console */
/**
 * Model manifest generator (KF-S0-RLS-001 requirement 3).
 *
 * Reads `@kf-tenancy` annotations from schema.prisma and emits the manifest
 * that BOTH the Prisma extension and the migration linter consume. One source
 * means the runtime guard and the CI gate can never disagree about which tables
 * need a policy — a disagreement there is exactly how a table ships unprotected.
 *
 *   /// @kf-tenancy tenant-scoped   -> extension injects the filter, RLS policy required
 *   /// @kf-tenancy global          -> reference data, no tenant column
 *
 * An unannotated model is an ERROR, not a default. Defaulting either way is
 * wrong: default-global silently ships an unprotected table, default-scoped
 * breaks reference data in a way someone would "fix" by marking it global
 * without thinking. Forcing the author to state it keeps the decision visible.
 *
 * Usage:  node tooling/tenancy-manifest/generate.mjs [--check]
 *         --check exits non-zero if the committed manifest is stale (for CI).
 *
 * ---------------------------------------------------------------------------
 * THE GENERATOR OWNS THE OUTPUT FILE COMPLETELY. Closing DISC-012, 2026-09-29.
 *
 * The manifest used to carry hand-written explanatory paragraphs that this
 * generator does not emit, so `--check` would have called the committed file
 * stale the moment a schema existed. Two notes worth keeping lived in that
 * prose; they live here now, where regeneration cannot delete them:
 *
 *   · The TR-10 spike's manifest (SpikeChild, SpikeAttendanceEvent) is
 *     deliberately NOT merged. It describes throwaway tables, and a manifest
 *     naming models that do not exist is a lie the Prisma extension would act
 *     on.
 *   · `KF-S0-CI-001` must wire `generate.mjs --check` as a blocking job, so a
 *     model added without regenerating fails the build instead of shipping a
 *     table the extension does not know to scope.
 *
 * Do NOT teach this generator to preserve hand-written blocks in the output.
 * A generated file with authored regions is neither generated nor authored, and
 * every consumer then has to guess which half to trust.
 * ---------------------------------------------------------------------------
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const SCHEMA = path.join(ROOT, 'apps/api/prisma/schema.prisma');
const OUT = path.join(ROOT, 'apps/api/src/shared-kernel/tenancy/model-manifest.generated.ts');

/** The Prisma field name every tenant-scoped model must carry. */
const TENANT_FIELD = 'tenantId';

/**
 * The physical table a model maps to. Domain Model Part 7: "PascalCase singular
 * model names ↔ `@@map` snake_case plural tables". Prisma's own default, when
 * `@@map` is absent, is the model name verbatim.
 *
 * This is read for the migration linter (KF-S0-CI-003, finding F-4). The linter
 * compares SQL `CREATE TABLE` names against the manifest, and model names alone
 * cannot be compared: `Child` ↔ `children` and `Person` ↔ `people` are not
 * recoverable by any string normalisation. `@@map` is the only place the
 * mapping actually exists, so the manifest carries both sides.
 */
function findMap(lines, from) {
  let depth = 0;
  for (let i = from; i < lines.length; i += 1) {
    const line = lines[i];
    for (const ch of line) {
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
    }
    const map = line.trim().match(/^@@map\s*\(\s*"([^"]+)"\s*\)/);
    if (map) return map[1];
    if (depth <= 0 && i > from) return null;
  }
  return null;
}

function parse(schemaText) {
  const lines = schemaText.split(/\r?\n/);
  const models = [];
  let pending = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();

    const annotation = line.match(/^\/\/\/\s*@kf-tenancy\s+(tenant-scoped|global)\s*$/);
    if (annotation) {
      pending = annotation[1];
      continue;
    }

    const model = line.match(/^model\s+([A-Za-z0-9_]+)\s*\{/);
    if (model) {
      models.push({
        name: model[1],
        table: findMap(lines, i) ?? model[1],
        tenancy: pending,
        line: i + 1,
      });
      pending = null;
    }
  }
  return models;
}

function main() {
  if (!fs.existsSync(SCHEMA)) {
    console.error(`tenancy-manifest: schema not found at ${SCHEMA}`);
    process.exit(1);
  }

  const text = fs.readFileSync(SCHEMA, 'utf8');
  const models = parse(text);

  const unannotated = models.filter((m) => m.tenancy === null);
  if (unannotated.length > 0) {
    console.error('tenancy-manifest: every model must declare its tenancy. Missing:');
    for (const m of unannotated) {
      console.error(`  ${SCHEMA}:${m.line}  model ${m.name}`);
    }
    console.error('\nAdd one of these above the model:');
    console.error('  /// @kf-tenancy tenant-scoped');
    console.error('  /// @kf-tenancy global');
    process.exit(1);
  }

  const scopedModels = models.filter((m) => m.tenancy === 'tenant-scoped');
  const globalModels = models.filter((m) => m.tenancy === 'global');

  const scoped = scopedModels.map((m) => m.name).sort();
  const global = globalModels.map((m) => m.name).sort();
  const scopedTables = scopedModels.map((m) => m.table).sort();
  const globalTables = globalModels.map((m) => m.table).sort();

  /**
   * A `new Set([...])` literal that Prettier would not rewrite.
   *
   * The naive `new Set([\n${items.join()}\n])` leaves a blank line inside the
   * brackets when the list is empty, which Prettier collapses to `new Set([])`
   * — and a formatter rewriting generated output makes `--check` fail on
   * formatting rather than on real drift. That is exactly the trap DISC-012
   * recorded, so the generator emits the collapsed form itself.
   *
   * `.prettierignore` covers this file as well; belt and braces, because the
   * two protections fail in different circumstances.
   */
  const renderSet = (names) =>
    names.length === 0
      ? 'new Set([])'
      : `new Set([\n${names.map((n) => `  '${n}',`).join('\n')}\n])`;

  const body = `// GENERATED by tooling/tenancy-manifest/generate.mjs — do not edit.
// Source of truth: apps/api/prisma/schema.prisma (@kf-tenancy annotations).
// Regenerate: node tooling/tenancy-manifest/generate.mjs
//
// Consumed by the Prisma tenancy extension AND the migration linter, so the
// runtime guard and the CI gate always agree on what must carry a policy.

/** Prisma field name carrying the tenant discriminator. */
export const TENANT_FIELD = '${TENANT_FIELD}' as const;

/** Models the extension scopes, and that require an RLS policy. */
export const TENANT_SCOPED_MODELS: ReadonlySet<string> = ${renderSet(scoped)};

/** Reference data. No tenant column; RLS class GLOBAL_READ or SELF_TENANT_ROOT. */
export const GLOBAL_MODELS: ReadonlySet<string> = ${renderSet(global)};

/**
 * The same two sets as PHYSICAL TABLE names, from each model's \`@@map\`.
 *
 * The migration linter reads these, not the model sets. It compares against SQL
 * \`CREATE TABLE\` statements, and model names cannot be compared to table names
 * — Domain Model Part 7 maps PascalCase singular models onto snake_case plural
 * tables, and \`Child\` ↔ \`children\` survives no string normalisation.
 */
export const TENANT_SCOPED_TABLES: ReadonlySet<string> = ${renderSet(scopedTables)};

/** Reference-data tables. Note: SELF_TENANT_ROOT belongs here — ADR-010 L-6. */
export const GLOBAL_TABLES: ReadonlySet<string> = ${renderSet(globalTables)};
`;

  if (process.argv.includes('--check')) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (current !== body) {
      console.error('tenancy-manifest: manifest is STALE. Run:');
      console.error('  node tooling/tenancy-manifest/generate.mjs');
      process.exit(1);
    }
    console.log(`tenancy-manifest: up to date (${scoped.length} scoped, ${global.length} global)`);
    return;
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, body);
  console.log(
    `tenancy-manifest: wrote ${path.relative(ROOT, OUT)} — ` +
      `${scoped.length} tenant-scoped [${scoped.join(', ')}], ${global.length} global [${global.join(', ')}]`,
  );
}

main();
