-- FIXTURE — must FAIL: manifest-table-missing (finding F-4, rework AC5).
--
-- Perfectly isolated on every SQL rule: annotation, tenant_id, ENABLE, FORCE,
-- policy, tenant-led index. The ONLY defect is that the model manifest does not
-- know this table exists.
--
-- The task's Implementation Requirements say "the model manifest must be
-- updated in the same PR". Before the rework the manifest was read and printed
-- as a NOTE and nothing compared against it, so that requirement was declared
-- and never enforced.
--
-- This fixture is exercised against a temporary workspace carrying a POPULATED
-- manifest — see the manifest tests. Against the repository's own empty
-- manifest the rule is inert by design, and this table passes.

-- @kf-rls TENANT_STANDARD
CREATE TABLE fixture_manifest_unknown (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  label      text NOT NULL
);

ALTER TABLE fixture_manifest_unknown ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixture_manifest_unknown FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_standard ON fixture_manifest_unknown
  FOR ALL
  USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX fixture_manifest_unknown_tenant_idx
  ON fixture_manifest_unknown (tenant_id, label);
