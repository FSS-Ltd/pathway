# ACE messaging web contract

**Step 1.3e0.** This is the implementation contract for C12 in the
[Oasis parity matrix](02-oasis-web-journey-parity.md). That design step added
no runtime API, web screen, database migration, or production release.

## Reference and current boundary

Oasis `apps/api/src/routers/message.ts` and
`apps/web/src/components/messages/message-centre.tsx` provide recipient
discovery, a paged conversation list, open/send, message history, unread counts,
and read feedback. Staff use direct and room conversations; parents contact
staff. These outcomes are the reference. NexSteps must use its existing NestJS
authentication, fixed-role/access-tag, and site-tenancy boundaries.

NexSteps already has `MessageConversation`, `MessageParticipant`, `Message`,
read-cursor and delivery tables, encrypted message bodies, tenant RLS, and
creator/participant eligibility triggers. Step 1.3e1a adds a read-only staff
conversation-list route. Step 1.3e1b adds read-only staff message history;
creation, sending, read-cursor writes, parent access, and web journeys remain
pending. The existing
`PARENT_STAFF` uniqueness constraint allows **one conversation per guardian
identity per site**, so the first web journey is a
school-team conversation, not one separate thread per staff contact. A site's
staff membership alone is too broad to make every staff member a parent-message
responder. The student role lists message permissions, but the current database
triggers prohibit student conversation creation and participation; student
messaging is unavailable until a separate safeguarding decision and schema
change are reviewed.

## Access and API contract

The server resolves the selected site from the authenticated request. Every
read and write checks the typed permission and **current** active participant,
tenant, and guardian or staff eligibility. A tag can grant a typed permission,
but cannot add a participant, extend a child relationship, or make a member of
another site eligible. Recheck access after a site switch, relationship end,
participant removal, or tag revocation. Return the same not-found response for
missing, foreign, and inaccessible conversations; never return child, guardian,
or message metadata in a denial.

| Planned route                                                 | Permission                                                                     | Additional boundary                                                                                                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /ace/messages/conversations?cursor=&limit=`              | `messaging.conversations.read`                                                 | Only conversations where the caller is an active participant in the selected site; bounded, newest-first page.                                                      |
| `POST /ace/messages/conversations`                            | `messaging.conversations.create`                                               | Parent opens or reuses their own `PARENT_STAFF` school-team conversation; staff direct/room creation requires current site membership and approved recipient scope. |
| `GET /ace/messages/conversations/:id/messages?before=&limit=` | `messaging.messages.read`                                                      | Recheck participant and relationship/membership; bounded sequence page, with only necessary sender display names and delivery facts.                                |
| `POST /ace/messages/conversations/:id/messages`               | `messaging.messages.send`                                                      | Active participant, nonblank bounded body, client request ID; atomic sequence allocation, message, recipient deliveries, and audit.                                 |
| `PUT /ace/messages/conversations/:id/read-cursor`             | `messaging.messages.read`                                                      | Advance only the caller's cursor to a sequence that exists in this conversation; never move it backward.                                                            |
| `PUT /ace/messages/conversations/:id/responders/:userId`      | `messaging.conversations.create` and fixed Organisation Head or Site Lead role | Assign a current same-site staff responder to this parent conversation; audit additions and removals. A tag alone cannot invoke this route.                         |
| `DELETE /ace/messages/conversations/:id/responders/:userId`   | `messaging.conversations.create` and fixed Organisation Head or Site Lead role | End an assignment without deleting message history; audit the removal.                                                                                              |

Conversation summaries include a stable ID, kind, permitted participant display
names, latest-message preview/time, and unread count. Message pages include
sequence, sender, body, time, and delivery/read state. The API decrypts bodies
only after access checks. List queries must avoid loading full message histories
or plaintext from other conversations. The send operation uses the existing
`clientRequestId` uniqueness key for retry safety; the same ID cannot create a
second message. A message's stored sequence and delivery state are authoritative
for UI feedback. Viewing a message must not silently mark it read: the web
client advances the cursor when the conversation is visible.

Parent creation is limited to their own current guardian identity and a linked
child in that site. A site leader assigns one or more approved staff responders
before parent sending is enabled; ordinary staff cannot join, discover, or
address parent conversations merely through site membership or a permission
tag. The API slice must enforce that assignment operation. This is a real gap
in the present schema: its participant trigger checks membership but does not
authorize **who added** a staff participant. Do not use Oasis's global
staff-recipient list as the NexSteps authorization rule. Staff direct and room messaging remain confined
to current site members and active participants. Notices use their separate
audience/receipt models and a later C12 slice; they are not chat messages.

The current request-context guard and effective-permission reader require an
organisation or site membership path. A guardian relationship alone does not
select a site or satisfy that reader. Parent routes need a separately reviewed
relationship-aware context and permission path before they can be enabled;
granting every guardian staff or organisation membership would widen access.
Step 1.3e1a therefore lists `STAFF_DIRECT` and `STAFF_ROOM` conversations only. It
requires an active user, a current selected-site `STAFF` or `SITE_ADMIN`
membership, an active staff participant, and the typed read permission. It
returns bounded newest-first pages and a 160-character message preview. Step
1.3e1b adds bounded history by message sequence after rechecking active staff
participation; reads do not move read cursors. Unread counts and parent/staff
threads wait for later slices. The send slice must update conversation
`updatedAt` after the database allocates a message sequence so the list's
activity order remains correct.

## Web design intent

Build the web surface on shared `@pathway/ui` tokens and the NexSteps teal,
neutral, and status colours. Use a two-pane conversation list and detail view
where width permits, with a persistent selected row and a single-pane list or
conversation on compact screens. The list shows contact or school-team name,
one-line preview, time, and a labelled unread count. The detail view has a
clear header, date separators, readable incoming/outgoing rounded bubbles,
message time, and text delivery/read feedback. Use colour and alignment to
orient people, never colour alone to convey state. A fixed composer offers a
labelled multiline input and explicit Send button; Enter submits only when
appropriate and Shift+Enter inserts a newline. Preserve drafts and scroll
position when switching conversations or sites without sending a stale draft
to the new site.

Loading, no conversations, no messages, send pending, send failure/retry, and
access-ended states need distinct copy and controls. Keep failed text in the
composer. Never show a success bubble before the server confirms its ID and
sequence. Use semantic list and message structure, visible keyboard focus,
screen-reader announcements for new messages and send results, touch-friendly
controls, sufficient contrast, and no essential motion. Respect
`prefers-reduced-motion`. Keep notices visually separate from private chat.

This adapts the Apple design skill's [split-view](https://developer.apple.com/design/human-interface-guidelines/split-views),
[colour](https://developer.apple.com/design/human-interface-guidelines/color),
[typography](https://developer.apple.com/design/human-interface-guidelines/typography),
[accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility),
and [motion](https://developer.apple.com/design/human-interface-guidelines/motion)
guidance to responsive web; these guidelines are design sources, not a runtime
dependency or a claim that this web screen is an Apple platform screen.

## Delivery and verification

1. API and, if needed, responder-assignment schema: implement the routes above
   with transaction-level RLS and request tests for parent, approved staff,
   unassigned staff, student, expired/revoked tags, ended links, site switches,
   duplicate send, concurrent sequence allocation, and denied ID probes.
2. Staff web: list, select, send, read feedback, and direct/room journeys with
   loading/error/empty states; browser tests at wide and compact widths.
3. Parent web: school-team thread and composer only after responder assignment
   is enforced; browser tests for linked and unlinked family accounts.
4. Notices: separate audience, publish, list, and receipt API/web slices. Do
   not mark C12 complete until notice read state and denied audiences work.

Each item needs its own PR and merge gate. Mobile screen equivalents and
acceptance tests are documented after web parity; this step changes no Expo
screen. Production smoke testing follows the separate release and database
cutover gates.
