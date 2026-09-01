-- FIXTURE — must FAIL: policy-class-unknown.
-- An annotation that looks plausible but is not in the approved vocabulary.
-- Accepting arbitrary strings would let a made-up class such as PROBABLY_FINE
-- satisfy the gate.
--
-- Note the deliberate absence of a literal annotation marker in this prose: the
-- marker is meaningful anywhere in a comment, so writing one out in
-- documentation would raise a dangling-annotation error of its own. Describe
-- the class by name, not by writing the marker.

-- @kf-rls TENANT_ISH
CREATE TABLE fixture_unknown_class (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
);

ALTER TABLE fixture_unknown_class ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixture_unknown_class FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_standard ON fixture_unknown_class
  FOR ALL
  USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX fixture_unknown_class_tenant_idx ON fixture_unknown_class (tenant_id, id);
