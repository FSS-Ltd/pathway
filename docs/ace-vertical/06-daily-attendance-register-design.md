# ACE daily attendance register contract

**Status:** Step 1.3d5 design contract for C06 in the
[Oasis parity matrix](02-oasis-web-journey-parity.md). No daily-register schema,
API, web journey, migration, or production release is claimed by this document.

## Source behaviour and current gap

Oasis `apps/api/src/routers/attendance.ts` exposes one student mark per date,
a roster filtered by year band, Present/Absent/Late, and the absence
reasons Sick, Holiday, NotScheduled, Excused, and Unexcused. An Absent mark
requires a reason; another status clears it. Its write checks the operating
date and the recorder's assigned year-band scope. The Oasis capture screen
shows unmarked students and per-row save feedback. These outcomes are the
reference, not its Clerk, tRPC, or single-centre tenancy implementation.

NexSteps `Attendance` belongs to a session or group, records a timestamp
rather than a school date, and has no unique child/date key or absence reason.
Its correction events and weekly summaries describe session marks. Reusing
those rows for a daily register would make two sessions on one day ambiguous
and could double-count attendance. `Child.yearGroup` is free text, and there
is no active school enrolment, structured year band, dated staff band
assignment, or teaching-day calendar. `AcademicYear` and `AcademicPeriod` do
not establish that each date is an operating day.

## Decision and data boundaries

Step 1.3g1 establishes the site year-band catalogue and dated staff-band
assignments first. It adds no daily marks or roster endpoint. The assignment
write guard requires an active site member; later reads must recheck current
membership, typed permission, and the assignment's date range.
Step 1.3g1a makes that guard resolve membership and user rows in the
assignment table's schema or the restored `public` schema.

1. Add a distinct ACE daily attendance fact with `tenantId`, `childId`, a
   site-local `DATE`, status, nullable absence reason, recorder, and server
   timestamps. Enforce one row per `(tenantId, childId, date)` and composite
   tenant/child references. Keep session attendance and its correction history
   unchanged. Daily and session metrics must be named and queried separately.
2. Add explicit site-scoped school enrolment with child, academic year, start
   and end dates, and year band. A daily roster includes only children enrolled
   at that site on the requested date; guests and historical children do not
   appear by inference from `Child.yearGroup`. Add a structured site year-band
   catalogue and dated staff-to-band assignments. Migrate existing year-group
   text only after a site leader confirms its mapping; ambiguous records remain
   unassigned and cannot be marked until resolved.
3. Define teaching dates for each site and academic year, including holidays
   and exceptional opening days. Use the site's configured IANA timezone to
   turn a calendar date into an operating-day decision; reject a missing
   timezone or unconfigured date for writes. Do not infer teaching days from
   weekdays or period boundaries. A historical read remains possible for a
   previously recorded date after a calendar correction.
4. Store each changed daily status **or absence reason** as an append-only
   correction event with old/new values, a nonblank correction reason, actor,
   and server time. An initial mark and an identical save create no correction
   event. Do not silently rewrite or delete issued facts. Keep correction
   history separate from session correction events because their parent keys
   and change rules differ.

The daily fact and event tables need forced tenant RLS, tenant-scoped foreign
keys, actor membership checks, and indexes for site/date/band roster reads and
child/date history. A transaction must lock the daily row, write the fact,
event, and audit record together, and return the committed state. Concurrent
edits must record the actual preceding values in commit order. No production
backfill from session rows is safe without an explicit reconciliation source.

## API and access contract

| Planned route                                      | Permission          | Additional server boundary                                                                                                 |
| -------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `GET /attendance/daily?date=YYYY-MM-DD&bandId=...` | `attendance.read`   | Selected site; enrolled roster; actor's dated band assignments or full-site leader scope; bounded page and counts.         |
| `PUT /attendance/daily/:date/children/:childId`    | `attendance.manage` | Same site/date/roster/band scope; configured teaching day; status/reason validation; correction reason for a changed mark. |
| `GET /attendance/daily/:id/history`                | `attendance.read`   | Resolve the fact and band scope first; bounded, signed cursor scoped to site and fact.                                     |

Organisation heads and site leads may see their selected site's full roster
only when their fixed role grants the relevant typed permission. Other staff
need both the typed permission (possibly from a valid access tag) and a dated
band assignment. A tag never creates a band assignment or expands it. A
staff member with no valid assignment sees no child rows and cannot mark a
child. Expired/revoked tags and site switches are re-evaluated on every API
request. Parent and student access use separate linked-child/self and release
routes in later steps; they cannot call these staff routes.

The read returns the requested site-local date, permitted bands, counts limited
to the actor's roster scope, and paginated rows with child ID, display name,
year label, band, current status, reason, and recorded-at/by display facts.
An unmarked child has null mark fields. The response omits date of birth,
medical data, and other child notes.
The write accepts only `PRESENT`, `ABSENT`, or `LATE`; `ABSENT` requires one of
the five named reasons, while other statuses store null. The server supplies
tenant, actor, and timestamps. Invalid input is 400; missing permission is
403; a foreign, missing, or out-of-scope child/fact has the same 404 response;
a non-operating or unconfigured date is 409. Audit denied cross-band writes
without exposing the target child's details to the caller.

## Web journey and delivery order

The staff register selects a site-local date, shows permitted bands and
unmarked students, and allows a read-only staff member to inspect marks and
history. A manager can mark each row with a reason picker for Absent and a
correction explanation when changing a saved mark. Provide loading, empty,
error/retry, pending, and success states; keep focus and screen-reader status
after save; cancel or discard stale requests on a site/date switch. Show why a
date is closed and disable writes rather than letting a client-side date check
stand in for the server rule.

Deliver as separately gated PRs: enrolment/band/calendar and daily fact/RLS
foundation; scoped API reads and writes with correction history; staff web
journey; then student/parent history and authorised exports. Include absence
reason summaries only in daily metrics, and decide the `NotScheduled` rate
denominator explicitly in the reporting step. Do not claim C06 parity until
the read/write, family/student, export, staging, and production checks pass.

## Verification and release

- Test date-only parsing at timezone and daylight-saving boundaries, holiday
  overrides, unconfigured dates, active/inactive enrolment, unassigned bands,
  duplicate marks, and status/reason transitions.
- Test positive and denied reads/writes for heads, leads, assigned staff,
  unassigned staff, revoked/expired tags, parents, students, and site switches.
  Test cross-tenant RLS, foreign keys, append-only events, concurrent writers,
  bounded history, and audit atomicity against the database.
- Test keyboard, focus, labels, reason validation, pending/error/retry, and
  read-only web states in browser journeys. Keep session attendance regression
  tests green and verify daily facts do not enter session summaries.
- Apply additive migrations only after the new Supabase project has a verified
  source copy and migration baseline. Compare roster counts and sample daily
  marks at staging, then run production smoke tests and error monitoring before
  enabling the daily register. On failure, disable the new capability while
  retaining issued attendance and correction records for audited repair.
