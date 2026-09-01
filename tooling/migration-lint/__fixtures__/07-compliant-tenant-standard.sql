-- FIXTURE — must PASS (acceptance criterion 4).
-- A fully compliant TENANT_STANDARD table: annotation, tenant_id, ENABLE,
-- FORCE, policy, and a tenant-led composite index.

-- @kf-rls TENANT_STANDARD
CREATE TABLE fixture_compliant (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  full_name  text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE fixture_compliant ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixture_compliant FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_standard ON fixture_compliant
  FOR ALL
  USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX fixture_compliant_tenant_created_idx
  ON fixture_compliant (tenant_id, created_at DESC);
