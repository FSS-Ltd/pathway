# ACE family messaging release gate: web evidence

**Build step:** 1.3e5p. **Status:** merged in PR #565; ACE-M20 remains open.
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
  All eight latest-head checks passed before merge; the checked revision and
  merge commit are recorded in the release status.
- The complete ACE-M20 matrix still needs independent probes for every notice,
  child, identity, message, and realtime topic ID, plus removed site membership
  across all routes. Web keyboard and screen-reader checks also need a signed-in
  environment. Mobile screenshots, interaction, accessibility, and offline
  baselines remain paused. No student direct-messaging release claim is made
  until API, navigation, compose, and realtime topic evidence are all recorded.

**Rollback:** revert the account-bound family landing change independently;
the existing server-side access rules and stored messages remain intact.

## Follow-up web ID and membership probes (step 1.3e5r)

The follow-up database HTTP suites exercise these access boundaries without
changing production authorization behavior:

All four affected suites ran against disposable PostgreSQL locally and passed
(18 tests). API typecheck, lint, build, formatting, and Graphify also passed.

| Resource or change                                                | Probe                                                           | Required result                |
| ----------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------ |
| Staff membership removed while a messaging permission tag remains | Staff conversation list, known conversation history, and send   | Denied; no message stored      |
| Staff-only notice ID                                              | Guardian detail, read, acknowledgement, and another-site detail | Hidden                         |
| Guardian invitation ID                                            | Other signed-in account and another real site                   | Hidden                         |
| Student invitation ID                                             | Other signed-in account and another school site                 | Hidden                         |
| Unlinked child ID                                                 | Guardian detail and edit                                        | Hidden; child record unchanged |

The current web API has conversation-ID and message-sequence routes, but no
standalone message-ID route or realtime-topic claim endpoint. The former has
database participant and sequence checks; the latter needs a separate gate if
realtime is introduced. Full ACE-M20 sign-off still needs the remaining access
matrix, signed-in web keyboard and screen-reader checks, and the mobile work
that the product owner paused.

## Family summary and web link follow-up (step 1.3e5w, [PR #572](https://github.com/FSS-Ltd/pathway/pull/572))

The family facade HTTP suite extends the release matrix with staff without a
guardian relationship, a guardian account that also has a student identity,
the disabled parent portal, and an inactive guardian account. Each direct
summary request must return no child data. The tests restore changed policy
and account state so later cases prove current access independently.

The family landing keeps the short visible labels that fit the existing card
layout. Each repeated child link includes the child's and school's names in
screen-reader text; each school link includes the school name. The component
test checks distinct link text and normal keyboard tab stops for a two-child
household. A signed-in browser screen-reader and keyboard session remains
required before the full ACE-M20 release gate can be claimed. Mobile work
remains paused.

## Direct message route follow-up (step 1.3e5y)

The PostgreSQL HTTP suite now probes sends and read cursors using an unjoined
staff conversation, an unjoined guardian conversation, and a valid conversation
ID under another school's route. Each request is denied without storing a
message or cursor. It also sends real messages to two conversations, then
checks that a sequence existing only in the other conversation cannot advance
the current participant's read cursor.

The suite checks that a disabled staff or guardian account loses direct
history, send, and read-cursor access. When the parent portal is disabled or
the guardian relationship ends, the parent list and direct routes return 404;
denied sends leave the stored-message count unchanged. Removed staff also lose
recipient, school-team, history, send, and read-cursor access even if a typed
messaging permission remains. The local disposable PostgreSQL run executed all
eight suite cases successfully. Full ACE-M20 sign-off still requires the
signed-in web keyboard and screen-reader check and the paused mobile baselines.

## Web account-bound view state (step 1.3e5z)

The shared admin session adapter masks its previous verified API identity on
the first render after a Clerk account change, before the session effect can
clear its state. ACE family deep-link views and invitation acceptance are
keyed to the current account and session status so their local data, forms,
and pending UI state cannot carry into another account. Timetable headings
also hide the prior child's name as soon as the session is no longer
authenticated. An invitation acceptance that finishes after its account-bound
view unmounts cannot continue to change the active site or navigate.

The session regression records every render across an account change and
rejects any frame containing the previous API identity. The timetable web
test loads a child's sessions, switches to another Clerk account while its
token is pending, and verifies that the old child's name and sessions vanish
before the new account's request returns. The signed-out timetable tests
check that a previous child's name is absent. This is component-level web
evidence; signed-in browser keyboard and screen-reader checks and mobile
baselines remain required for the full ACE-M20 gate.
