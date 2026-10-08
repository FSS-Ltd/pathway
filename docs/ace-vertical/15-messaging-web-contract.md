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
conversation-list route. Step 1.3e1b adds read-only staff message history.
Step 1.3e2a adds staff direct conversation creation, step 1.3e2b adds
staff direct and room message sending, and step 1.3e2c adds site staffroom
opening. Step 1.3e2d adds its web control, step 1.3e4a adds a read-only
parent conversation list, step 1.3e4b adds read-only parent message history,
step 1.3e4d adds parent responder discovery and school-team creation, and
step 1.3e4e adds parent message sending. Step 1.3e4f adds the parent web
school-team journey. The existing
`PARENT_STAFF` uniqueness constraint
allows **one conversation per guardian identity per site**, so the first web
journey is a school-team conversation, not one separate thread per staff
contact. A site's staff membership alone is too broad to make every staff
member a parent-message responder. The student role lists message permissions,
but the current database triggers prohibit student conversation creation and
participation; student messaging is unavailable until a separate safeguarding
decision and schema change are reviewed.

## Access and API contract

The server resolves the selected site from the authenticated request. Every
read and write checks the typed permission and **current** active participant,
tenant, and guardian or staff eligibility. A tag can grant a typed permission,
but cannot add a participant, extend a child relationship, or make a member of
another site eligible. Recheck access after a site switch, relationship end,
participant removal, or tag revocation. Return the same not-found response for
missing, foreign, and inaccessible conversations; never return child, guardian,
or message metadata in a denial.

| Planned route                                                                      | Permission                                                                     | Additional boundary                                                                                                                                                      |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /ace/messages/conversations?cursor=&limit=`                                   | `messaging.conversations.read`                                                 | Only conversations where the caller is an active participant in the selected site; bounded, newest-first page.                                                           |
| `GET /ace/messages/conversations/school-team?cursor=&limit=`                       | `messaging.conversations.read`                                                 | Separate bounded parent-thread inbox for a current approved staff responder in the selected site, while the parent portal and full guardian link remain active.          |
| `GET /ace/messages/conversations/school-team/:id/messages?before=&limit=`          | `messaging.messages.read`                                                      | Bounded newest-first history for the same current responder and active guardian thread; reading never advances a cursor or claims a parent read receipt.                 |
| `GET /ace/parent/sites/:siteId/messages/conversations`                             | `messaging.conversations.read` from the fixed Parent template                  | Active full guardian relationship and participant in the requested site; parent portal enabled; at most one school-team thread.                                          |
| `GET /ace/parent/sites/:siteId/messages/conversations/recipients?search=&limit=`   | `messaging.conversations.create` from the fixed Parent template                | Current same-site staff with an active fixed Head/Lead role or parent-message-responder tag; return at most 20 names and IDs.                                            |
| `POST /ace/parent/sites/:siteId/messages/conversations`                            | `messaging.conversations.create` from the fixed Parent template                | Parent selects a current approved responder; open one audited `PARENT_STAFF` thread for the guardian or reuse it without changing responders.                            |
| `GET /ace/parent/sites/:siteId/messages/conversations/:id/messages?before=&limit=` | `messaging.messages.read` from the fixed Parent template                       | Only the requested school-team thread while the guardian relationship and participant remain current; bounded newest-first sequence page without moving the read cursor. |
| `POST /ace/parent/sites/:siteId/messages/conversations/:id/messages`               | `messaging.messages.send` from the fixed Parent template                       | Current guardian participant and at least one current approved staff responder; bounded body, stable client request ID, deliveries to eligible responders, and audit.    |
| `PUT /ace/parent/sites/:siteId/messages/conversations/:id/read-cursor`             | `messaging.messages.read` from the fixed Parent template                       | Only the current guardian participant in their own school-team thread may advance to an existing sequence; the cursor cannot move backward.                              |
| `POST /ace/messages/conversations`                                                 | `messaging.conversations.create`                                               | Staff direct/room creation requires current site membership and approved recipient scope.                                                                                |
| `GET /ace/messages/conversations/recipients?search=&limit=`                        | `messaging.conversations.create`                                               | Current active staff in the selected site only; excludes the caller and student identities. Search needs 2–80 characters and returns at most 20 names and IDs.           |
| `GET /ace/messages/conversations/:id/messages?before=&limit=`                      | `messaging.messages.read`                                                      | Recheck participant and relationship/membership; bounded sequence page, with only necessary sender display names and delivery facts.                                     |
| `POST /ace/messages/conversations/:id/messages`                                    | `messaging.messages.send`                                                      | Active participant, nonblank bounded body, client request ID; atomic sequence allocation, message, recipient deliveries, and audit.                                      |
| `PUT /ace/messages/conversations/:id/read-cursor`                                  | `messaging.messages.read`                                                      | Advance only the caller's cursor to a sequence that exists in this conversation; never move it backward.                                                                 |
| `PUT /ace/messages/conversations/:id/responders/:userId`                           | `messaging.conversations.create` and fixed Organisation Head or Site Lead role | Assign a current same-site staff responder to this parent conversation; audit additions and removals. A tag alone cannot invoke this route.                              |
| `DELETE /ace/messages/conversations/:id/responders/:userId`                        | `messaging.conversations.create` and fixed Organisation Head or Site Lead role | End an assignment without deleting message history; audit the removal.                                                                                                   |

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
select a site or satisfy that reader. The read-only parent list therefore uses
an explicit site path, the fixed Parent template's typed read permission, and
current full guardian relationship and participant checks. It does not give
guardians staff or organisation membership. Parent creation, sending, and
responder assignment still need their own relationship-aware and audited
authorization path; granting every guardian staff or organisation membership
would widen access.
Step 1.3e1a therefore lists `STAFF_DIRECT` and `STAFF_ROOM` conversations only. It
requires an active user, a current selected-site `STAFF` or `SITE_ADMIN`
membership, an active staff participant, and the typed read permission. It
returns bounded newest-first pages and a 160-character message preview. Step
1.3e1b adds bounded history by message sequence after rechecking active staff
participation; reads do not move read cursors. Step 1.3e1c adds explicit,
forward-only read-cursor writes for a sequence in the caller's staff
conversation. Parent/staff threads wait for later slices.
Step 1.3e2b updates conversation `updatedAt` using database time after the
database allocates a message sequence so the list's activity order remains
correct.

Step 1.3e2a opens or reuses one `STAFF_DIRECT` conversation for two current,
active staff members in the selected site. It checks the recipient's site
membership and excludes student identities, serializes the pair under a
transaction lock, and audits new conversations. Parent, room, and student
creation remain unavailable through this route.

Step 1.3e3b1 adds recipient discovery for that staff-direct route. The
server checks the create permission and current staff membership, searches
active staff only in the selected site, and returns display names and user IDs
without email or other profile details. The result is capped at 20; callers
refine the search to find additional people. Discovery does not authorize
conversation creation, which rechecks recipient eligibility in its own
transaction.

Step 1.3e2b sends a bounded, nonblank staff message with a UUID client request
ID through an active `STAFF_DIRECT` or `STAFF_ROOM` conversation. The sender
and every active participant must still be an active staff member of the
selected site. The transaction serializes retries for the same sender and
request ID, returns the original result for a matching retry, writes one
delivery for each recipient, and audits the new message without its body.
The existing Prisma encryption layer protects the body at rest. A reused ID
with different text is rejected; parent and student messages are unavailable
through this route.
Step 1.3e2c opens or reuses one shared staffroom per selected site, as in the
Oasis staffroom journey. It serializes opens for the site, requires the typed
create permission and current staff membership, and includes only active,
non-student staff with a current membership in that site. Opening an existing
room adds new members, restores returning members, and ends participation for
former members, with audited membership changes. At least two current staff
are required. Duplicate pre-existing rooms fail closed for reconciliation;
the command does not create arbitrary named group chats. A send still rechecks
every active participant. The web control must call open on entry so ended
members are reconciled before a staff member sends. Newly joined or returning
staff can read earlier room messages while their current site membership and
read permission hold; the staffroom is not a safeguarding case record.

Step 1.3e4a lists the authenticated guardian's single `PARENT_STAFF`
school-team conversation for an explicitly requested site. It requires an
active, non-student user, the fixed Parent read permission and active
permission definition, the parent portal switch, a current full relationship
to a non-guest child, and an active guardian participant. It returns no
conversation data for unlinked or removed people. A linked guardian with no
thread receives an empty list. The list includes only the latest preview and
unread count; creation, message history, read cursor, and sending were
unavailable to parents in that slice. Step 1.3e4b adds bounded parent history
for that thread with explicit site and conversation IDs. It repeats the current
guardian, participant, portal, and fixed Parent read-permission checks before
reading message bodies. It returns only sender display names from that thread
and does not update read state. Step 1.3e4c adds an explicit parent read-cursor
write for an existing message sequence in that thread. It rechecks the current
guardian relationship, participant, portal, and fixed Parent read permission;
the cursor advances atomically and cannot regress. Step 1.3e4d lets the parent
choose a current staff responder from their site. Eligibility requires an
active fixed Organisation Head or Site Lead assignment, or a current scoped
`parent-message-responder` tag, plus active staff membership and no student
identity. Both discovery and creation recheck eligibility, the full guardian
relationship, the parent portal, and the fixed Parent create permission. The
open command serializes concurrent requests per guardian and audits a new
thread. Reopening the existing thread never changes its staff participants;
later responder assignment belongs to authorised site leaders. Parent sending
and web access remain later slices. Step 1.3e4e lets a current linked parent
send in that thread after rechecking the parent portal, guardian relationship,
participant, fixed Parent send permission, and current approved staff
responders. The request uses the same bounded body and stable client request
ID as staff sending. Matching retries reuse the first message; a changed body
with the same ID is rejected. New messages deliver only to current approved
responders and are audited without storing plaintext in the audit record.
Step 1.3e4f adds `/ace/parent/sites/:siteId/messages` for a linked parent.
The family landing shows one school-message entry per linked site. The web
screen lists the existing school-team thread or discovers current approved
responders to open one, then loads bounded history, advances the explicit
read cursor, and sends with a stable retry ID. It preserves a failed draft,
shows a sent bubble only after the API confirms it, clears site-specific
content on a site change, and shows an access-ended state for denied sites.
The parent history API does not supply staff read receipts, so the latest
outgoing bubble says “Sent” after confirmation and never claims “Read”.
Staff replies to school-team threads and notices remain later slices.

Step 1.3e4g adds the read-only staff school-team inbox route without placing
those threads in the existing direct/room web list. The route requires current
staff membership, a fixed Head/Lead role or current scoped responder tag,
the enabled parent portal, an active guardian participant with a current full
non-guest child link, and the typed staff read permission. It returns only the
guardian display name, bounded latest preview, unread count and a cursor
scoped to this inbox. A revoked responder tag, ended guardian link, removed
participant, disabled portal, or site switch must remove the thread from the
result. Staff history, replies and web entry follow in separate gated steps;
the current staff UI cannot open this inbox yet.

Step 1.3e4h adds the separate staff school-team message history route. It
rechecks the inbox's responder, portal, guardian-link and participant scope
before reading messages. Pages are bounded by sequence and expose only the
body, time and sender display name. They do not advance a read cursor or
report a parent read receipt. Staff read-cursor, reply and web entry remain
separate steps.

Step 1.3e3a adds the staff web journey at `/ace/messages`: a responsive
conversation list and thread, paged history, explicit read cursor, and a
labelled composer. It keeps a failed draft and reuses the same client request
ID on retry; a sent bubble appears only after the API confirms it. Site
changes clear the visible conversation and messages before new site data
loads. Navigation and the page require both staff read permissions; sending
has its own permission check. The current API does not return individual
delivery/read state, so this screen does not display those indicators yet.
Staff direct creation and staff room creation controls are also outside that
slice; existing conversations can be read and replied to. Step 1.3e3b2 adds
the direct creation control: staff with `messaging.conversations.create` can
search current-site staff by name, open or reuse a direct conversation, and
continue in the existing thread view. The inline search requires two
characters, caps results at 20, and clearly states its site scope. It handles
loading, no match, error, and pending creation. A site switch clears the
search and ignores a late creation response. Step 1.3e3c adds unread counts
for each bounded staff conversation page. The count includes messages from
other participants after the caller's forward-only read cursor; it does not
load full histories or count the caller's own messages. The web list shows a
numbered, screen-reader-labelled badge and refreshes after the cursor save
succeeds. Room, parent, and notice journeys remain separate gated work.
Step 1.3e3d adds read feedback to the latest outgoing message in an active
staff-direct thread. The API compares that message's sequence with the active
recipient's forward-only read cursor; it returns no receipt for incoming or
staff-room messages. The web shows “Sent” only after the server confirms the
message and “Read” after a later thread fetch observes the recipient cursor.
It does not claim device delivery or live receipt updates.
Step 1.3e3e refines the staff web conversation surface: the bounded pane keeps
the composer in view, nearby same-sender messages form a visual group, and the
selected thread has a persistent border marker. Each message still exposes its
sender and time to assistive technology. The darker NexSteps teal used for
outgoing bubbles, unread badges, and Send improves text contrast. This changes
presentation only; participant, permission, read-cursor, and send behaviour
remain governed by the existing API and client rules.

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
3. Parent web: the school-team thread and composer use the current approved
   responder and guardian checks. The DOM journey covers a linked family,
   responder discovery, failed-send retry, site switch, and denied site. An
   authenticated cross-persona browser journey remains a release check.
4. Notices: separate audience, publish, list, and receipt API/web slices. Do
   not mark C12 complete until notice read state and denied audiences work.

Each item needs its own PR and merge gate. The mobile follow-up needs a
site-scoped family messages entry, approved-responder picker, school-team
thread, read-cursor action, and labelled composer. Acceptance tests must cover
linked and ended guardians, site switching, send retry with one request ID,
and no false read receipt. Mobile work starts after web parity; this step
changes no Expo screen. Production smoke testing follows the separate release
and database cutover gates.
