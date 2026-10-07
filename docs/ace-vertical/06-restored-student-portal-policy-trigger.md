# Restored student portal policy trigger

**Step DB-2c2.** The source snapshot keeps `StudentIdentityLink` and
`StudentPortalPolicy` in `public`. The active-link trigger still reads
`app."StudentPortalPolicy"`, so a valid link write fails when the policy table
is in `public`.

## Decision

Replace only `app.require_student_portal_link_policy()` in a forward migration.
Read the policy in `TG_TABLE_SCHEMA` with an escaped identifier and a bound
tenant ID. Keep the function in `app`, `SECURITY DEFINER`, its empty search
path, and its existing exception and lifecycle rules. No table, RLS, endpoint,
or entitlement change is needed.

PostgreSQL supplies the triggering table schema. A missing policy relation or
disabled policy must not permit an active link. Ended and revoked links remain
mutable so operators can close them even after the policy is disabled. The
existing tenant foreign keys and RLS remain independent access barriers.

## Verification and rollout

- Apply all migrations in disposable `public` and `app` databases. Test active
  links with enabled, disabled, absent, and other-tenant policies, plus ended
  and revoked links. Run the production-schema test in CI.
- Syntax-check the migration on the restored target in a rollback transaction.
  Merge only after all CI checks pass. Then apply this pending migration to the
  target and repeat a rollback-only behavior probe.
- No production traffic or deployment configuration changes in this step.
  The four remaining older trigger functions, migration-history discrepancies,
  strict RLS-gate mismatch, and configuration checks still block cutover.

If verification fails, publish a corrective forward migration; do not edit an
applied migration or reset the restored database.
