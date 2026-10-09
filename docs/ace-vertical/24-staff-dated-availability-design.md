# ACE dated staff availability contract

**Status:** C07e implementation contract. Oasis is a read-only workflow reference.

## Problem and outcome

NexSteps currently stores one full-day staff exception per date. Oasis lets staff
mark a whole day or a time window as unavailable. A profile save in NexSteps
replaces the entire exception list, so an isolated second store would risk
silently losing windows. C07e extends the existing site-scoped availability
record and uses one editor in the self and manager staff profiles.

Staff can record multiple non-overlapping windows on a date. The session staff
picker reports a conflict only when a window intersects the session. This is
informational: the existing manager assignment override remains available.

## Data and API

- Add `startMinute` and `endMinute` to `StaffUnavailableDate`, defaulting to
  `0` and `1440`. Existing rows remain whole-day exceptions. Replace the
  date-only unique index with a date-and-window unique index; add a database
  range constraint. Keep the current user and tenant foreign keys and RLS.
- The existing staff profile response and both PATCH routes return/accept each
  date, minute bounds, and optional reason. Omitted bounds in older clients
  mean a full day. Validate real calendar dates, range bounds, overlap on the
  same date, and a bounded input before a transactional replacement. All
  writes remain scoped to the selected site and target user.
- Serialize replacements for the same staff user with a transaction row lock so
  two saves cannot interleave and persist overlapping windows. The last
  completed profile save wins, consistent with the existing replacement API.
- Assignment eligibility compares each persisted window with the actual UTC
  session interval. A window on another date or outside the session does not
  block the candidate. Existing weekly preferences and group preferences still
  apply. UTC dates match the current rota contract; site-local scheduling is a
  later, explicit change.

## Web journey

The shared date-exception editor shows one month at a time, with a labelled
date, full-day choice, start/end inputs for a partial day, an Add action, and a
readable list of saved windows. It preserves windows in other months while a
user changes the visible month. The same component serves self and manager
profiles so one save path cannot erase data from the other. Use current
NexSteps surfaces, typography, focus, and feedback tokens; stack controls on
narrow screens. Invalid or overlapping windows receive visible text feedback.

## Security, failure, rollout

Keep the current authenticated selected-site profile permissions and do not
expose availability to parents or students. Validate on the API even when the
browser prevents a bad entry. A failed replacement must leave previous windows
intact. Migrate before deploying API and admin; the defaults preserve old rows.
If deployment fails before new windows are written, revert the app release
while retaining the additive columns. After new windows are written, roll
forward the API fix and pause availability edits during recovery: the previous
API's whole-list replacement can collapse multiple windows on one date. Test
old full-day payloads, partial overlap and no-overlap,
other-site isolation, validation, and all three profile editors. Expo follow-up:
add the same month/date/window editor and eligibility feedback after web parity.
