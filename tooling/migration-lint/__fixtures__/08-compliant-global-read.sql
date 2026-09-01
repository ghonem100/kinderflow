-- FIXTURE — must PASS with NO tenant_id column.
--
-- GLOBAL_READ reference data (Domain Model Part 6.1): subscription_plans,
-- roles, permissions, role_permissions, feature_flags, prompt_versions. These
-- legitimately have no tenant column at all.
--
-- This fixture is the reason the rules are class-aware rather than blanket. A
-- linter that demanded tenant_id everywhere would fail all six of M-001's
-- reference tables and be switched off within a day.
--
-- Note also: FORCE is deliberately NOT required for this class. kf_migrator
-- owns these tables and runs the tier-1 seed after every deploy; forcing RLS
-- would subject the owner to the policy and break that seed — the same trap as
-- finding T-1 in ADR-010 §7.

-- @kf-rls GLOBAL_READ
CREATE TABLE fixture_subscription_plans (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text NOT NULL UNIQUE,
  name       text NOT NULL,
  max_seats  integer NOT NULL
);

ALTER TABLE fixture_subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY global_read ON fixture_subscription_plans
  FOR SELECT
  USING (true);
