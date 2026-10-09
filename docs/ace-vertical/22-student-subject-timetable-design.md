# ACE student subject timetable contract

**Status:** C07b design contract. C07a already publishes dated group sessions to
linked families. This contract covers Oasis's separate weekly subject grid;
neither grid substitutes for the other.

## Problem and source behaviour

Oasis has a term and age-band slot schedule, a subject draft for each student,
and a Head publication action that copies the draft into a dated, immutable
family-facing version. Its parent and student readers receive the latest
published version only. Its reference grid uses Tuesday to Friday. The relevant references are
`oasis-portal/apps/api/src/routers/timetable.ts`,
`oasis-portal/apps/api/src/services/timetable-data.ts`, and
`oasis-portal/apps/api/src/services/timetable-publications.ts`. Their Clerk,
tRPC, single-centre identifiers, and encryption implementation are not ported.

NexSteps has site-scoped `AcademicPeriod`, `AceYearBand`,
`AceSchoolEnrollment`, `Subject`, and `StudentSubjectEnrollment` records. It
does not have subject-grid drafts, reusable daily slots, or issued timetable
snapshots. The C07a `Session` publication timestamp represents dated group
sessions and cannot express a student's repeating subject allocation.

## Decisions and data model

1. The selected site (`tenantId`) owns every timetable row. A schedule belongs
   to one academic period and one year band. It has ordered slots with a kind
   (`LESSON` or `BREAK`), label, and start/end minutes in the site's local day.
   The Head explicitly selects the site's teaching weekdays for that schedule
   (one to seven); Oasis's Tuesday-to-Friday set may be offered as the ACE
   starting selection but is not imposed on other sites. A slot is shared
   across those days; a student's entries select the subject for a lesson
   slot on a particular selected weekday. No subject is assigned to a break.
   Validate one to sixteen ordered, non-overlapping slots, minute bounds, and
   distinct day/slot cells at the API boundary.
2. A draft belongs to one child, one academic period, and the matching
   schedule. A non-guest school enrolment must overlap the selected period in
   that site's academic year and year band. The draft's subjects must be active,
   site-owned, and have an active child-subject enrolment overlapping the
   period. Use composite site keys
   in foreign references, unique `(tenantId, childId, academicPeriodId)` for
   drafts, and unique `(draftId, day, slotId)` for entries. A schedule revision
   that changes slot identity must explicitly reconcile affected drafts; it
   must not silently carry assignments to the wrong time.
3. Publication copies period dates/name, year-band label, slot times/labels,
   weekday, and subject name/colour into versioned snapshot rows in one
   transaction. Store the draft version on each publication so a repeated
   publish of the same saved version fails reliably, even when timestamps
   fall in the same millisecond. Set `publishedAt` only after every entry has been written;
   an unsealed version is never returned to a family. After sealing, no entry
   may be added, edited, or removed. Historical versions must not change when a schedule or
   subject is later edited. Store `publishedAt`, publishing actor, and an
   optional `withdrawnAt`/actor/reason; withdraw an issued version through an
   audited command rather than deleting its history. The newest publication
   for a child and period is the family view only while it is not withdrawn.
   Withdrawing it does not automatically reveal an older version; the Head
   must explicitly publish a new version.
4. Use the existing `AcademicPeriod` as the term identity and its site-local
   date bounds. Do not copy Oasis's string term key or infer a term from a
   calendar date. Validate that the period belongs to the same academic year
   as the child's school enrolment and that its dates fall within that year.
   A cross-year enrolment must be rechecked at publication time.
5. Additive schema and forced tenant RLS come before API or UI use. Every new
   table has a site key, composite site references, forced RLS, and no direct
   browser role grants. Drafts and publication snapshots are queried only
   through the API's tenant context. The migration must work with the restored
   public-schema database as well as configured tenant schemas.

## Access and API boundaries

- Head workspace and all writes use selected-site membership plus the fixed
  `ace.settings.manage` permission. A scoped access tag can grant that typed
  key only under the existing delegation rules; it does not bypass site,
  child, year-band, or publication checks. No paid module entitlement applies.
- Head reads may show only the selected site's eligible year-band roster,
  schedule, draft state, and publication status. Bounded pages prevent a
  whole-organisation child dump. Draft save checks the schedule's current
  revision, every slot and subject, and the child's period-overlapping
  enrolment in one
  transaction. Publish rechecks those facts under a row lock and records an
  audit event. Empty lesson cells require explicit acknowledgement.
- Parent reads require the organisation parent-portal switch and a current
  `FULL` guardian relationship for the requested non-guest child at that site.
  Student reads require the site's student-portal switch and exactly one
  active self-link. Both use the same not-found response for absent,
  cross-site, revoked, ended, limited, and unpublished cases. Only an issued
  snapshot leaves these routes; draft rows, staff IDs, and audit metadata do
  not. Every read rechecks the relationship and switch, including after a
  site change. Auth remains mandatory before any site lookup.
- The existing family group-session route remains separate. The family UI
  labels the two views clearly as **Subject timetable** and **Sessions**.
  It never merges an unpublished subject draft with published sessions.

C07b2 Head routes use `/ace/subject-timetable` under the selected-site
request context. `GET` and `PUT`
`/periods/:periodId/year-bands/:yearBandId/schedule` read and save the slot
schedule. The same prefix has a paged `/roster` read and
`/children/:childId/draft` read/save. Draft saves send `scheduleUpdatedAt` and
`expectedVersion`; a new draft uses version `0`. `POST`
`/children/:childId/publish` requires the saved version, schedule revision,
and an explicit unassigned-lesson acknowledgement. A Head can read an issued
version at `/periods/:periodId/children/:childId/publications/:publicationId`
and withdraw the latest version through `/periods/:periodId/children/:childId/withdraw`.
Every route requires `ace.settings.manage`; a missing or cross-site record is
not returned.

## Web journey and design direction

The Head workspace starts with academic period and year band selection, then
shows the ordered slot schedule and a roster with Draft, Published, and Not
started status. The primary action opens one child's weekly grid. Each
lesson cell uses an explicit subject chooser; breaks are read-only. Save and
Publish are separate actions. Publish presents the version date, unassigned
lesson count, and an acknowledgement when needed. Show saving, conflict,
validation, success, and retry states beside the affected action.

Parent and student views use the existing family shell and linked context,
show the period/version date and a readable weekday grid, and support empty,
loading, denied, and retry states. Narrow screens show one day at a time with
keyboard-operable day tabs; wide screens show the week. Use shared NexSteps
tokens and components, visible focus, text labels alongside subject colour,
adequate contrast, and reduced-motion-safe feedback. No decorative motion is
needed to understand the timetable. The web experience is released before the
matching Expo screens.

## Failure modes, rollout, and verification

- A stale draft save fails with a conflict and a reload path. Concurrent
  publication commands serialize on the child's period draft so the latest
  version is deterministic. While drafts exist, schedule edits preserve slot
  identities and reject removal of a day with assignments; a changed slot
  layout must first be reconciled explicitly. A schedule change cannot rewrite
  issued copies.
- Missing or ambiguous year-band enrolment blocks draft creation and
  publication. It must not be guessed from free-text `Child.yearGroup`.
  Deactivated subjects remain in issued snapshots; new drafts cannot select
  them. Revoked family links immediately stop reads.
- C07b1 adds schema, constraints, RLS, and migration tests without a public
  route. C07b2 adds guarded Head schedule/draft/publish APIs and tests. C07b3
  adds scoped family reads and both web journeys. Each step gets its own PR,
  green current-head CI, merge, deployment, and smoke check before the next.
- Verify site isolation, role and tag denial, stale revision, overlapping
  slots, invalid subject enrolment, simultaneous publish, snapshot stability,
  withdrawal, portal switches, linked-child access, and revoked links. Run
  migration, RLS, unit, integration, browser, lint, typecheck, and affected
  builds for the implementing steps. Production should first receive additive
  tables with no new route; if a later app release fails, disable or revert
  that app while retaining published history for audited correction.

## Mobile follow-up

After web parity, add Expo parent and student subject-timetable screens with
the same scoped API, period picker, weekday navigation, loading/empty/error
states, and publication date. Acceptance tests must cover site switching,
revoked guardian or self links, disabled portals, and withdrawn publications.
