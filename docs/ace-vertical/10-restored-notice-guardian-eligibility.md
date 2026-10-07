# Restored notice guardian eligibility

**Step DB-2c6.** The restored target has `GuardianIdentity` and
`GuardianChildRelationship` in `public`, while ACE notice tables and the
eligibility helper are in `app`. The helper queries the absent `app` guardian
tables, so guardian audience snapshots cannot be validated. A catalog audit of
the target found this is the remaining function with references to relations
missing from `app` but present in `public`.

## Decision

Replace only `app.assert_ace_notice_audience_member_eligibility()` in a forward
migration. For guardian recipients, use the `app` identity table pair when both
relations exist; otherwise use the `public` pair. Select `SiteMembership` and
`StudentIdentity` together with the same precedence. If a required pair is
missing, fail closed. Quote the selected schema and bind tenant, user, and
guardian values.
Keep recipient-kind, current relationship, student, and staff checks and the
existing `SECURITY DEFINER` and empty search path. Do not alter the notice
author or audience triggers, their signatures, tables, or RLS policies.

An `app` identity pair takes precedence if both layouts exist. A stale or
empty `app` pair therefore denies guardian access rather than granting it from
another copy. The actual tenant and identity checks still apply in either
layout. The `app` staff and student views exist on the restored target, while a
fresh `public` layout keeps the underlying tables in `public`.

## Verification and rollout

- Apply the complete migration chain in disposable `public` and `app`
  databases. Exercise valid guardian, missing/ended/NONE relationships, wrong
  user and tenant, student, staff, and audience-kind cases in both layouts.
- Run the production-schema and integration CI checks, then syntax-check the
  migration on the restored target within a rolled-back transaction.
- After the PR passes and merges, apply only this pending migration to the
  target and run a rollback-only behavior probe. Keep traffic and deployment
  configuration unchanged.

The migration-history discrepancy, strict RLS-gate schema mismatch, and
project-specific Auth, secrets, and smoke checks still block cutover. Correct
future failures through a forward migration rather than editing applied
history or resetting the restored project.
