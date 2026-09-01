-- FIXTURE — must FAIL: manifest-side-mismatch (finding F-4, ADR-010 L-6).
--
-- A SELF_TENANT_ROOT table — `organizations` in the real schema. ADR-010 L-6 is
-- explicit: "the extension treats it as global and relies on RLS alone …
-- must not mark it tenant-scoped in the manifest". The Prisma extension cannot
-- inject a tenantId filter on a model that has no tenantId field, so listing it
-- as tenant-scoped describes a filter that cannot exist.
--
-- This fixture is exercised against a temporary workspace whose manifest lists
-- the table on the WRONG side (tenant-scoped). The expected error names L-6, so
-- that whoever hits it is sent to the decision rather than to a guess.
--
-- Note what this fixture does NOT do: it does not demand that SELF_TENANT_ROOT
-- appear in the tenant-scoped set. The rework handover asked for that, and
-- ADR-010 L-6 forbids it. The approved decision wins (workflow §4 rule 1).

-- @kf-rls SELF_TENANT_ROOT
CREATE TABLE fixture_manifest_org (
  id         uuid PRIMARY KEY,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE fixture_manifest_org ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixture_manifest_org FORCE  ROW LEVEL SECURITY;

CREATE POLICY self_tenant_root ON fixture_manifest_org
  FOR ALL
  USING      (id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (id = current_setting('app.tenant_id', true)::uuid);
