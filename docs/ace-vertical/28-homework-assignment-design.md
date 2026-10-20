# ACE homework assignments: C02 delivery design

## Purpose and scope

ACE-C01 grants the homework capability subset without a Learning add-on. C02
adds staff assignment drafting and publication for ACE schools and ACE learning
centres. The staff web workspace ships with its API so a school can exercise the
same flow; student submission, family reading, review and evidence storage are
later C03–C05 work. The full homework release remains gated on ACE-M20.

## Record and state model

- `AceHomeworkAssignment` belongs to one site and stores the author, title,
  instructions, active subject, academic year, year band, due date, version,
  and one of `DRAFT`, `SCHEDULED`, `NEEDS_REVIEW`, `PUBLISHED`, or `CANCELLED`.
  A cancelled or published assignment is never edited in place. Schedule and publication timestamps
  are separate; cancelling retains the record and its audit history.
- `AceHomeworkRecipient` is the frozen child audience created in the same
  transaction that changes an assignment to `PUBLISHED`. Its composite foreign
  keys keep the assignment and child in one site, and its unique key prevents
  duplicate recipients. The row records the source enrolment and publication
  time. Later enrolment changes do not silently rewrite this audience.
- Use the existing ACE year band as the class and the site's active `Subject`
  as the subject. Publication selects active `AceSchoolEnrollment` rows for
  that year band on the ACE site's local publication date, with a valid academic year and a
  child still linked to the site. A band with no eligible pupils cannot be
  published. Archived/ended enrolments are excluded.
- The due date must follow the actual publication time and fit the selected
  academic year. A scheduled publication is revalidated when due; a stale
  audience, revoked author, inactive subject or changed year band leaves it in
  a review-required state rather than publishing to the wrong pupils.
  Scheduling stores a fingerprint of the intended child/enrolment roster;
  a later roster change blocks automatic publication until staff reviews it.

## Commands and access

- `GET/POST /ace/homework/assignments` lists and creates site-scoped drafts.
  `PATCH /:id` edits drafts. `POST /:id/schedule`, `/:id/publish`, and
  `/:id/cancel` perform explicit state transitions. The boundary parses all
  input with Zod and uses the existing auth, permission and tenant context.
- `ace.homework.assignments.manage` is required at the HTTP boundary. Site leaders may
  choose any active year band; a teacher must have a current staff year-band
  assignment. The service repeats site and class checks inside its write
  transaction; the schedule runner separately rechecks the typed permission.
- Assignment, recipient, audit and outbox writes use one tenant RLS transaction.
  The outbox event contains IDs and counts, not assignment text or child names;
  dispatch happens after commit. Idempotent state transitions return the
  already-published result without creating another audience or event.
- All assignment tables force tenant RLS, have composite tenant foreign keys,
  and deny direct `anon` and `authenticated` access. API reads and writes are
  scoped by site ID even when an ID from another site is supplied.

## Staff web flow

Use existing ACE page layout, fields, buttons and feedback patterns. The page
shows drafts, scheduled and published assignments with state labels and due
dates. Creating/editing uses labelled title, instructions, subject, class and
due-date controls. Publish and cancel require clear confirmation; scheduled
publish exposes the selected time. Loading, empty, validation, permission,
pending and error states remain usable at narrow widths and with a keyboard.
No student or guardian route is exposed in C02.

## Failure, rollout and verification

The API rejects stale versions, cross-site IDs, missing/archived enrolments,
inactive subjects, invalid due dates and revoked staff access. Scheduling
requires the existing authenticated cron secret; due runs recheck permissions
and publication inputs. A failed due item remains available for staff review.

The C02 PR will prove draft/edit/publish/schedule/cancel, class/subject
selection, frozen recipients, audit/outbox idempotency, wrong-tenant denial,
and RLS isolation in PostgreSQL HTTP tests. Admin interaction tests cover the
staff flow; a signed-in 320px keyboard/layout review remains a release check
once the merged page is deployed. Keep production publication
disabled until the M20 security gate and C02 release evidence are accepted;
rollback disables new publication while preserving drafts and historical rows.
