-- FIXTURE — must PASS with NO separate tenant_id column.
--
-- SELF_TENANT_ROOT is `organizations`: the row IS the tenant, so the
-- discriminator is `id`, not a `tenant_id` column (Domain Model Part 6.1/6.2).
--
-- This is limitation L-6 from ADR-010, and it is precisely the case a blanket
-- "every isolated table needs a tenant_id column" rule gets wrong. It would
-- fail the single most important table in the schema, and the obvious "fix" —
-- reclassifying organizations as TENANT_STANDARD and bolting on a redundant
-- tenant_id — would be a genuine modelling error introduced by the linter.

-- @kf-rls SELF_TENANT_ROOT
CREATE TABLE fixture_organizations (
  id         uuid PRIMARY KEY,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE fixture_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixture_organizations FORCE  ROW LEVEL SECURITY;

CREATE POLICY self_tenant_root ON fixture_organizations
  FOR ALL
  USING      (id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (id = current_setting('app.tenant_id', true)::uuid);
