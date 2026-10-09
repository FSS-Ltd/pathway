# ACE staff team rota contract

**Status:** C07d implementation contract. Oasis is a read-only workflow reference.

## Problem and existing data

Oasis staff can see their own weekly rota, a team schedule, and edit recurring
availability and dated exceptions in one workspace. The relevant references are
`oasis-portal/apps/api/src/routers/rota.ts` and
`oasis-portal/apps/web/src/components/rota/staff-rota-workspace.tsx`.
NexSteps already has site-scoped assignments and swaps, a manager rota at
`/sessions`, and staff-owned weekly availability and full-day exceptions at
`/staff/profile`. C07c repaired the staff swap picker. The missing staff outcome
is a readable team schedule alongside their own assignments. Oasis's partial-day
monthly exceptions, additional shift kinds, and parent volunteer rota remain
separate work.

## Access and data contract

- `GET /assignments/team-schedule?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD`
  requires an authenticated active-site context and an active staff membership
  at that site, a current legacy staff role there, or the existing fixed rota
  manager access. A parent, student, inactive user, or staff member of another
  site receives no team data. The range contains one to seven inclusive UTC
  dates and is validated at the API boundary. This matches the existing
  assignment week filter until site-local rota dates are introduced.
- Return only non-declined staff assignments for the selected site, ordered by
  session start then staff name. Each row carries the assignment ID, session ID,
  title, start/end times, group labels, role, status, staff ID, and display name.
  Do not return child, attendance, contact, safeguarding, or profile fields.
  Resolve names from the current site staff identity; no global user lookup is
  needed in the browser.
- The read is ACE core and does not activate a paid module. Availability stays
  in its current site-owned models and profile API; there is no migration or
  second availability store. Staff can reach the editor from My Schedule.

## Web journey and failure states

Keep **My assignments** as the first task on `/my-schedule`. Place **Team rota**
below it as a compact list grouped by operating day with time, session, group,
and named colleague. The existing week controls drive both views. Link to the
profile availability editor rather than duplicating its form or save state.
Use NexSteps' existing type, surface, and focus tokens. On narrow screens the
list stacks; no horizontal grid is required. A loading state never shows stale
site data. Empty, denied, failed, and retry states have clear text. The API
rejects invalid or excessive date ranges. Team rows are informational; only a
manager or assigned colleague may
open a session through the existing protected route.

## Verification and rollout

Test active-site staff and fixed manager reads; deny parent, inactive, and
other-site reads; assert the date bound and absence of child fields. Web
acceptance covers the team list, week/site switch, empty/error/retry, and the
availability link. Run lint, typecheck, API and admin tests/builds, formatting,
Graphify, PR CI, then production health and a signed-in schedule read. A failed
release reverts the app deployment; existing rota and availability records stay
intact. After web parity, Expo needs a staff team-week view and a profile
availability entry point with the same selected-site and denial tests.
