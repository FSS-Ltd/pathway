# Restored message conversation creator trigger

**Step DB-2c4.** The restored project keeps messaging identity and membership
tables in `public`. `app.assert_message_conversation_creator()` still reads
them from `app`, so conversation creation fails before its creator policy can
be evaluated.

## Decision

Replace only the conversation-creator trigger in a forward migration. Resolve
`StudentIdentity`, `GuardianIdentity`, and `SiteMembership` from
`TG_TABLE_SCHEMA`, quote that identifier, and bind tenant, user, and guardian
identity values. Keep `SECURITY DEFINER`, the empty search path, and the
existing policy: students cannot create conversations; a parent/staff
conversation needs its guardian or current site staff creator; staff direct and
room conversations need current site staff. No table, endpoint, or RLS change.

The schema is supplied by PostgreSQL's trigger context. Missing relations fail
closed. A matching identity or membership in another tenant cannot authorize
the creator. Existing conversation and participant constraints remain in force.

## Verification and rollout

- Apply migrations in disposable `public` and `app` databases and test valid
  guardian and staff paths plus denied student, unrelated guardian, missing
  guardian, and cross-tenant staff cases. Run the test in the production-schema
  CI smoke.
- Syntax-check the migration on the restored target in a rollback transaction.
  After CI passes and the PR merges, apply only the pending migration and run a
  rollback-only target behavior probe.
- Keep traffic and deployment configuration unchanged. The participant and
  notice eligibility functions, migration-history discrepancy, strict RLS-gate
  mismatch, and configuration checks still block cutover.

Correct failures through a new forward migration; never edit applied history
or reset the restored target.
