-- FIXTURE — the second half of the revocation pair (round-2 R2.2, AC1).
--
-- All three statements that withdraw isolation, against a table that carries a
-- policy class. Each is an unconditional ERROR [isolation-revoked] naming the
-- table and quoting the statement.
--
-- Pinned behaviour, both directions: linting THIS file fails even though it
-- creates no table, and linting 19-revocation-compliant-create.sql fails too.
-- A PR normally contains only one of the two, so a rule that fired in only one
-- direction would be defeated by scoping.
--
-- There is deliberately no ordering machinery behind this. The gate does not
-- decide whether the revocation came before or after the grant; a migration
-- that revokes isolation is wrong in either order.

DROP POLICY tenant_standard ON fixture_reverted;

ALTER TABLE fixture_reverted NO FORCE ROW LEVEL SECURITY;

ALTER TABLE fixture_reverted DISABLE ROW LEVEL SECURITY;
