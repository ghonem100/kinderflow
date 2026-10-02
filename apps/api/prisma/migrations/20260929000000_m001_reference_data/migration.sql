-- M-001 - enums and global reference tables (Blueprint section 4).
--
-- KF-S0-API-003. The FIRST migration in the chain: M-000 is provisioning, not a
-- migration, because kf_migrator is NOCREATEROLE and pg_stat_statements needs a
-- preloaded library. See infrastructure/postgres/bootstrap.sql and DISC-021.
--
-- Fourteen of the sixteen Domain Part 8 enums are created here. SyncStatus and
-- NotificationChannel are not: no approved document defines their members
-- (DISC-017) and PostgreSQL cannot usefully hold a valueless enum. Neither has
-- a table before M-005, so nothing here waits on them.
--
-- All six tables are RLS class GLOBAL_READ (Domain Part 6.1). Each carries its
-- class annotation directly below Prisma's own CreateTable marker, which is
-- where the migration linter requires it: the annotation must be the last
-- non-blank line before CREATE TABLE (KF-S0-CI-003 R2.3). Descriptive prose,
-- including this header, goes above it - and must never spell out a specimen
-- annotation, because the marker is meaningful anywhere in a comment and would
-- bind to whichever table came next.
--
-- Rollback: deploy the previous image; the schema stays (Blueprint section 4,
-- expand and contract only). Nothing here is destructive.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "lifecycle_status" AS ENUM ('PROVISIONING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'PENDING_DELETION', 'DELETED');

-- CreateEnum
CREATE TYPE "child_status" AS ENUM ('ADMITTED', 'ENROLLED', 'PAUSED', 'WITHDRAWN', 'ARCHIVED_RETENTION', 'PURGED');

-- CreateEnum
CREATE TYPE "invoice_status" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CREDIT_ADJUSTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'OTHER');

-- CreateEnum
CREATE TYPE "activity_type" AS ENUM ('MEAL', 'NAP', 'DIAPER', 'MOOD', 'LEARNING', 'NOTE', 'MEDICATION_ADMIN');

-- CreateEnum
CREATE TYPE "incident_severity" AS ENUM ('MINOR', 'SERIOUS');

-- CreateEnum
CREATE TYPE "incident_status" AS ENUM ('FILED', 'UNDER_REVIEW', 'APPROVED', 'NOTIFIED', 'ACKNOWLEDGED', 'CLOSED');

-- CreateEnum
CREATE TYPE "report_status" AS ENUM ('EMPTY', 'DRAFTING', 'PENDING_REVIEW', 'APPROVED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "attendance_direction" AS ENUM ('CHECK_IN', 'CHECK_OUT');

-- CreateEnum
CREATE TYPE "notification_status" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "consent_type" AS ENUM ('PHOTO_INTERNAL', 'PHOTO_GROUP', 'DATA_PROCESSING');

-- CreateEnum
CREATE TYPE "employment_status" AS ENUM ('ONBOARDED', 'ACTIVE', 'SUSPENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "media_status" AS ENUM ('UPLOADING', 'PROCESSING', 'READY', 'QUARANTINED', 'PURGED');

-- CreateEnum
CREATE TYPE "plan_code" AS ENUM ('SMALL', 'MEDIUM', 'LARGE');

-- CreateTable
-- @kf-rls GLOBAL_READ
CREATE TABLE "subscription_plans" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "code" "plan_code" NOT NULL,
    "limits" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- @kf-rls GLOBAL_READ
CREATE TABLE "roles" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "code" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- @kf-rls GLOBAL_READ
CREATE TABLE "permissions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "code" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- @kf-rls GLOBAL_READ
CREATE TABLE "role_permissions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- @kf-rls GLOBAL_READ
CREATE TABLE "feature_flags" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "key" VARCHAR(128) NOT NULL,
    "tenant_id" UUID,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- @kf-rls GLOBAL_READ
CREATE TABLE "prompt_versions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "prompt_id" VARCHAR(64) NOT NULL,
    "version" VARCHAR(32) NOT NULL,
    "content_hash" VARCHAR(64) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "prompt_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_code_key" ON "subscription_plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_id_permission_id_key" ON "role_permissions"("role_id", "permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flags_key_tenant_id_key" ON "feature_flags"("key", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_versions_prompt_id_version_key" ON "prompt_versions"("prompt_id", "version");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===========================================================================
-- HAND-WRITTEN BLOCK
--
-- Everything below this marker is authored. Prisma emits no RLS policies, no
-- triggers and no partial indexes, so Domain Part 8 makes them "customized
-- migration SQL in the same Prisma migration files ... generated DDL first,
-- hand-written blocks below a marker". Blueprint section 4's ordering rule puts
-- each table's RLS in the same migration as the table; that is followed here.
--
-- (The linter no longer ENFORCES same-migration RLS. The founder-approved F-3
-- decision in KF-S0-CI-003 made it resolve obligations across the whole corpus,
-- so a legitimate "enable RLS on an existing table" migration is not blocked.
-- Blueprint section 4 still says "linter-enforced", which is now false -
-- registered as DISC-024. The convention stands regardless.)
-- ===========================================================================

-- --------------------------------------------------------------------------
-- updated_at maintenance.
--
-- Domain Part 5.4 requires created_at/updated_at on every table, and this
-- task's Database Requirements ask for updated_at triggers. Prisma's @updatedAt
-- is client-side only: it emits the column with no default and relies on Prisma
-- Client to set it. That is not enough here for two reasons - the tier-1 seed
-- writes raw SQL through pg, and a trigger is the only thing that keeps the
-- timestamp truthful when anything other than Prisma Client does the writing.
--
-- So: a DEFAULT for inserts, and a BEFORE UPDATE trigger for updates.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

ALTER TABLE "subscription_plans" ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE "roles" ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE "permissions" ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE "role_permissions" ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE "feature_flags" ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE "prompt_versions" ALTER COLUMN "updated_at" SET DEFAULT now();

CREATE TRIGGER subscription_plans_set_updated_at
  BEFORE UPDATE ON "subscription_plans"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER roles_set_updated_at
  BEFORE UPDATE ON "roles"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER permissions_set_updated_at
  BEFORE UPDATE ON "permissions"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER role_permissions_set_updated_at
  BEFORE UPDATE ON "role_permissions"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER feature_flags_set_updated_at
  BEFORE UPDATE ON "feature_flags"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER prompt_versions_set_updated_at
  BEFORE UPDATE ON "prompt_versions"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- --------------------------------------------------------------------------
-- RLS - policy class GLOBAL_READ (Domain Part 6.1): "Readable by all
-- authenticated roles; writes platform-only."
--
-- ENABLE and a policy, and deliberately NO FORCE ROW LEVEL SECURITY. FORCE
-- removes the table owner's exemption, and kf_migrator both owns these tables
-- and runs the tier-1 seed after every deploy - forcing it would subject the
-- owner to a read-only policy and turn the seed into a silent no-op. That is
-- finding T-1 in ADR-010 section 7, and the migration linter encodes it as a
-- class rule, so adding FORCE here would fail the gate as well as the seed.
--
-- "Writes platform-only" is implemented as: no write policy at all. Non-owner
-- roles (kf_api, kf_worker) can read and cannot write, because RLS denies any
-- command for which no policy exists. Writes therefore happen only as the
-- owner - migrations and the seed.
--
-- ONE KNOWN FOLLOW-UP: API Contract section 2.17 gives the platform console
-- CRUD over feature flags (platform:flags:*), and that runs as kf_api. It will
-- need a write policy on feature_flags gated on the platform predicate. It is
-- NOT added here because no platform-plane table exists yet to gate on
-- (break_glass_grants is M-007), and a write policy with nothing to check would
-- be indistinguishable from an open one. Registered as DISC-025.
-- --------------------------------------------------------------------------
ALTER TABLE "subscription_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "role_permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "feature_flags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prompt_versions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY global_read ON "subscription_plans"
  FOR SELECT
  USING (true);

CREATE POLICY global_read ON "roles"
  FOR SELECT
  USING (true);

CREATE POLICY global_read ON "permissions"
  FOR SELECT
  USING (true);

CREATE POLICY global_read ON "role_permissions"
  FOR SELECT
  USING (true);

CREATE POLICY global_read ON "prompt_versions"
  FOR SELECT
  USING (true);

-- feature_flags is the two-tier row of Domain Part 6.2: a NULL tenant_id is the
-- global default, a non-NULL one is a single tenant's override. Both tiers live
-- in one predicate rather than waiting for a second policy class, so the table
-- has exactly one class annotation and the linter has one answer.
--
-- With no tenant context set, current_setting('app.tenant_id', true) is NULL and
-- only the global rows are visible - the correct default for a connection that
-- has not declared a tenant. NULLIF guards the empty string: ''::uuid raises,
-- and a session variable that was set and then cleared holds '' rather than
-- NULL.
CREATE POLICY global_read ON "feature_flags"
  FOR SELECT
  USING (
    tenant_id IS NULL
    OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );
