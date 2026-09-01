-- FIXTURE — must PASS (finding F-6).
--
-- The whole column list is on ONE LINE. tenant_id is therefore not at the start
-- of any line, and the old line-anchored check (/^\s*"?tenant_id"?\s/im) missed
-- it and reported a false [tenant-id-missing] on a correct table. Blueprint §4
-- anticipates hand-written blocks, which are written like this.
--
-- The nested-paren case is pinned here too: `REFERENCES ... (tenant_id)` on the
-- guardian_id column must NOT be mistaken for a tenant_id column definition.
-- The negative half of that pair lives in 03-missing-tenant-id.sql.

-- @kf-rls TENANT_STANDARD
CREATE TABLE fixture_inline_columns (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, guardian_id uuid REFERENCES fixture_compliant (tenant_id), label text NOT NULL);

ALTER TABLE fixture_inline_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixture_inline_columns FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_standard ON fixture_inline_columns
  FOR ALL
  USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX fixture_inline_columns_tenant_idx ON fixture_inline_columns (tenant_id, label);
