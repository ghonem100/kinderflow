-- FIXTURE — must FAIL, naming the table (finding F-2, rework AC3).
--
-- A stale GLOBAL_READ annotation, left behind by a table that was removed, sits
-- one comment line above an unrelated TENANT table. The gate used to bind it,
-- so the tenant table below inherited GLOBAL_READ — which demands neither FORCE
-- nor a tenant-led index — and its `USING (true)` policy passed. That is a
-- cross-tenant read path leaving the gate green.
--
-- Pinned behaviour: the annotation binds to nothing and is itself an ERROR
-- [annotation-dangling], and the table is reported as unannotated
-- [policy-class-missing]. The comment line between them is content: an
-- annotation must be the LAST NON-BLANK LINE before its CREATE TABLE, so
-- descriptive prose belongs above the annotation, not between.

-- @kf-rls GLOBAL_READ
-- (annotation intended for a table that was later removed)
CREATE TABLE fixture_forgotten_tenant (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
);

ALTER TABLE fixture_forgotten_tenant ENABLE ROW LEVEL SECURITY;

CREATE POLICY p ON fixture_forgotten_tenant FOR SELECT USING (true);
