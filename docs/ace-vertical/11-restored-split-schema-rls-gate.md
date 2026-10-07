# Split-schema RLS gate for the restored project

**Step DB-2d1.** The strict RLS gate only accepts `schema=app` and looks for
every required table there. The restored project has 64 required physical
tables in `public` and 10 in `app`; none are missing or duplicated, and all
74 have RLS enabled and forced. The 15 reviewed role policies match. The
current gate reports a schema error before it can show these results.

## Decision

Allow a database URL selecting `app` or `public`, then check required tables
across both schemas. Require exactly one physical copy of each required table,
forced RLS, and the same reviewed role policies. Continue checking RLS and
grants on every table in the URL's selected schema, plus required tables in
the other schema. Preserve the existing explicit acceptance path for
non-required tables with disabled RLS or public grants; required-table grants
still fail even when that flag is set. A duplicate table fails rather than
choosing one copy.

This step changes only the audit script and tests. It does not grant or revoke
database privileges, change policies, or set the acceptance flag. On the
restored target, 63 required tables currently have `anon` or `authenticated`
grants, so the corrected strict gate should still fail and name those grants.

## Verification and rollout

- Unit-test single-schema and split-schema inventories, missing and duplicate
  required tables, and accepted URL schemas.
- Run the strict gate against disposable `app` and `public` databases. Run it
  read-only against the restored target and confirm its failure is due to
  remaining grants rather than a false missing-table result.
- Keep the new target off traffic. A separate reviewed step will assess and
  remove unnecessary grants after checking direct Data API consumers. The
  migration-history discrepancy and project configuration still block cutover.
