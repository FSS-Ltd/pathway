# Restored ACE record actor membership trigger

**Step DB-2c3.** The restored snapshot stores ACE role and membership tables in
`public`. `app.require_ace_record_actor_membership()` still queries these
tables in `app`, so PACE and behaviour fact writes fail before the endpoint's
permission decision can take effect.

## Decision

Replace only this trigger function in a forward migration. Resolve its eight
membership and role tables from `TG_TABLE_SCHEMA` with quoted identifiers and
bind the tenant and actor values. Preserve all three accepted actor paths:
current site membership, legacy tenant role, or current organisation membership
with an active organisation-scoped role carrying an active ACE mutation
permission. Keep `SECURITY DEFINER`, the empty search path, existing exception,
and the endpoint permission guard. No role grant, RLS, or table schema changes.

The table schema comes from PostgreSQL's trigger context. Missing relations
fail closed. A matching user in another tenant, expired or revoked assignment,
inactive role, or inactive permission must not pass. The HTTP permission guard
continues to authorize each specific command; this trigger only verifies actor
membership.

## Verification and rollout

- Apply migrations to disposable `public` and `app` databases. Exercise each
  accepted actor path and denied tenant, assignment, role, and permission
  cases. Add the focused test to the production-schema CI smoke.
- Parse the migration on the restored target in a rollback transaction. After
  all CI checks pass and the PR merges, apply only its pending migration and
  repeat a rollback-only target behavior probe.
- Keep traffic and deployment configuration unchanged. The three messaging
  and notice functions, migration-history mismatch, strict RLS-gate schema
  mismatch, and target configuration still block cutover.

Correct any failure through another forward migration; do not edit the applied
migration ledger or reset the restored target.
