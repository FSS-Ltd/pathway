# ACE daily attendance register contract

**Status:** C06 contract in the
[Oasis parity matrix](02-oasis-web-journey-parity.md). Steps 1.3g1–1.3g4
established the schema. Step 1.3g5 adds the scoped staff roster read API.
Step 1.3g6 adds atomic daily mark and correction writes. Step 1.3g7 adds the
bounded staff correction-history read. Step 1.3g8 adds the staff web register
for marking, correction and history. Step 1.3g9 adds a student-only daily mark
history API. Step 1.3g10 adds a linked-parent daily mark history API. Step
1.3g11 adds parent and student web views for explicit site and child links.
Step 1.3g12 adds authenticated family site and child discovery. A family
landing page, exports and production migration remain open.

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
Step 1.3g2 adds dated school enrolment with composite site references,
academic-year bounds, a guest-child write guard, and non-overlapping child
date ranges. It does not infer enrolment from legacy `Child.yearGroup` text.
Step 1.3g3 adds one explicit teaching-date decision per site/date within an
academic year. Holidays, closures, and exceptional openings require a reason;
an unconfigured date remains closed to future daily-mark writes.
Step 1.3g4 adds the separate daily fact and append-only correction-event
tables with site, child, academic-year, teaching-date, recorder, and reason
constraints. The original recorder and time stay on the fact, while each
correction event stores its own actor and server time. The service must write
a changed mark, its correction event, and the audit entry in one locked
transaction; this schema step does not expose a daily-register API.
Step 1.3g5 exposes only the bounded staff roster read. It reads existing marks
without changing the session-attendance model or accepting daily writes.
Step 1.3g6 exposes one child/date mark write. It serialises initial marks and
corrections per site/child/date, rechecks the actor's manage permission and
dated band scope, and records a changed fact, correction event, and audit in
one transaction. An identical save leaves the history unchanged.
Step 1.3g7 reads the append-only daily correction events only after resolving
the selected-site fact and the actor's dated band scope. Pages are newest
first, bounded to 50, and use a signed cursor bound to the site and fact. A
corrected teaching calendar does not hide a previously issued fact's history.
Step 1.3g9 gives an authenticated student a bounded view of their own issued
daily marks through an explicit site route. The service checks the site's
student portal policy and exactly one active self-link on each read. It rejects
future dates in the site's timezone, missing timezones, revoked/ended links,
and other sites with the same not-found response. Only date, status and absence
reason leave this route; staff identities and correction notes stay private.
The site portal policy is the current release switch for issued daily marks;
there is no per-mark publication state. This endpoint does not expose an
attendance-rate denominator or a parent view.
Step 1.3g10 gives an authenticated parent a bounded view of one explicitly
selected child at one explicit site. Every read requires an active guardian
identity and a current `FULL` legal-access relationship to that non-guest
child. `LIMITED` and `NONE` relationships do not receive absence reasons or
marks because the model has no finer-grained attendance disclosure rule. The
organisation's parent portal switch must also be enabled on each read. A
disabled switch returns the same not-found response as an inaccessible child.
The student portal policy applies to student links only; it is not a parent
release switch. Issued daily facts are available immediately to a full-access
guardian. Missing, future-starting, ended, revoked and cross-site links use
the same not-found response. The shared bounded date and response contract
omits staff identities and correction notes.

Step 1.3g11 presents those scoped records in dedicated family web pages. The
family shell does not mount staff navigation, role lookup or organisation UI
requests. The student page takes a site ID and the parent page takes a site and
child ID from an explicit link; both call the existing guarded API and show
recorded-day counts without implying an attendance rate. These pages do not
yet discover a signed-in person's linked sites or children. Navigation from an
invitation or family landing page remains a separate step.

Step 1.3g12 adds `GET /ace/family/contexts` for a signed-in person. A narrow
forced-RLS read policy lets the API discover only that person's guardian and
student identity site IDs without a selected site. Each candidate site is then
rechecked in a tenant-scoped transaction. A parent context requires the
organisation's parent portal switch, an active `FULL` guardian relationship,
and a non-guest child. A student context requires the site's student portal
policy, exactly one active self-link, and a non-guest child. The response
contains only context kind, site ID/name and child ID/name. It does not grant
attendance access: the daily-history routes still recheck their own boundaries
on every request. The discovery policy adds no table grant to browser database
roles and no write permission. The read is limited to 100 identity sites per
kind; an excess fails rather than silently omitting links. The migration must
be applied before the endpoint can discover contexts in production.

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
