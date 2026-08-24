-- Baseline twins for the TR-10 benchmark: identical shape, NO row-level
-- security. They exist only so the wrapper's cost can be isolated from the
-- query's cost using the same client and the same pool. An unwrapped baseline
-- on an RLS table is impossible: reads return zero rows and writes fail
-- WITH CHECK, which is the fail-closed behaviour working as designed.
DROP TABLE IF EXISTS spike_child_norls CASCADE;
DROP TABLE IF EXISTS spike_event_norls CASCADE;

CREATE TABLE spike_child_norls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  full_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE spike_event_norls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  child_id uuid NOT NULL,
  direction text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX spike_child_norls_tenant_idx ON spike_child_norls (tenant_id, created_at DESC);

INSERT INTO spike_child_norls (tenant_id, full_name)
SELECT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'baseline-child-' || g
FROM generate_series(1, 25) g;

GRANT SELECT, INSERT, UPDATE, DELETE ON spike_child_norls, spike_event_norls TO kf_api, kf_worker;
