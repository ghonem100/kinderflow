# KinderFlow

A multi-tenant SaaS platform for nurseries and daycare centres — built design-first, with the isolation guarantees written, measured and enforced before the features.

> **Stage:** Sprint 0 — foundations. The architecture is decided and documented (10 ADRs), the multi-tenancy model has been proven with a benchmark spike, the API contracts package is in place, and CI gates enforce the design. Feature modules come next. This repository is currently more interesting as engineering than as a product, and the two pieces below are why.

---

## The problem this repo is actually solving

Thousands of small nurseries, one small team, and the data is children's records. Isolation is not a feature — it is the thing that must never fail. Almost every multi-tenant bug is the same bug: *someone added a table and forgot the policy.*

So the first two things built were not screens. They were the two mechanisms that make that bug impossible.

---

## 1. Multi-tenancy: decided by measurement, not by preference

[ADR-008](./docs/Decisions/ADR-008_Shared_DB_RLS.md) chooses **shared database + shared schema + PostgreSQL Row-Level Security**, scored against schema-per-tenant (5.9/10) and database-per-tenant (5.1/10) on a documented decision matrix.

Isolation is layered rather than trusted to one mechanism:

```
JWT tenant context
  → Prisma client-extension filter injection
    → PostgreSQL RLS policies          ← engine-level backstop
      (API role without BYPASSRLS, session variable set per transaction)
        → tenant-prefixed S3 keys
          → CI cross-tenant test suite
```

Then it was **benchmarked before being accepted** ([ADR-010](./docs/Decisions/ADR-010_RLS_Integration_Pattern.md)). The wrapped path failed the stated performance budget — 56.3% p95 overhead against a ≤15% budget:

| Scenario | Baseline p95 | Wrapped p95 | Overhead |
|---|---|---|---|
| Roster read (50 rows) | 8.26 ms | 5.30 ms | −35.9%* |
| Event insert | 4.76 ms | 7.44 ms | **+56.3%** |
| Heavier read (all rows) | 2.80 ms | 5.67 ms | +102.1% |

<sub>*negative because the unwrapped baseline was the unstable one — p95 spread 2.9–76.4 ms across runs.</sub>

A failed budget triggered an investigation rather than a shrug. The finding: the overhead is a **fixed ~1.8 ms per operation, not a multiplier** — three extra round trips (`BEGIN`, `set_config`, `COMMIT`) that do not grow with query complexity. The heavier read did strictly more work for the same absolute cost. The 15% budget had been expressed against a synthetic 2 ms query, where any fixed cost looks enormous. The budget was amended with reasoning; the more complex split read path was documented and **not** adopted.

Deciding not to build something, in writing, with the numbers that justify it, is the part I'd point at.

## 2. A CI gate that makes the classic multi-tenancy bug unmergeable

[`tooling/migration-lint`](./tooling/migration-lint) reads **migration SQL, not Prisma models** — because SQL is what actually reaches the database, and a model can be correct while the migration shipping it is not. Every `CREATE TABLE` must declare a policy class from an approved vocabulary, and each class carries its own obligations:

```sql
-- @kf-rls TENANT_STANDARD
CREATE TABLE children (...);
```

Two design decisions in it are worth reading:

**Corpus scope vs report scope.** Obligations may be satisfied by any migration in the migration root, not only the one that creates the table — so a legitimate "enable RLS on an existing table" remediation migration passes instead of being blocked. The report scope narrows with `--diff`; the corpus never does, so narrowing what's checked can't invent findings just because the `ENABLE`/`FORCE` statements live in an unchanged file.

**Revocation as a rule instead of ordering.** The linter deliberately does not compute the database's end state. Instead, `DROP POLICY`, `DISABLE ROW LEVEL SECURITY` and `NO FORCE ROW LEVEL SECURITY` are unconditional errors against any policy-classed table. Isolation is never withdrawn through a migration in any order — so the gate doesn't need to know the order to be correct. Ordering machinery would be more faithful and far more expensive; it is explicitly not built.

Covered by **21 SQL fixtures**, including the adversarial ones (annotation dangling, inline column lists, manifest side mismatch, Prisma-generated shapes).

---

## Repository

```
apps/
├── api/              NestJS modular monolith — Prisma, PostgreSQL, Redis, BullMQ
└── web/              Next.js · TypeScript · Tailwind · shadcn/ui
packages/
├── contracts/        Shared API contracts, schemas, events, permissions (source of truth)
├── shared/  i18n/  tokens/  ui/
tooling/
└── migration-lint/   RLS annotation gate (see above)
infrastructure/       Docker · GitHub Actions · Coolify
docs/                 Design-first documentation — see below
```

**Documentation is the workflow, not an afterthought.** Every module goes through business analysis → requirements → DB design → API design → permissions → validation → edge cases → testing strategy *before* implementation:

`00_Product_Discovery` · `01_Business_Analysis` · `02_Requirements` · `03_System_Architecture` · `04_Database_Design` · `05_API_Design` · `06_UI_UX` · `07_Roadmap` · `08_AI` · `09_Deployment` · `Decisions` (ADRs)

**Engineering discipline:** pnpm workspaces + Turborepo · ESLint + Prettier · Husky + lint-staged · commitlint (Conventional Commits) · Changesets · Renovate · ticket-referenced branches (`KF-S0-CI-003`) traceable to the ADR that motivated them.

---

## Stack

**Backend** NestJS · TypeScript · Prisma · PostgreSQL (RLS) · Redis · BullMQ
**Frontend** Next.js · TypeScript · TailwindCSS · shadcn/ui · PWA-first ([ADR-009](./docs/Decisions/ADR-009_PWA_First.md))
**Mobile** Parent and teacher apps
**Infra** Docker · GitHub Actions · Coolify

---

## Running it

```bash
pnpm install
pnpm build

# the RLS migration gate
node tooling/migration-lint/lint.mjs --dir apps/api/prisma/migrations
node --test tooling/migration-lint/test/
```

---

## Notes

Built by **Ghonem** — AI graduate, Menoufia National University. Architecture decisions live in [`docs/Decisions`](./docs/Decisions); each one records what was chosen, what was rejected, and what it costs.

License: proprietary, all rights reserved. Published for review.
