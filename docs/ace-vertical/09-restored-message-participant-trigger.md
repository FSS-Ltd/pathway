# Restored message participant trigger

**Step DB-2c5.** The restored project keeps message, identity, relationship,
and membership tables in `public`. `app.assert_message_participant()` still
queries those tables in `app`, blocking participant writes and removals.

## Decision

Replace only this trigger in a forward migration. Resolve related tables from
`TG_TABLE_SCHEMA` with quoted identifiers and bound row values. Preserve
participant identity immutability, conversation tenant binding, guardian
identity and current child relationship checks, current staff membership, the
student prohibition, and the existing rule that removed participants may be
closed after their relationship or membership ends. Keep `SECURITY DEFINER`
and the empty search path. No table, endpoint, entitlement, or RLS change.

The triggering table schema is supplied by PostgreSQL. Missing relations fail
closed. Dynamic `EXECUTE` does not set PL/pgSQL `FOUND`, so the conversation
lookup returns an explicit match flag. The conversation kind is compared as
text to support both schema layouts without a fixed enum reference.

## Verification and rollout

- Apply migrations in disposable `public` and `app` databases. Test valid
  guardian and staff participants, denied cross-tenant/invalid identities,
  missing or ended guardian relationships, students, and immutable updates.
  Check removed participants can close after membership or relationship loss.
- Run the test in CI's production-schema smoke. Parse the migration on the
  restored target inside a rolled-back transaction. After the PR passes all
  checks and merges, apply only its pending migration and repeat a rollback-only
  behavior probe on the target.
- Keep application traffic and deployment configuration unchanged. Notice
  eligibility, migration history, the strict RLS-gate schema mismatch, and
  project configuration still block cutover.

Correct failures through a new forward migration; do not edit applied history
or reset the restored project.
