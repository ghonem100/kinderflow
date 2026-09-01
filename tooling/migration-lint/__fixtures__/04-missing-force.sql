-- FIXTURE — must FAIL: rls-not-forced (acceptance criterion 2).
-- ENABLE without FORCE. The policy exists and looks right, but the table owner
-- (kf_migrator) bypasses it entirely — so a migration or seed running as the
-- owner reads and writes every tenant's rows.

-- @kf-rls TENANT_STANDARD
CREATE TABLE fixture_missing_force (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  label     text NOT NULL
);

ALTER TABLE fixture_missing_force ENABLE ROW LEVEL SECURITY;
-- FORCE deliberately absent.

CREATE POLICY tenant_standard ON fixture_missing_force
  FOR ALL
  USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX fixture_missing_force_tenant_idx ON fixture_missing_force (tenant_id, id);
