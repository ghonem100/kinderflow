-- FIXTURE — must PASS (finding F-7, rework AC7).
--
-- Six tables, six legitimate ways of producing an index that leads with
-- tenant_id. Every one of them used to be missed by the index matcher, so a
-- correct table got a false [index-not-tenant-led] warning — and warnings fail
-- the build, so each of these blocked correct work.
--
--   fixture_idx_using      USING btree between the table name and the columns
--   fixture_idx_concurrent CREATE INDEX CONCURRENTLY
--   fixture_idx_quoted     quoted identifiers, and DESC on a later column
--   fixture_idx_partial    a partial index with a trailing WHERE clause
--   fixture_idx_pk         a composite PRIMARY KEY in the table body
--   fixture_idx_constraint a UNIQUE constraint added by a later ALTER TABLE
--
-- The negative case — an index that genuinely leads with the wrong column —
-- stays in 06-index-not-tenant-led.sql, so widening the matcher here cannot
-- quietly turn the rule off.

-- @kf-rls TENANT_STANDARD
CREATE TABLE fixture_idx_using (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE fixture_idx_using ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixture_idx_using FORCE  ROW LEVEL SECURITY;
CREATE POLICY p ON fixture_idx_using FOR ALL
  USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE INDEX fixture_idx_using_idx ON fixture_idx_using USING btree (tenant_id, created_at);

-- @kf-rls TENANT_STANDARD
CREATE TABLE fixture_idx_concurrent (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
);
ALTER TABLE fixture_idx_concurrent ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixture_idx_concurrent FORCE  ROW LEVEL SECURITY;
CREATE POLICY p ON fixture_idx_concurrent FOR ALL
  USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE INDEX CONCURRENTLY IF NOT EXISTS fixture_idx_concurrent_idx
  ON fixture_idx_concurrent (tenant_id, id);

-- @kf-rls TENANT_STANDARD
CREATE TABLE "fixture_idx_quoted" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"  uuid NOT NULL,
  "createdAt"  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "fixture_idx_quoted" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fixture_idx_quoted" FORCE  ROW LEVEL SECURITY;
CREATE POLICY p ON "fixture_idx_quoted" FOR ALL
  USING      ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
CREATE INDEX "fixture_idx_quoted_idx" ON "fixture_idx_quoted" ("tenant_id", "createdAt" DESC);

-- @kf-rls TENANT_STANDARD
CREATE TABLE fixture_idx_partial (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  deleted_at timestamptz
);
ALTER TABLE fixture_idx_partial ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixture_idx_partial FORCE  ROW LEVEL SECURITY;
CREATE POLICY p ON fixture_idx_partial FOR ALL
  USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE INDEX fixture_idx_partial_idx ON fixture_idx_partial (tenant_id, id)
  WHERE deleted_at IS NULL;

-- @kf-rls TENANT_STANDARD
CREATE TABLE fixture_idx_pk (
  tenant_id uuid NOT NULL,
  id        uuid NOT NULL,
  label     text NOT NULL,
  PRIMARY KEY (tenant_id, id)
);
ALTER TABLE fixture_idx_pk ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixture_idx_pk FORCE  ROW LEVEL SECURITY;
CREATE POLICY p ON fixture_idx_pk FOR ALL
  USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- @kf-rls TENANT_STANDARD
CREATE TABLE fixture_idx_constraint (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  code      text NOT NULL
);
ALTER TABLE fixture_idx_constraint ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixture_idx_constraint FORCE  ROW LEVEL SECURITY;
CREATE POLICY p ON fixture_idx_constraint FOR ALL
  USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
ALTER TABLE fixture_idx_constraint
  ADD CONSTRAINT fixture_idx_constraint_tenant_code_key UNIQUE (tenant_id, code);
