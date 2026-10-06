# ACE attendance history and site scope

**Status:** Implementation contract for C06 in
[the Oasis parity matrix](02-oasis-web-journey-parity.md). This does not mark C06
released.

## Existing behaviour and boundary

Oasis provides a date register, authorised marking, student history, and
date-range insights in `apps/api/src/routers/attendance.ts`. Its student history
is a list of attendance records by date; it is not an immutable sequence of
changes to one record. NexSteps already supports Present, Absent, and Late on a
session register, requires a reason when a status changes, and exposes weekly
session summaries. The current `Attendance` row retains only the **latest**
`correctedAt`, `correctedByUserId`, and `correctionReason`. Repeated corrections
overwrite those fields, so they cannot serve as a full correction history.
Oasis also scopes its daily register by year band and records absence reasons;
the current NexSteps session register is not a substitute for those journeys.

NexSteps uses the selected tenant/site, fixed-role permissions, and its own
session model. No Oasis Clerk, tRPC, or single-centre assumptions transfer.
Staff reads require `attendance.read`; writes require `attendance.manage`.
Parent and student attendance views require separate linked-child/self and
release checks before they are exposed.

## Correction facts

Add an append-only `AttendanceCorrectionEvent` tied to an `Attendance` row,
child, and tenant. Store previous and new status, the nonblank reason,
correcting user, server timestamp, and origin (`LIVE` or `LEGACY_BACKFILL`). A
legacy backfill may recover the last saved correction metadata but **cannot**
recover the previous status or earlier overwritten corrections. Represent its
previous status as null and label it as a recovered last correction in the UI;
never invent a value or describe it as a complete history.

Use a tenant-scoped child foreign key, attendance foreign key, and database
trigger to verify that the attendance row belongs to that child and tenant.
RLS must require the current tenant for reads and inserts, with forced RLS and
no direct anonymous access. A database trigger must reject event updates and
deletes. New event inserts must verify actor membership in the selected site or
its organisation, following the ACE fact pattern; the HTTP permission guard
still decides who may write. The existing ACE actor trigger names PACE and
behaviour permissions, so it cannot be reused unchanged for attendance.
Index by tenant, attendance row, time, and ID for bounded newest-first history.

Both the single-row `PATCH /attendance/:id` and session bulk
`PUT /attendance/session/:sessionId` paths must lock the current row and insert
an event in the **same transaction** as a genuine status change. A same-status
save, initial attendance mark, or failed batch creates no correction event.
Continue to update the existing latest-correction columns for compatibility.
The service owns the actor, tenant, and timestamp; clients cannot supply them.
Concurrent corrections must record the actual preceding status in commit
order. A missing or cross-tenant child, session, or attendance row fails closed.
Read the updated session detail through the same transaction before returning
it; a global Prisma read inside that transaction may return stale rows.

## Read and web journey

Add a bounded, cursor-based history read for an attendance row, guarded by
`attendance.read`. Resolve the row in the selected tenant before querying
events; a foreign or missing row returns the same not-found response. Return
only the status transition, reason, actor display name, timestamp, legacy
marker, and next cursor. Do not expose general audit metadata. The cursor is
scoped to tenant and attendance row, has a fixed maximum page size, and rejects
tampering. Sign the cursor with the API's required `INTERNAL_AUTH_SECRET` using
an attendance-specific HMAC domain; key rotation invalidates issued cursors and
clients restart at the first page.

The session register shows a history action only for an existing attendance
row. Staff with read access can inspect it; only managers can correct a status.
Show loading, empty, error/retry, and paginated states. On a site switch,
discard the selected row and late responses. Preserve keyboard focus, readable
status text, and a clear label for recovered legacy metadata. Keep family and
student release views out of this staff step.

## Acceptance and rollout

1. Verify the schema, backfill, forced RLS, foreign keys, actor membership,
   append-only trigger, and cross-tenant denial with database tests. Do not
   run the migration against production until the source-to-new-project data
   migration and production migration gate are ready.
2. Verify initial marks and same-status saves do not create correction events;
   each changed status creates exactly one event with the correct before/after
   values; a failed bulk save leaves no partial events or changed rows.
3. Verify bounded history, cursor isolation, expired/revoked access tags,
   selected-site changes, and read-only versus manager web journeys. Confirm
   weekly summaries remain site scoped and use the latest statuses.
4. Gate the release on staging data checks, browser journeys, and production
   smoke tests. C06 remains partial until those checks pass.

Implement the data and RLS foundation, atomic writers, history API, and web
journey as separate PR steps under the repository's merge gate. Follow with
separate daily-register, absence-reason, student-history, and authorised export
work before claiming full C06 parity.
