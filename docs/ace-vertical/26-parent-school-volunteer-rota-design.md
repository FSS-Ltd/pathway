# ACE school volunteer rota contract

**Status:** C07g0 design contract. Oasis is a read-only functional reference.

## Outcome and package boundary

Oasis lets a parent choose school support days within a term and shows staff
the resulting volunteer rota. In NexSteps, this belongs to ACE core at each
school site. The Oasis Primary and Secondary lunch and clubs placements remain
in the paid Clubs module; core pages and APIs must not expose or activate them.
The existing `VolunteerPreference` records describe weekly time preferences,
not dated reservations, and are not a safe persistence layer for this journey.

## Identity, data, and scheduling

- A parent's self-service access requires the site's parent portal to be
  enabled and a current, full-access guardian relationship to a non-guest child
  at that site. Derive the guardian identity from the authenticated user on
  every request. A linked child grants eligibility, not permission to see
  other parents' names or choose for another parent. A revoked or ended link
  ends access immediately; existing reservations remain in audit history and
  are hidden from that parent until a manager resolves them.
- Add a site-owned dated reservation with a composite site/guardian identity
  relationship, date, slot number, timestamps, and unique constraints on
  site/date/slot and site/guardian/date. Use the tenant's explicit
  `AceTeachingDate` records: only `TEACHING` and `EXCEPTIONAL_OPEN` days in an
  active academic period can be selected. Match Oasis's two school support
  spaces per day for this release. Do not infer school days from weekdays or
  invent a cross-site term calendar.
- The save command replaces the actor's choices in one selected academic
  period. Validate bounded, distinct dates before mutation. Serialize saves
  for the site and dates, then allocate free slots in a transaction so
  concurrent parents cannot overbook. Removing a choice leaves a dated audit
  event; it does not delete the history. Return a clear "just filled" conflict
  with refreshed availability when a race loses.
- Tenant RLS must cover parent self reads/writes and staff reads. All writes
  also enforce the guardian and operating-date rules in the service; RLS is a
  second boundary. Parent responses contain selected status and spaces left,
  never peer identities. Staff rota responses show only the parent display
  name and date after site-scoped rota access; no child or contact details.

## API and web journeys

- Parent: list available active periods and their operating days with
  `Available`, `Full`, or `Selected` state; save the chosen days for one period.
  The API uses the existing authenticated family site context and explicit
  site ID. `GET /ace/parent/sites/:siteId/volunteering` returns periods and
  days; `PUT /ace/parent/sites/:siteId/volunteering/periods/:periodId` accepts
  a bounded list of ISO date keys. Denied, expired-link, and wrong-site
  requests return no roster data.
- Staff: add school support reservations to the existing weekly team rota,
  using its active-site and bounded date range. The rota manager may inspect
  fill levels and volunteer names and cancel a reservation with an audited
  reason, including after a guardian link ends. Use
  `GET /ace/staff/sites/:siteId/volunteering?from=&to=` with
  `RotaAccessService.assertTeamViewer` and a manager-only cancel command.
  Ordinary authorised staff see only what their rota permission allows. A
  parent cannot call these endpoints.
- Web: add a parent family volunteering page with a period switcher, concise
  capacity/selected labels, one clear Save action, and a confirmation of what
  changed. Add a compact volunteer section to the staff rota. Use existing
  `@pathway/ui` tokens and the family/rota layouts; keep 44 px controls,
  visible focus, explicit loading, empty-calendar, full, pending, success,
  denied, and retry states. Keep the date and its state understandable without
  colour or motion. On narrow screens, use day rows rather than a dense grid.
  Do not display the Clubs placements or an upgrade prompt in this core flow.

## Verification and release

The implementation PR must cover schema/migration, RLS, guarded API, parent
and staff web flows, unit, integration, RLS, and browser journey tests together.
Exercise two parents racing for the last slot, removal and audit, wrong site,
revoked links, no calendar, closed days, site switching, and denied staff
access. Apply migration before apps, then check production responses and
runtime errors. Mobile follow-up: mirror the parent day picker and staff
volunteer section after web parity with the same access and capacity cases.
