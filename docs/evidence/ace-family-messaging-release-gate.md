# ACE family messaging release gate: web evidence

**Build step:** 1.3e5p. **Status:** web security slice under review; ACE-M20 remains open.
Mobile verification is paused by product direction. This record does not approve
the full family, identity, and messaging release.

## Scope and controls

The web family landing now binds loaded contexts to the authenticated account ID
and clears the rendered child links while a different account's contexts load.
The server remains the authority for current site membership, parent portal
availability, guardian-child relationships, and conversation participation.
No schema or authorization rule changes are part of this step.

## Access and ID probes

`apps/api/src/messaging/tests/family-messaging-security.e2e.spec.ts` exercises
the real HTTP routes against PostgreSQL with separate school tenants:

| Actor or change                                     | Probe                                        | Expected result                                               |
| --------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------- |
| Teacher, supervisor, head                           | Staff conversation list                      | Allowed with current site membership and messaging permission |
| Support without site membership; guardian; student  | Staff conversation list                      | Denied, even when support has messaging permission tags       |
| Student                                             | Staff and parent conversation creation       | Denied; conversation count unchanged                          |
| Unjoined supervisor; staff from another school      | Known staff conversation ID                  | Hidden                                                        |
| Other guardian; student; wrong site                 | Known parent conversation ID                 | Hidden                                                        |
| Current guardian                                    | Parent conversation list and message history | Allowed while relationship and portal are active              |
| Parent portal disabled; guardian relationship ended | Parent conversation list                     | Denied on the next request                                    |

`apps/api/src/messaging/tests/messaging-notices.rls.e2e.spec.ts` separately
checks stored-message participant, author, receipt, tenant, and student identity
constraints. It proves the messaging topology has no student or child dimension
and rejects student participants and creators. The family landing component test
checks that student contexts have no Messages link and that child names/links
from a previous account are absent during the next account's loading state.

## Verification and remaining gate work

- Local PostgreSQL E2E: 7 messaging, identity, notice, and family-context
  suites, 73 tests passed together. The new suite's guardian relationships
  start explicitly in the past to avoid clock and database-timezone ambiguity
  at the participant trigger.
- The web component regression test, API/admin typechecks, lint, formatting,
  and builds passed locally. The admin build used a syntactically valid local
  Clerk test key and a test API URL; it did not contact a live school account.
  Latest-head CI is required before merge; record its actual result in the
  release status.
- The complete ACE-M20 matrix still needs independent probes for every notice,
  child, identity, message, and realtime topic ID, plus removed site membership
  across all routes. Web keyboard and screen-reader checks also need a signed-in
  environment. Mobile screenshots, interaction, accessibility, and offline
  baselines remain paused. No student direct-messaging release claim is made
  until API, navigation, compose, and realtime topic evidence are all recorded.

**Rollback:** revert the account-bound family landing change independently;
the existing server-side access rules and stored messages remain intact.
