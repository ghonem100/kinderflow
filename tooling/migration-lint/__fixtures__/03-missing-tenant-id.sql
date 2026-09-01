-- FIXTURE — must FAIL: tenant-id-missing.
-- Declared TENANT_STANDARD but has no tenant_id column, so the policy below
-- could never compile against it. Everything else is present, which is what
-- makes this worth catching: it looks complete.
--
-- Two further behaviours are pinned here:
--
--   · The negative half of finding F-6. `REFERENCES fixture_compliant
--     (tenant_id)` mentions tenant_id inside a nested paren, on a column named
--     guardian_id. Widening the tenant-column check to find tenant_id anywhere
--     in the body must NOT make this table look compliant.
--
--   · Finding F-8. This table has no tenant_id at all, so the tenant-led-index
--     rule is suppressed. Exactly ONE finding is expected — telling an author
--     to index a column that does not exist invites them to "fix" the warning
--     by adding an index rather than the column.

-- @kf-rls TENANT_STANDARD
CREATE TABLE fixture_no_tenant_column (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guardian_id uuid REFERENCES fixture_compliant (tenant_id),
  label       text NOT NULL
);

ALTER TABLE fixture_no_tenant_column ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixture_no_tenant_column FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_standard ON fixture_no_tenant_column
  FOR ALL
  USING (true);
