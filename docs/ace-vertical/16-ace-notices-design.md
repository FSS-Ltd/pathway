# ACE site notices: audience, publication, and receipts

**Status:** implementation contract for ACE-M13 and ACE-M14; no route is released by this document.

## Problem and source behavior

Oasis lets an authorised school administrator publish notices for staff,
parents, or both; readers see only active, unexpired notices for their
audience, and each reader has an idempotent read state. Oasis also supports
private attachments and notification email with parent opt-outs. Its relevant
source is `oasis-portal/apps/api/src/routers/notice.ts` and
`apps/api/src/__tests__/notice.router.test.ts`. NexSteps must preserve those
outcomes within its site tenancy, fixed roles, access tags, guardian links,
parent portal switch, audit, and paid-module boundaries. Site notices are
platform core across site models; Clubs notices belong to the Clubs entitlement and its scoped
leads. Neither route activates the other module.

Site notices are one shared feature across site models. The existing
`/notices` screen remains its entry point. The stronger `AceNotice` table is
the canonical active record store for every site model; its physical name is
historical, not an ACE-only access boundary. The legacy `Announcement` table
is a transitional archive and write-through source while older app releases
may still run. The `/announcements` read API serves canonical records; new
writes use the draft, preview, publish, and withdraw commands. The old write
API must not create a second active notice stream.

Migrate all existing announcements into the canonical table with their IDs,
site, title, body, audience, publication time, and timestamps intact. Mark
their provenance and keep the original author and delivery/read history
unknown. Historical records have no frozen audience or receipts. An eligible
staff member may read a historical staff notice for their current site, but
its UI must say that historical read status is unavailable. New publications
always require an author, recipient snapshot, and receipt rows. During
cutover, a database trigger mirrors any older-app writes to the canonical
table so no records fall between migration and app deployment. Once the new
app release is verified, retire the old write path and archive trigger in a
separate gated change.
The import discovers the historical table in either `app` or `public`,
locks it before copying, and fails on notice ID collisions rather than
silently omitting records from a restored schema.

## Access and audience

- The selected tenant is the site for every site model. Every route uses the authenticated actor's
  current tenant and organisation context; no client-supplied tenant ID
  determines access. `notices.manage` permits drafting; `notices.publish`
  permits publishing and withdrawal. A scoped tag confers only its active
  delegated permission. Staff reading requires `notices.read` and a current
  site membership. Students cannot publish or receive this notice audience.
- Parent reads use the fixed Parent relationship template plus a current
  **full-access**, non-guest guardian-child relationship in the selected site
  and the enabled parent portal. The protected Parent template carries the
  ACE-only, relationship-scoped `ace.parent.notices.read` permission. The
  existing `notices.read` key is site-scoped and cannot seed onto a
  relationship role. The parent notice route checks its own
  permission, active definition, portal, site, guardian link, and recipient
  snapshot. A site membership alone never grants parent notice access; a
  guardian link alone never grants staff access. The new key grants no access
  to management reads or to Clubs notices.
- At publication, resolve eligible current staff and full-access guardians
  inside the selected site and insert one audience member per user. `PARENTS`,
  `STAFF`, and `PARENTS_AND_STAFF` are the only audience choices. For a user
  eligible as both staff and guardian, one row and one receipt are kept;
  guardian identity is retained in the snapshot. For a `PARENTS_AND_STAFF`
  notice, the staff route may use that guardian-kind row only after separately
  checking current staff membership and `notices.read`; the parent route
  checks the current full-access guardian relationship. This also prevents
  duplicate notification email.
- Publication snapshots recipients, but later access loss takes effect
  immediately: removed staff membership, ended or revoked guardian link,
  disabled parent portal, or a site switch denies body, attachment, and read
  writes. Do not infer an audience from role name or from another site.
  Notices are site-wide; child-specific content needs a separately reviewed
  audience model and must not be placed in a site-wide notice.

The shared notice record, lifecycle, scheduling, delivery, and receipt model
applies across site models. Scheduling and cancellation before publication
are ACE-M13 requirements alongside immediate publication. Class, group, and
guardian-specific targeting must use an
audience source and access policy verified for the relevant sector. School
class and guardian relationship rules belong to the ACE extension; they must
not widen access to the shared site-wide notice stream. ACE-M13 remains open
until these audience and scheduling requirements are delivered and tested.

For ACE school targeting, the school approved three existing roster sources:
"class" is an active `AceYearBand` with current `AceSchoolEnrollment` rows;
"group" is an active site `Group` with current `Child.groupId` membership;
"guardian-specific" addresses the current full-access guardians of one
selected non-guest `Child`. A year-band notice may address currently assigned
`AceStaffYearBandAssignment` staff and/or guardians of enrolled children.
Group and one-child notices address guardians only: `StaffPreferredGroup` is
a preference, not an assignment or access grant. The API rejects these scopes
outside an `ACE_SCHOOL` organisation and rejects targets from another site.
Only the school scope fields extend the canonical `AceNotice` record; `SITE`
remains the default for every site model and every historical notice.

The publication snapshot stores the qualifying child IDs on each targeted
guardian recipient. Later class or group moves do not rewrite a published
audience; losing every current full-access relationship to those children
does remove body, detail, read, and acknowledgement access. A targeted staff
reader must also retain a current assignment to the notice's year band. The
scheduled-audience hash includes the recipient child IDs, so roster changes
before publication require another preview. Target metadata and recipient
child snapshots are immutable after publication. The staff picker searches
bounded site-scoped target options; it never exposes a target from another
site.

## Data and lifecycle

`AceNotice` has a draft (`publishedAt = null`) and a published state. Draft
title, body, audience, and attachment metadata may change under
`notices.manage`. Publishing requires `notices.publish`, nonblank bounded
content, a nonempty eligible recipient snapshot, and a single transaction
that locks the draft, resolves recipients, creates their audience and receipt
rows, sets `publishedAt`, and writes audit/outbox facts. The current database
trigger already rejects a published notice without recipients and freezes its
audience. API retries must return the same published notice, not duplicate
recipients or notifications.

The database checks the original author's current site membership and student
identity when a draft is inserted. It keeps the author and site immutable
afterwards; an author leaving the site must not prevent a currently authorised
publisher from withdrawing an issued notice. The author guard resolves
identity tables in either supported `app` or `public` schema layout.

The schema needs additive `expiresAt` and `withdrawnAt` fields for Oasis's
active and expiry behavior. Validate future expiry at publish; an expired or
withdrawn notice leaves the normal reader inbox and cannot gain new read
receipts. Published title, body, audience, attachments, publication time,
expiry, and recipient snapshot must be immutable at the database boundary.
Withdrawal sets `withdrawnAt` with actor, reason, and audit history rather
than deleting the notice or receipts. A correction is a new notice that
references the previous notice in audit metadata; existing financial or
safeguarding records are unaffected. Add indexes for bounded site inbox and
recipient reads. The existing audience eligibility trigger permits some
non-`NONE` guardian relationships; the new migration must tighten it to the
approved full-access rule while preserving portable public/app schema
resolution. Test both layouts and forced RLS.

At publication, create one `AceNoticeReceipt` per snapshot member with
`deliveredAt = publishedAt`. Here _delivered_ means available in that site's
in-app inbox; it does not claim email or device delivery. Opening the notice
can explicitly mark the caller's receipt read, or the UI can call a separate
read command after rendering. `readAt` is write-once, forward-only and never
set by an attachment download unless the caller explicitly requests a
preview-and-read action. Repeated and concurrent read commands return the
same receipt. The author does not receive a reader receipt solely for
authoring. Administrators see aggregate delivered/read counts, not unrelated
readers' private details by default.

An author may request acknowledgement on a draft. The setting becomes
immutable at publication. An active recipient can explicitly acknowledge
after opening the notice; that command sets a missing read time and a
write-once acknowledgement time atomically. It is idempotent, and neither a
message open nor an email tracking event counts as acknowledgement. The
publisher's receipt summary returns only frozen recipient, delivered, read,
and acknowledged totals. Historical imports have no receipt summary because
their original delivery state is unknown.

### Scheduled publication

An authorised publisher may schedule a reviewed site-wide draft for a future
time, then cancel it before publication. Scheduling checks the draft revision,
current eligible recipient hash, nonempty audience, and expiry. The scheduled
content and attachments remain frozen until cancellation or publication.
`scheduledAt` is the earliest publication time, not a promise of execution at
the exact second. The API Vercel project runs an authenticated minute sweep;
each run discovers at most five due IDs, rechecks the scheduling publisher's
current `notices.publish` access, and uses the ordinary tenant-scoped publish
transaction. This keeps recipient snapshots, receipts, audit, and outbox facts
identical to immediate publication. Repeated or overlapping sweeps cannot
publish the same notice twice.

If access, expiry, or audience eligibility changes, the sweep returns the
draft for review without creating readers or delivery receipts. A transient
database failure leaves it due for the next sweep. Cancellation and the sweep
lock the same notice row, so whichever commits first decides the outcome. The
publisher sees scheduled and review-needed states in the existing `/notices`
screen. Only shared site-wide notices use this path; ACE class and guardian
targeting still needs its separate audience policy.

Scheduling is unavailable until the API project has a random `CRON_SECRET` of
at least 16 characters and a Vercel plan that supports minute cron. Before
release, verify the production cron is active, its authenticated route returns
success, and a staging schedule publishes after its due time. After a database
restore, inspect the cron and secret before enabling the UI.

## API and web slices

| Slice                | Contract                                                                                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Draft                | Site-scoped create, edit, and bounded draft list. Typed `notices.manage`; validate title/body/audience/expiry and optimistic revision.                                            |
| Publish and withdraw | Separate audited commands under `notices.publish`, with transaction-level RLS and locked recipient resolution. Return 409 on a stale draft or changed audience eligibility.       |
| Schedule and cancel  | Shared site-wide schedule under `notices.publish`; due worker rechecks the publisher and audience, then uses the same publication transaction.                                    |
| Staff inbox          | Bounded signed cursor and detail for active published notices with the caller's current staff membership and `notices.read`; `PARENTS` is excluded.                               |
| Parent inbox         | Explicit site route and bounded cursor under `ace.parent.notices.read`, enabled portal, full guardian link, and a matching recipient snapshot; `STAFF` is excluded.               |
| Read receipt         | Idempotent current-recipient command, returning the caller's receipt only. Deny guessed IDs, expired/withdrawn notices, ended links, and cross-site writes.                       |
| Attachments          | Private tenant/notice keys, short-lived upload and download grants, file type and byte checks, stored hash, no public URL, and the same current audience check on every download. |
| Email                | Outbox worker after commit, one notification per user, opt-out checks, retry and failure audit; email failures do not roll back published in-app notices.                         |

The draft API uses `POST /ace/notices/drafts`, `GET /ace/notices/drafts`,
`GET /ace/notices/drafts/:id`, and `PUT /ace/notices/drafts/:id`. Create and
full-replacement edit accept a trimmed title (1–200 characters), trimmed body
(1–20,000 characters), one of the three audience values, and a nullable future
ISO expiry. Edit also requires the draft's last `updatedAt` as
`expectedUpdatedAt`; a stale revision or publication returns HTTP 409. The
list accepts a site-scoped `cursor` and `limit` of 1–50 (default 25), returns
summary rows without body text, and uses `createdAt` plus ID for stable order.
The selected site comes only from the authenticated context. These routes
do not publish a notice or expose one to readers.

Publication uses `GET /ace/notices/drafts/:id/audience-preview` under
`notices.publish` to return the eligible recipient count, draft `updatedAt`,
and an `audienceVersion` hash of the deduplicated recipient snapshot.
`POST /ace/notices/:id/publish` requires that exact draft revision and audience
version. It returns HTTP 409 if either changed or the audience is empty, and
returns the existing publication on an authorised retry. The command locks the
notice row and creates the audience, one delivered receipt per recipient,
audit record, and outbox fact in one transaction. `POST
/ace/notices/:id/withdraw` requires a nonblank reason under
`notices.publish`; it records a final withdrawal without deleting the issued
notice or receipts. Both commands derive site and actor from authentication.

The staff inbox uses `GET /ace/notices` with a limit of 1–50 (default 25) and
a signed, site-and-reader-bound cursor, plus `GET /ace/notices/:id` for detail.
Both require `notices.read` and current staff membership. New publications
require a frozen recipient row for the caller; imported historical notices
use their original audience and have no read receipt. Only active `STAFF` and `PARENTS_AND_STAFF` publications
appear. List rows omit body text; detail returns the body and only the caller's
delivered/read timestamps. Losing membership or withdrawing or expiring a
notice removes access immediately. `POST /ace/notices/:id/read` explicitly
marks the caller's receipt read once and returns its stable `readAt` on retries.
Parent inbox and parent read commands remain separate slices.

Use the existing `/notices` entry point and `@pathway/ui` tokens across all
site models. Staff and family notice lists are separate
from private chat, show audience and publication time clearly, and expose
unread state in text as well as colour. The publisher sees a recipient-count
preview before confirmation, an explicit pending state, and a recoverable
error if eligibility changes. Lists have loading, empty, denied, expired,
and retry states. Site changes clear prior-site content and ignore late
responses. Links and attachment controls remain keyboard accessible at
compact widths and respect reduced motion. The Expo follow-up mirrors staff
and family inbox, detail, attachment preview, and read state after web parity.
Until the parent inbox is released, the web publisher defaults to `STAFF` and
keeps parent-targeted drafts unpublished. The already-published parent API
contract remains for the gated family reader slice; no UI should suggest that
families can open a new notice before that reader path exists.

## Failure, verification, and rollout

Copy Oasis tests for staff, parent, both-audience deduplication, opt-out,
expiry, attachment validation, and concurrent idempotent reads into NexSteps
service, RLS, and browser tests. Add denials for another tenant or site,
student identity, revoked tag, missing typed permission, limited/guest or
ended guardian relationship, portal disabled, stale publish, withdrawn
notice, guessed attachment ID, and a site switch during loading. Test the
unique audience and receipt constraints under concurrent requests. Verify
that no paid entitlement is activated by a notice tag and that Clubs notices
remain behind Clubs entitlement.

Implement the shared-record import and transitional mirror, read and write API,
then the unified `/notices` screen in the current gated slice. Later slices
add parent inbox, attachments, and email. Each PR starts from freshly
fetched GitHub `master`, passes the exact-head CI gate, and merges before the
next begins.
Run authenticated staff/parent/staff-parent browser journeys against an
isolated staging database before a manual production release. If a phase
fails, disable its new entry point or revert its app release. Keep published
notices, audience snapshots, receipts, and audit events for correction; do
not delete issued records. Monitor publish conflicts, denied reader probes,
notification failures, and time to visible receipt. Production cutover still
requires the separate database and deployment smoke gates.
