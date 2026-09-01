-- FIXTURE — must PASS. The copyable TEMPLATE for KF-S0-API-003 (round-2 R2.3).
--
-- This is what `prisma migrate dev` actually writes, plus the hand-written RLS
-- block Blueprint §4 puts below the generated DDL. Everything unusual about
-- Prisma's output is exercised here on purpose, because each is a thing a
-- migration author would otherwise discover by hitting an error:
--
--   · `-- CreateTable` / `-- CreateIndex` / `-- AddForeignKey` marker comments
--   · quoted identifiers throughout
--   · `CONSTRAINT "x_pkey" PRIMARY KEY ("id")` rather than an inline PRIMARY KEY
--   · `ON "table"("col")` with NO space before the paren
--   · a blank line inside the column body, before the constraint
--
-- ANNOTATION PLACEMENT — copy the three tables below exactly.
--
-- The annotation is the LAST NON-BLANK LINE before CREATE TABLE. Prisma's own
-- CreateTable marker goes ABOVE the annotation, and so does any descriptive
-- prose. Putting the annotation above the marker instead makes it bind to
-- nothing, which is an error naming both the dangling annotation and the
-- now-unannotated table. That strictness is deliberate: any tolerated gap
-- between an annotation and its table is how a stale annotation re-classifies
-- an unrelated table, which is a cross-tenant read path.
--
-- One more constraint, which this header obeys and which cost a rewrite to
-- learn: the annotation marker is meaningful ANYWHERE in a comment, including
-- inside prose that is only describing it. Writing a specimen annotation in a
-- comment creates a real dangling annotation and fails the file. Name the
-- class in words, as this header does, and let the SQL below be the example.

-- CreateTable
-- @kf-rls SELF_TENANT_ROOT
CREATE TABLE "fixture_prisma_orgs" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "fixture_prisma_orgs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- @kf-rls TENANT_STANDARD
CREATE TABLE "fixture_prisma_children" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fixture_prisma_children_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- @kf-rls GLOBAL_READ
CREATE TABLE "fixture_prisma_plans" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "fixture_prisma_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fixture_prisma_children_tenant_id_created_at_idx" ON "fixture_prisma_children"("tenant_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "fixture_prisma_children" ADD CONSTRAINT "fixture_prisma_children_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "fixture_prisma_orgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written RLS block (Blueprint §4). Prisma generates none of this.
-- ---------------------------------------------------------------------------

ALTER TABLE "fixture_prisma_orgs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fixture_prisma_orgs" FORCE  ROW LEVEL SECURITY;

CREATE POLICY self_tenant_root ON "fixture_prisma_orgs"
  FOR ALL
  USING      ("id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("id" = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "fixture_prisma_children" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fixture_prisma_children" FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_standard ON "fixture_prisma_children"
  FOR ALL
  USING      ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

-- GLOBAL_READ: ENABLE without FORCE. kf_migrator owns this table and runs the
-- tier-1 seed after every deploy; FORCE would subject the owner to the policy
-- and break that seed (the T-1 trap, ADR-010 §7).
ALTER TABLE "fixture_prisma_plans" ENABLE ROW LEVEL SECURITY;

CREATE POLICY global_read ON "fixture_prisma_plans"
  FOR SELECT
  USING (true);
