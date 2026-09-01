-- FIXTURE — must FAIL: policy-missing.
-- RLS is enabled and forced, but no policy is defined. In PostgreSQL that is
-- the strictest possible state — it denies everything, including legitimate
-- access — so it fails loudly in production rather than leaking. Still wrong.

-- @kf-rls TENANT_STANDARD
CREATE TABLE fixture_missing_policy (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  label     text NOT NULL
);

ALTER TABLE fixture_missing_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixture_missing_policy FORCE  ROW LEVEL SECURITY;

CREATE INDEX fixture_missing_policy_tenant_idx ON fixture_missing_policy (tenant_id, id);
