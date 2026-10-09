# ACE cover and meeting rota contract

**Status:** C07f implementation contract. Oasis remains a read-only reference.

## Problem and outcome

Oasis shows staff cover and meeting shifts beside teaching work. NexSteps
already has site-scoped `Session` and `Assignment` records, manager creation,
staff acceptance and swaps, and weekly personal/team rota views. A second
staff-shift table would duplicate the same assignment lifecycle. Add a typed
purpose to existing sessions and show it in those journeys instead.

Managers can create a cover or meeting session and assign active staff through
the existing routes. Staff see its purpose in My Schedule and Team rota and can
use the current acceptance and swap controls. This is ACE core. General school
volunteering remains a separate core journey; lunch and clubs volunteering
belongs to the paid Clubs workflow.

## Data and API

- Add `SessionRotaKind` with `STANDARD`, `COVER`, and `MEETING`; default every
  existing session to `STANDARD`. The existing session create and update DTOs
  accept the kind, but the API rejects changes after creation so existing
  attendance, lessons, and family records cannot be reclassified. No child
  data or new paid entitlement is involved.
- Cover and meeting sessions require a title and may have no class group.
  They cannot be published to families. Family timetable reads also filter to
  `STANDARD` as a defence against stale or malformed publication data. A
  standard session keeps its current behaviour.
- Personal assignment and team rota APIs include the kind. Existing site and
  actor checks still govern their reads and all writes. No new generic role or
  permission is created. Time conflict and availability feedback continue to
  use the existing candidate service.
- Keep dates as UTC instants at the API, matching the current session contract.
  Site-local rota dates remain a separately tracked improvement.

## Web journey and design

The manager's New session form has a labelled purpose selector with clear
copy. The chosen kind is sent through the existing create command. Staff
personal assignment cards and team rota rows show a readable kind label;
standard sessions keep the current compact appearance. Cover and meeting
items do not offer family publication or child attendance actions. The edit
form shows purpose as read-only. Child attendance reads and writes reject
staff shifts at the API. Reuse
NexSteps type, surface, badge, focus, and feedback tokens. The form remains
keyboard operable and narrow-screen friendly.

## Failure modes and release

Validate purpose and title at the API boundary. An invalid or denied write
returns a clear error without creating a session. The migration adds one
non-null column with a safe default. Apply it before deploying API/admin, then
test standard session regression, cover/meeting create and immutable purpose, denied
publish, family read exclusion, site boundaries, personal/team rendering, and
empty/error states. Roll back the app release if needed; the old app ignores
the extra column, while new cover/meeting records remain private. Expo
follow-up: show kind badges in staff rota and provide the equivalent manager
purpose control after web parity.
