-- FIXTURE — the first half of the revocation pair (round-2 R2.2).
--
-- Fully compliant on every SQL rule when read alone: annotation, tenant_id,
-- ENABLE, FORCE, policy, tenant-led index. Nothing here is wrong.
--
-- Pinned behaviour: linting THIS file must still FAIL, because
-- 20-revocation-revokes-isolation.sql takes the isolation away again later in
-- the corpus. The corpus rule cuts both ways — if a later migration can satisfy
-- an obligation, it can also revoke one, and only the revocation rule closes
-- that. A compliant table plus a later DROP POLICY used to exit 0.

-- @kf-rls TENANT_STANDARD
CREATE TABLE fixture_reverted (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  label      text NOT NULL
);

ALTER TABLE fixture_reverted ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixture_reverted FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_standard ON fixture_reverted
  FOR ALL
  USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX fixture_reverted_tenant_idx ON fixture_reverted (tenant_id, label);
