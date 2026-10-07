# Restored schema trigger compatibility

**Step DB-2c1.** The restored Supabase snapshot keeps most Prisma tables in
`public`. Disposable environments can put those tables in `app`. Two recently
added ACE trigger functions query `app` tables explicitly, so their checks fail
when the triggering table is in `public`.

## Decision

Replace only `app.require_active_pace_diagnostic_enrollment()` and
`app.require_attendance_correction_scope()` in a new forward migration. Resolve
related tables from `TG_TABLE_SCHEMA` with `pg_catalog.format('%I', ...)` and
bind row values through `EXECUTE ... USING`. Keep each function in the private
`app` schema, with `SECURITY DEFINER` and an empty search path. Do not change
the source migrations or relax their enrollment, attendance, actor, tenant,
timestamp, or immutability checks.

The trigger's table schema is supplied by PostgreSQL, not by a client value.
All related-table reads use that same schema. Missing relations fail closed.
The existing composite foreign keys and forced RLS remain the independent
record-scope barriers.

## Verification and rollout

- Apply the migration in disposable `public` and `app` databases. Test valid and
  denied diagnostic and attendance inserts in a disposable schema within a
  rollback transaction. Syntax-check the migration on the restored target in a
  separate rollback transaction.
- Run migration syntax and repository checks, then raise a separate PR. After
  its latest CI passes and the PR merges, apply only the pending migration to
  the new Supabase project and repeat the transaction-scoped probes there.
- Keep application traffic on the old project. The five earlier trigger
  functions with missing `app` relation references, migration-history
  discrepancies, strict RLS-gate schema mismatch, and project configuration
  remain separate release blockers.

Rollback is a forward correction of the two functions if verification fails;
the target has no application traffic, so the new functions may remain unused
while a correction is reviewed. Do not reset the restored database or edit
the applied migration ledger.
