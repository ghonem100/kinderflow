-- FIXTURE — must PASS with a POPULATED manifest (finding F-4, rework AC5).
--
-- The positive half of the manifest cross-check. SQL and manifest agree: this
-- table is TENANT_STANDARD in SQL and tenant-scoped in the manifest. Without
-- it, the two failing manifest fixtures could be satisfied by a rule that
-- simply errors on everything once the manifest is non-empty.

-- @kf-rls TENANT_STANDARD
CREATE TABLE fixture_manifest_agreed (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  label      text NOT NULL
);

ALTER TABLE fixture_manifest_agreed ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixture_manifest_agreed FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_standard ON fixture_manifest_agreed
  FOR ALL
  USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX fixture_manifest_agreed_tenant_idx
  ON fixture_manifest_agreed (tenant_id, label);
