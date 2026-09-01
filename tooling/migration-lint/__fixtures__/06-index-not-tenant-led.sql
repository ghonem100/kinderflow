-- FIXTURE — must produce a WARNING: index-not-tenant-led (acceptance criterion 3).
-- Fully isolated and correct on security grounds. The only defect is the index
-- order: it leads with created_at, not tenant_id. Every query against this
-- table carries a tenant predicate, so the planner will not use this index —
-- correct today, a performance incident at volume.

-- @kf-rls TENANT_STANDARD
CREATE TABLE fixture_bad_index (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE fixture_bad_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixture_bad_index FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_standard ON fixture_bad_index
  FOR ALL
  USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Leads with created_at, not tenant_id.
CREATE INDEX fixture_bad_index_created_idx ON fixture_bad_index (created_at DESC, tenant_id);
