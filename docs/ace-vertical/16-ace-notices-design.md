# ACE site notices: audience, publication, and receipts

**Status:** implementation contract for C12; no route is released by this document.

## Problem and source behavior

Oasis lets an authorised school administrator publish notices for staff,
parents, or both; readers see only active, unexpired notices for their
audience, and each reader has an idempotent read state. Oasis also supports
private attachments and notification email with parent opt-outs. Its relevant
source is `oasis-portal/apps/api/src/routers/notice.ts` and
`apps/api/src/__tests__/notice.router.test.ts`. NexSteps must preserve those
outcomes within its site tenancy, fixed roles, access tags, guardian links,
parent portal switch, audit, and paid-module boundaries. Generic site notices
are ACE core; Clubs notices belong to the Clubs entitlement and its scoped
leads. Neither route activates the other module.

The existing `Announcement` model and `/announcements` API serve product-wide
announcements. They do not have a recipient snapshot or per-reader receipt and
allow edits and deletion after publication. ACE notices use the separate
`AceNotice`, `AceNoticeAudienceMember`, `AceNoticeReceipt`, and
`AceNoticeAttachment` tables already present in Prisma and forced RLS. Do not
repurpose or migrate existing announcements silently.

## Access and audience

- The selected tenant is the site. Every route uses the authenticated actor's
  current tenant and organisation context; no client-supplied tenant ID
  determines access. `notices.manage` permits drafting; `notices.publish`
  permits publishing and withdrawal. A scoped tag confers only its active
  delegated permission. Staff reading requires `notices.read` and a current
  site membership. Students cannot publish or receive this notice audience.
- Parent reads use the fixed Parent relationship template plus a current
  **full-access**, non-guest guardian-child relationship in the selected site
  and the enabled parent portal. Add `notices.read` to the protected Parent
  template in its own reviewed step. A site membership alone never grants
  parent notice access; a guardian link alone never grants staff access.
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

## API and web slices

| Slice                | Contract                                                                                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Draft                | Site-scoped create, edit, and bounded draft list. Typed `notices.manage`; validate title/body/audience/expiry and optimistic revision.                                            |
| Publish and withdraw | Separate audited commands under `notices.publish`, with transaction-level RLS and locked recipient resolution. Return 409 on a stale draft or changed audience eligibility.       |
| Staff inbox          | Bounded signed cursor and detail for active published notices with the caller's current staff membership and `notices.read`; `PARENTS` is excluded.                               |
| Parent inbox         | Explicit site route and bounded cursor under fixed Parent access, enabled portal, full guardian link, and a matching recipient snapshot; `STAFF` is excluded.                     |
| Read receipt         | Idempotent current-recipient command, returning the caller's receipt only. Deny guessed IDs, expired/withdrawn notices, ended links, and cross-site writes.                       |
| Attachments          | Private tenant/notice keys, short-lived upload and download grants, file type and byte checks, stored hash, no public URL, and the same current audience check on every download. |
| Email                | Outbox worker after commit, one notification per user, opt-out checks, retry and failure audit; email failures do not roll back published in-app notices.                         |

Use existing `@pathway/ui` tokens. Staff and family notice lists are separate
from private chat, show audience and publication time clearly, and expose
unread state in text as well as colour. The publisher sees a recipient-count
preview before confirmation, an explicit pending state, and a recoverable
error if eligibility changes. Lists have loading, empty, denied, expired,
and retry states. Site changes clear prior-site content and ignore late
responses. Links and attachment controls remain keyboard accessible at
compact widths and respect reduced motion. The Expo follow-up mirrors staff
and family inbox, detail, attachment preview, and read state after web parity.

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

Implement the additive lifecycle/RLS migration, permission template, draft
and publish API, reader API and receipts, web screens, then attachments and
email in separate gated PRs. Each PR starts from freshly fetched GitHub
`master`, passes the exact-head CI gate, and merges before the next begins.
Run authenticated staff/parent/staff-parent browser journeys against an
isolated staging database before a manual production release. If a phase
fails, disable its new entry point or revert its app release. Keep published
notices, audience snapshots, receipts, and audit events for correction; do
not delete issued records. Monitor publish conflicts, denied reader probes,
notification failures, and time to visible receipt. Production cutover still
requires the separate database and deployment smoke gates.
