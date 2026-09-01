-- FIXTURE — the second half of the corpus-rule pair (finding F-3).
--
-- Secures a table created by an EARLIER migration
-- (10-corpus-split-create.sql). It creates no table of its own, so linting it
-- alone reports zero tables — which is not a pass, and the gate says so
-- rather than printing PASS over an empty check (finding F-5).

ALTER TABLE fixture_split_table ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixture_split_table FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_standard ON fixture_split_table
  FOR ALL
  USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX fixture_split_table_tenant_idx
  ON fixture_split_table (tenant_id, created_at DESC);
