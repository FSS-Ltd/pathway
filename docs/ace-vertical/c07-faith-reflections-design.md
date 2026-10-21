# ACE-C07: Faith reads and private reflections

## Scope and policy

The approved F18 Faith policy makes reflections student-authored. A student
with one current approved identity link and active ACE enrolment can record one
read receipt and one reflection per published content version. A guardian can
read a reflection only after staff approve and explicitly release it, and only
while the guardian has a current `FULL` relationship to that child. Staff with
current site membership and typed Faith permissions review reflections. The
route matrix records this narrower authoring policy for R41 and R43.

Family requests include an explicit `siteId` query value because family
accounts do not carry the staff-selected site context. The API resolves that
site and its typed permission, then rechecks the child relationship, student
identity, active enrolment, current published version, frozen age audience,
and withdrawal state inside tenant RLS context. Supplied child IDs cannot
choose a student's target.

## Stored decisions

`FaithReflection.visibility` explicitly distinguishes private
`AUTHOR_AND_STAFF` from `RELEASED_GUARDIANS`. `moderationStatus` starts
`PENDING`; staff may choose `APPROVED` or `REJECTED` once. Release requires
approval and records the staff actor and time. The migration backfills already
released rows as approved and guardian-visible, keeps release immutable, and
adds a nullable child target for historical rows. New API writes always store
the resolved child ID. A historical row without a child target remains
staff-visible for review and cannot be released by the API.

Reflection text remains encrypted through the existing database PII layer.
Audits record IDs and transition names only. A safety report creates a
standard safeguarding `Concern` with a `faith-reflection:<id>` reference and
risk category; it never copies reflection text. Ordinary Faith responses
return only the concern reference ID, not safeguarding case details. No likes,
rankings, or popularity counts are added.

## Rollout and interface

`ACE_FAITH_REFLECTIONS_ENABLED` and the site setting
`FaithSiteSettings.reflectionsEnabled` both default off. The site lead can
enable submissions only while the global gate is on. Staff can still review
existing reflections while submissions are off. The Faith staff workspace
shows the site policy and a scoped review panel for published content, with
loading, empty, error, pending, confirmation, and success states. Student and
guardian reading interfaces are C08 work; mobile remains paused.

Rollback disables the global flag and leaves published Faith content and
stored reflection evidence intact.
