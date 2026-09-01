# tooling/

Repository-internal tooling that backs the CI gates. Not shipped, not imported by application code.

Per Blueprint §1 and Sprint 0 Guide §1.2, this directory holds:

| Package             | Purpose                                                                                              | Gate  | Status                 |
| ------------------- | ---------------------------------------------------------------------------------------------------- | ----- | ---------------------- |
| `migration-lint/`   | RLS-class annotation checker — fails when a new tenant table lands without a policy class            | TR-01 | `KF-S0-CI-003` — live  |
| `tenancy-manifest/` | Generates the model manifest that the Prisma tenancy extension and the migration linter both consume | TR-10 | `KF-S0-RLS-001` — live |
| `depcruise/`        | Module-boundary rules — forbids cross-module deep imports and `domain → nest` imports (Blueprint §3) | TR-02 | not created yet        |
| `generators/`       | OpenAPI → TS types, Postman collection, design-token build pipeline                                  | —     | not created yet        |

Members are plain script directories, not workspace packages. `pnpm-workspace.yaml` globs `tooling/*`, but pnpm skips a directory with no `package.json`, and none of these need one — each is a self-contained `node` script invoked by a root script, which is the precedent set by `pnpm lint:rules` in `KF-S0-INFRA-003`.

## Commands

| Command                    | What it does                                                     |
| -------------------------- | ---------------------------------------------------------------- |
| `pnpm lint:migrations`     | Runs the RLS annotation gate over `apps/api/prisma/migrations`   |
| `pnpm test:migration-lint` | Runs the linter's own fixture suite (`node --test`, no database) |

`pnpm lint:migrations` **fails** until `KF-S0-API-003` creates the first migrations: an empty scope is not a pass, because a green required check over zero files is indistinguishable from a real one. Until then, callers that need a green check pass the opt-in explicitly:

```bash
pnpm lint:migrations -- --allow-empty
```

`KF-S0-CI-001` wires that form, and removes the flag once migrations exist.

## Writing a migration the RLS gate accepts

Copy [`migration-lint/__fixtures__/21-prisma-generated-shape.sql`](migration-lint/__fixtures__/21-prisma-generated-shape.sql). It is a proven-passing template covering all four policy classes in the exact shape `prisma migrate dev` emits — quoted identifiers, `CONSTRAINT … PRIMARY KEY`, `ON "table"("col")`, and the hand-written RLS block Blueprint §4 puts below the generated DDL.

Two rules carry the whole convention:

**1. The annotation is the last non-blank line before its `CREATE TABLE`.** Prisma's `-- CreateTable` marker goes above it, and so does any descriptive prose. Nothing may sit between the annotation and the table — not a comment, not a blank line followed by one.

```sql
-- CreateTable
-- @kf-rls TENANT_STANDARD
CREATE TABLE "children" (
```

The rule is strict on purpose. Any tolerated gap is how an annotation left behind by a deleted table silently re-classifies an unrelated table below it, which is a cross-tenant read path. A misplaced annotation fails closed and the error names both the dangling annotation and the now-unannotated table.

**2. The marker is meaningful anywhere in a comment.** Prose in a migration must not quote a specimen annotation — writing one inside a comment creates a real dangling annotation and fails the file. Name the class in words and point at the template instead.

Isolation is also never withdrawn through a migration: `DROP POLICY`, `DISABLE ROW LEVEL SECURITY` and `NO FORCE ROW LEVEL SECURITY` against a policy-classed table are unconditional errors. A legitimate need for one is an escalation (workflow §3), not a lint fix.
