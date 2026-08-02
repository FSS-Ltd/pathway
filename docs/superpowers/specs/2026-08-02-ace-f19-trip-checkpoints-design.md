# ACE-F19 Trip Storage and Configurable Checkpoints

**Owner:** Technical Agent
**Status:** Approved
**Created:** 2026-08-02
**Related docs:** `docs/superpowers/plans/2026-07-25-ace-core-foundation-access.md`, `docs/NexSteps-ACE-Vertical-Build-Plan.md`

## Problem statement

School trips need a reliable way to account for children at more than one point in a journey. A fixed set of transport stages would not fit every trip. Schools must be able to configure checkpoints such as before boarding, arrival, lunch, departure, and return to school, then add another checkpoint when the day requires it.

ACE-F19 also establishes the secure storage needed for versioned permission slips. Published consent wording, recipients, responses, and staff-recorded exceptions must remain reproducible and tenant-safe.

## Goals

- Store trips and allow a trip to have any number of ordered, named checkpoints.
- Let authorised staff add and reorder checkpoints while the trip is under way.
- Store one child-only attendance mark for each checkpoint and child, including present/absent, the staff member who marked it, and the marking time.
- Preserve the ACE-F19 permission-slip foundation: frozen recipient snapshots, immutable published versions and hashes, material-change classification, relationship-bound guardian responses, physical/telephone exceptions, reminders, and trip cancellation state.
- Enforce tenant boundaries in the database through composite foreign keys and forced tenant RLS.

## Non-goals

- Staff attendance at trip checkpoints. Existing session staff-attendance remains the relevant domain.
- A fixed or enumerated checkpoint catalogue.
- Trip administration, attendance, or family permission-slip UI. These belong to ACE-C09 through ACE-C12.
- Notifications, reminders dispatch, consent commands, or audit/outbox service behaviour. ACE-F19 stores the facts required by those later commands.

## Recommended design

`TripCheckpoint` is a tenant-scoped child of `Trip`. It has a required human-readable label, a unique sequence number within the trip, and an optional planned time. Checkpoints can be added or reordered at any point because attendance facts refer to the stable checkpoint ID rather than its position.

`TripCheckpointAttendance` records one explicit present/absent mark for one child at one checkpoint. It holds the child, tenant, marking staff member, and marking timestamp. A unique checkpoint-child pair prevents duplicate marks. A checkpoint with marks cannot be deleted, so recorded accountability is never orphaned.

The permission-slip storage follows the existing ACE-F19 plan. A permission-slip version contains a draft or published content snapshot. Publishing requires a cryptographic version hash; published versions cannot be altered or deleted. Each recipient row freezes a child in that version's audience. A guardian response binds the exact recipient, child, guardian-child relationship, and published version hash. Sensitive response and exception text is encrypted at rest.

## Data flow and constraints

1. Staff create a trip and add one or more checkpoints in the desired order.
2. At a checkpoint, a later command records each child's explicit attendance mark.
3. If an unplanned stop is needed, staff create a new labelled checkpoint and record attendance there. Reordering does not change existing attendance ownership.
4. Permission-slip publication later creates an immutable content version and frozen recipients. A material successor version is explicitly marked as requiring reconsent.
5. Guardian and physical/telephone responses reference the exact version and child relationship that authorised them.

Every new table carries `tenantId`, uses forced tenant RLS, and receives no implicit public, anonymous, or authenticated-table grant. Composite foreign keys ensure a trip, checkpoint, child, recipient, version, and guardian relationship all share the same tenant. Database checks reject duplicate checkpoint positions, duplicate child marks, invalid version publication data, incorrect material-change/reconsent combinations, and incomplete exception evidence.

## Failure modes and recovery

- A cross-tenant relation is rejected by a composite foreign key and RLS policy.
- A duplicate checkpoint-child mark is rejected; later command work will use a deliberate correction/upsert policy rather than create a second fact accidentally.
- A malformed or changed published permission-slip version is rejected by database checks and immutability triggers.
- A checkpoint can be removed only before any attendance mark exists. Otherwise the staff workflow must retain it, preserving recorded accountability.
- The migration is additive. Rollback consists of disabling future trip/slip capabilities while retaining all stored trip, consent, and attendance records.

## Security and privacy

- Guardian access is represented by the tenant-scoped `GuardianChildRelationship`, not a supplied child ID.
- Permission-slip response payloads and exception reasons are encrypted through the established Prisma field-encryption layer.
- Staff-recorded exceptions require an actor, non-empty reason, and staff witness, all tied to the active tenant.
- Private storage keys may be stored by later workflows; document bytes and public URLs are excluded.

## Verification

The ACE-F19 integration tests will prove that:

- five or more named checkpoints can exist for one trip and hold distinct child attendance marks;
- a checkpoint can be added during the trip;
- duplicate checkpoint sequence positions and duplicate checkpoint-child attendance are rejected;
- published wording and hashes are immutable, while material successors require reconsent;
- consent is bound to the recipient, child, guardian-child relationship, and version hash;
- exceptions require actor, reason, and witness; and
- all new tables fail closed across tenant contexts and with no tenant context.
