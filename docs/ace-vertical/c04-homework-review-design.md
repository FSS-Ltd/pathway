# ACE-C04: homework review, release and notifications

## Purpose and scope

An assigned ACE staff member must be able to review the latest submitted
version of a pupil's homework, return it for changes or complete it, and
explicitly release completed feedback to the family. This step combines the
staff web review control with its API and content-safe notifications. C04 adds
minimal student and guardian read DTOs for feedback policy; the full family
and student workflows remain part of C05. Mobile stays paused.
The M20 release gate still controls live enablement.

## State and access decisions

- A submission has one immutable review decision per submitted version.
  `RETURNED` reopens the submission for a new immutable student version;
  `COMPLETED` closes editing. A second reviewer cannot overwrite a decision.
  A repeated command with the same idempotency key returns the same decision;
  a different decision conflicts.
- A returned review's student feedback is visible to that student immediately.
  Completed feedback stays staff-only until a separate family release action.
  Staff-only notes are never selected into student or guardian DTOs.
- Review and release require `ace.homework.reviews.manage`, an active staff
  account and current site membership, plus a current assignment to the
  homework's class unless the reviewer is a site admin. The API rechecks this
  inside the tenant transaction for every read and command. The review queue
  is filtered to those classes before returning child details.
- The review queue exposes metadata only for `CLEAN` evidence. Private evidence
  download waits for the C03 scanner and bucket gate and must recheck reviewer
  access before a signed read is added. URLs never enter list DTOs, outbox
  payloads or audit records.
- Keep review commands behind a default-off `ACE_HOMEWORK_REVIEWS_ENABLED`
  switch. Existing submitted work remains readable if the switch is turned
  off, while new decisions, releases and notifications stop.

## Data and delivery

Add an `AceHomeworkReview` row with tenant-scoped foreign keys to the exact
submission version and reviewer. Store the decision, bounded student feedback,
bounded staff note, reviewed time, and nullable release actor/time. A unique
version key and row locking prevent concurrent decisions. Database constraints
and triggers preserve the decision and notes after creation; only the one-way
release fields may change. Use the existing tenant FORCE RLS pattern.

Emit one outbox email event per eligible user for assignment publication,
submitted version, returned decision and family release. C02 already emits its
publication event. A dedicated API cron runner,
following the deployed message-email runner, claims only these event types;
the generic worker excludes them. Resolve current linked accounts and access
at dispatch time. Publication alerts go to current student and guardian accounts;
submission
alerts to current class staff, and return/release alerts to the affected student
or linked guardians. Email contains only a generic action prompt,
never homework content, feedback, child name or evidence details. A per-event,
per-user delivery claim prevents automatic duplicate sends after an uncertain
provider outcome. Expired claims become dead letters for operational review
without an automatic resend. Provider failures remain visible for review.

The plan names a worker job, but the production deployment already schedules
API cron functions for ACE notices, homework publication and message email.
Using that runner is the smallest deployed path; a standalone worker without
a scheduled runtime would not send these alerts.

## Verification and rollout

First write PostgreSQL HTTP tests for staff scope, review/return/completion,
student feedback visibility, family release, concurrent decisions and immutable
history. Exercise the cron policy with duplicate,
revoked-account, wrong-tenant and provider-failure cases. Add staff UI tests for
loading, empty, denied, pending, error and success states, including keyboard
focus at narrow width. Run schema migration in both `app` and `public` layouts,
then type, lint, format, relevant unit/integration and build checks.

The flag stays off until M20, the C03 scanner and private bucket, a linked
school review, and a safe notification delivery test are evidenced. Rollback
turns the flag off and pauses the cron; immutable decisions and delivery claims
remain for audit. The ACE master-plan count remains 48/150 until full plan
acceptance is evidenced.
