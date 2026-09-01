-- FIXTURE — must PASS, but only under the CORPUS rule (finding F-3).
--
-- This migration CREATES a tenant table and secures none of it. Its ENABLE,
-- FORCE, policy and tenant-led index all live in 11-corpus-split-secure.sql,
-- the way a real "enable RLS on an existing table" remediation migration is
-- written.
--
-- Pinned behaviour: linting THIS FILE ALONE with --file must exit 0. The
-- corpus is never narrowed by --file, so the obligations are found in the
-- sibling migration. Under the rejected same-file rule this fixture would
-- produce four false errors, which is exactly why that rule was rejected.

-- @kf-rls TENANT_STANDARD
CREATE TABLE fixture_split_table (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  label      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
