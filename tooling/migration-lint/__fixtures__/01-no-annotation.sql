-- FIXTURE — must FAIL: policy-class-missing (acceptance criterion 1).
-- A tenant table with no @kf-rls annotation at all. This is the case the gate
-- exists for: someone adds a table and never thinks about isolation.

CREATE TABLE fixture_unannotated (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  label     text NOT NULL
);

CREATE INDEX fixture_unannotated_tenant_idx ON fixture_unannotated (tenant_id, id);
