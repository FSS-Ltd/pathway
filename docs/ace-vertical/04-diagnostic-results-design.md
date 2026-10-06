# ACE diagnostic results

**Status:** Implementation design for C05 in
`02-oasis-web-journey-parity.md`. Oasis is a read-only functional reference.

## Outcome and reference rule

A permitted ACE leader can record a level 1–5 diagnostic Pass or Fail for an
active child and subject, review the site-scoped history, and retract a mistaken
result without erasing its audit trail. Oasis's `recordDiagnostic` writes the
result and audit entry but deliberately leaves the subject assignment PACE
unchanged; its test asserts that no assignment update occurs. NexSteps will
preserve that rule. A diagnostic outcome does not determine a unique PACE
number, so applying a placement requires a separate, explicit decision and
reason.

The existing subject-placement revision is not yet a safe shortcut for that
decision after assessments exist: `StudentSubjectsService.place` creates a new
active enrollment, while `PaceQueryService.getChildProgress` prefers the
existing `PaceProgress` row for the same child and subject. C02 must reconcile
that projection and its rebuild baseline before a diagnostic can offer an
"Apply placement" action. C05 does not write enrollment or progress.

## Data and access

- Store each result as a site-owned `PaceDiagnosticResult` fact with tenant,
  child, subject, active enrollment at recording time, level, outcome, actor,
  and timestamp. Preserve the result when the enrollment later ends. Validate
  level 1–5 and Pass/Fail at both the API boundary and database constraint.
- Represent a mistaken result with one linked retraction fact carrying the
  actor, time, and required reason. The original result is retained. A second
  retraction conflicts. Default history shows active results while an explicit
  history view includes retracted results and their reason.
- Use composite site-bound foreign keys, indexes for bounded child/subject
  history, actor-membership checks, and forced tenant RLS. Do not grant direct
  table access to Supabase `anon` or `authenticated` roles.
- Introduce typed `ace.pace.diagnostics.read` and
  `ace.pace.diagnostics.manage` ACE-core permissions for fixed Organisation
  Head and Site Lead templates. Add them to the existing `pace-full-access`
  tag only when the C05b API's site and child checks and the actor-held
  delegation tests pass **and existing grants can be reviewed**. Expanding a
  live tag would immediately widen current holders' access without a new
  grantor decision; the source database is unavailable for that inventory.
  Staff, parents, and students have no diagnostic access through their fixed
  roles. The ACE vertical must be active for both permissions to take effect.
- Every API query and command uses the trusted active site from the request
  context. Recording requires an active child/subject enrollment in that
  site; retraction can correct a historical result after its enrollment ends
  but must verify that the result belongs to the active site. The fact, audit
  event, and outbox event commit together. Retraction never deletes the fact.

The C05a2 migration serializes a result insert with an enrollment status
change by locking the active enrollment row. It stamps result and retraction
times at the database boundary and rejects updates or deletes to either fact.

## API and web journey

Provide a bounded `GET /ace/pace/diagnostics` filtered by child and subject,
`POST /ace/pace/diagnostics`, and
`POST /ace/pace/diagnostics/:id/retraction`. Use a cursor scoped to tenant,
child, subject, and retraction filter. Return only the fields needed by the
leader's web screen; never accept tenant, site, or actor IDs from the client.
No endpoint changes the assignment PACE as a side effect.

The admin journey uses the active site's child/subject selection, a clearly
labeled level and outcome form, pending/error/success states, and a history
list with accessible retraction confirmation. It refreshes after a successful
write or site switch and ignores an in-flight response from a previous site.
Show result and retraction status in words as well as colour. The separate
placement screen may later link from a result only after C02 projection
reconciliation is verified.

## Delivery and verification

1. C05a1 added typed ACE-core permissions to the registry and fixed leader
   templates in PR #368, without adding them to a delegable tag. C05a2 adds
   schema, forced RLS, and actor constraints.
   Verify same-site allow and cross-site/organisation denial on disposable
   PostgreSQL, plus migration and role-grant checks.
2. C05b1 adds bounded, site-scoped history reads. C05b2 adds audited
   record/retract commands. Test invalid level/outcome, inactive enrollment,
   denied personas, stale site, duplicate retraction, cursor scope, and
   audit/outbox rollback across the two steps.
3. C05c adds the ACE web journey and tests keyboard, loading, empty, conflict,
   success, and site-switch states. C05 closes only when API and web outcomes
   are merged and verified.

The production migration remains deferred while the source Supabase project
is unavailable. Apply in staging and smoke-test the API and admin journey
before the manual production release. If the new web route fails, hide its
navigation and revert its app release; retain issued diagnostic and retraction
facts for audited correction.
