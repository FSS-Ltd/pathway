# ACE-C06: Faith content lifecycle and staff web

## Problem and scope

ACE-F18 supplied tenant-safe Faith storage and immutable published versions, but
there is no application workflow. C06 must let authorised ACE staff draft,
schedule, publish and withdraw content, and let eligible readers see only the
current published version. A small staff web workspace will use the same API in
this step. Reflection, read-receipt and family/student web journeys remain C07
and C08; mobile remains paused by the product owner.

## Contract and data decisions

- Reuse `FaithContent`, `FaithContentDraft`, `FaithContentVersion`,
  `FaithContentAudience` and `FaithAgeBand`. A logical content record can have
  many drafts and immutable published versions. Creating an edit to published
  content creates a new draft; an unscheduled draft can be edited with an
  optimistic timestamp guard. Publication appends a version and its audience
  snapshots in one tenant transaction under a content row lock. Published versions and
  snapshots are never updated or deleted.
- Store typed content in the existing JSON payload: body text, optional source
  label and HTTPS source URL, and an optional reflection prompt. Oasis's weekly
  theme, memory verse and optional verse-of-day informed these fields; ACE does
  not copy Oasis's fixed Christian copy, likes or comment workflow. Validate
  length and URL at the API boundary and render text as text.
- Historical F18 rows with payloads outside this contract remain visible to
  staff as needing review, without exposing the unreadable payload. Staff can
  create a clean replacement draft or withdraw a malformed publication; the
  portal feed omits invalid versions rather than failing the whole feed.
- Add nullable `scheduledAt`, `scheduledByUserId`,
  `scheduleExpectedVersionId` and a failure reason to a draft, and
  `withdrawnAt` to a logical content record. Scheduled draft content cannot
  be edited until the schedule is cancelled. A replacement draft does not
  silently replace a schedule; staff must cancel the old schedule first. A
  partial unique index permits only one scheduled draft per content. At due
  time, a changed current version moves the schedule to staff review rather
  than publishing stale content. A withdrawn record
  has no current reader-visible version; its historical versions stay intact.
  Publishing a later draft clears withdrawal. A due-time runner rechecks the
  scheduling actor's live permission, active membership, ACE site and audience
  before appending a version. Failed business validation leaves the draft for
  staff review; transient failures retry. The runner uses the existing cron
  secret and minute schedule pattern.
- Add one tenant-scoped Faith settings row with a display label, defaulting to
  “Faith Corner”. The site lead can change this label; it affects the staff
  workspace heading, never permission or audience logic. The setting belongs to
  the ACE site, so different sites in one organisation can use their own term.
- `GET /ace/faith/content` returns staff workflow records to authorised staff.
  `GET /ace/faith/sites/:siteId/feed` returns only current published
  audience-matched versions to portal readers. The API resolves the explicit
  site and permission server-side; child context is required for guardian reads. Student reads
  derive the child from the active identity; supplied child IDs are ignored or
  rejected. The approved route matrix's permission names remain authoritative.
  `POST /ace/faith/content` creates a new logical draft or a revision draft;
  `POST /ace/faith/content/:id/publish` performs immediate publication;
  explicit protected schedule, cancel-schedule, withdrawal and settings
  actions, draft editing and staff age-band options are recorded in the route
  matrix.

## Access, privacy and failure behaviour

All writes require an active ACE site, active user, current staff membership
and the route's typed permission. Publication, scheduling, withdrawal and
settings require `ace.faith.publish` plus site-lead authority; draft creation
requires `ace.faith.manage`. Portal reads require an active ACE portal, current
enrolment, a current full guardian-child relationship or student self identity,
and age eligibility from the version's frozen audience snapshot. A missing
birth date does not pass an age-band audience. Denied and cross-tenant reads
return a generic 404; no draft body or staff-only state enters portal DTOs.

Create, schedule, publish, withdraw and settings changes write audit metadata
with content/version IDs and transition names, never text or reflection data.
The staff workspace uses existing ACE tokens and controls, with loading,
empty, validation, pending, success, error and retry states. Publication and
withdrawal require an explicit confirmation. Focus returns to the affected
record after transitions. A stale draft or permission change returns a
recoverable conflict/denial; a runner failure never partially publishes a
version or audience. No new dependency is needed.

## Rollout, rollback and evidence

`ACE_FAITH_AUTHORING_ENABLED` and `ACE_FAITH_PUBLICATION_ENABLED` default off.
The migration is additive; existing F18 records remain readable. Rollback
disables authoring and publication while retaining already published read-only
content. CI must migrate a fresh PostgreSQL database and prove draft,
scheduled, published, withdrawn, revised, audience, label, unsafe URL,
cross-tenant and revoked-access cases. Check API/admin type, lint, unit,
integration and build results, then inspect the staff workspace at narrow width
and keyboard focus. Keep production flags off until site-linked UAT and the
broader ACE release gates pass.

This step is accepted only when C06's API and staff web lifecycle are merged
with that evidence. It does not claim C07 reflections or C08 family/mobile UI,
and it cannot advance the ACE master-plan task count while the M20 prerequisite
and downstream web/mobile acceptance remain open.
