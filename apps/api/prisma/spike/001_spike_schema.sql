-- KF-S0-RLS-001 (TR-10 spike) — throwaway schema. NOT the real M-002.
--
-- Applied as kf_migrator (the only role permitted to DDL). Deliberately mirrors
-- the shapes the real schema will use so spike results transfer:
--   * tenant_id UUID NOT NULL on every tenant-scoped table
--   * RLS ENABLED and FORCED  (Blueprint 4 / ADR-008)
--   * TENANT_STANDARD policy  (Domain Model 6.1):
--       USING (tenant_id = current_setting('app.tenant_id')::uuid)
--       WITH CHECK identical
--   * tenant-led composite indexes
--
-- This file is spike-only and never merges to main (decision D-20).
-- KF-S0-API-003 owns the real migrations.

BEGIN;

DROP TABLE IF EXISTS spike_attendance_event CASCADE;
DROP TABLE IF EXISTS spike_child CASCADE;
DROP TABLE IF EXISTS spike_organization CASCADE;

-- Root table. The real organizations table uses SELF_TENANT_ROOT
-- (id = app.tenant_id); the spike keeps that shape.
CREATE TABLE spike_organization (
  id   uuid PRIMARY KEY,
  name text NOT NULL
);

-- Tenant-scoped, TENANT_STANDARD. Stands in for `children`.
CREATE TABLE spike_child (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  full_name  text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Tenant-scoped write-hot table. Stands in for `attendance_events`.
CREATE TABLE spike_attendance_event (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  child_id    uuid NOT NULL,
  direction   text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

-- Tenant-led composite indexes, as Domain Model Part 6.2 requires.
CREATE INDEX spike_child_tenant_created_idx
  ON spike_child (tenant_id, created_at DESC);
CREATE INDEX spike_attendance_tenant_child_idx
  ON spike_attendance_event (tenant_id, child_id, occurred_at DESC);

-- ---------------------------------------------------------------------------
-- RLS. ENABLE alone leaves the table owner exempt; FORCE is what removes that
-- exemption and is mandated by Blueprint 4. Finding T-1 is a direct consequence
-- and is resolved in ADR-010.
-- ---------------------------------------------------------------------------
ALTER TABLE spike_child            ENABLE ROW LEVEL SECURITY;
ALTER TABLE spike_child            FORCE  ROW LEVEL SECURITY;
ALTER TABLE spike_attendance_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE spike_attendance_event FORCE  ROW LEVEL SECURITY;
ALTER TABLE spike_organization     ENABLE ROW LEVEL SECURITY;
ALTER TABLE spike_organization     FORCE  ROW LEVEL SECURITY;

-- TENANT_STANDARD. The `true` second argument to current_setting is
-- load-bearing: without it an unset variable raises instead of returning NULL,
-- and `tenant_id = NULL` is never true, which is what makes this fail CLOSED
-- (finding T-2). Both halves must be preserved.
CREATE POLICY tenant_standard ON spike_child
  FOR ALL
  USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_standard ON spike_attendance_event
  FOR ALL
  USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- SELF_TENANT_ROOT: a tenant sees only its own organization row.
CREATE POLICY self_tenant_root ON spike_organization
  FOR ALL
  USING      (id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (id = current_setting('app.tenant_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON spike_organization, spike_child, spike_attendance_event
  TO kf_api, kf_worker;

COMMIT;
