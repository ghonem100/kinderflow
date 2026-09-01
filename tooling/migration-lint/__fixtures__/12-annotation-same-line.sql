-- FIXTURE — must FAIL, naming the table (finding F-1, rework AC2).
--
-- The annotation trails the CREATE TABLE on the SAME LINE. The gate used to
-- consume such a line as an annotation only and never count the table, so this
-- exact table — a tenant table with no ENABLE, no FORCE, no policy and no
-- index — exited with "tables inspected: 0" and code 0.
--
-- Pinned behaviour: two ERRORs. The table is reported as unannotated
-- [policy-class-missing], and the misplaced annotation is reported as
-- [annotation-dangling]. A CREATE TABLE may never go uncounted because of
-- something else on its line.

CREATE TABLE fixture_sameline_leak ( id uuid PRIMARY KEY, tenant_id uuid NOT NULL ); -- @kf-rls TENANT_STANDARD
