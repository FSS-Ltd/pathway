# ACE-F21 General Parent/Staff Messaging and Notices Storage

**Owner:** Technical Agent  
**Status:** Approved  
**Created:** 2026-08-02  
**Related docs:** `docs/superpowers/plans/2026-07-25-ace-core-foundation-access.md`, `docs/NexSteps-ACE-Vertical-Build-Plan.md`

## Problem statement

ACE schools need a private, tenant-owned way for parents and staff to communicate, and to publish notices with a verifiable recipient history. A parent must have one general school conversation, not separate chats for individual children, subjects, or topics. Schools retain control over which staff participate and which people receive a notice. NexSteps provides the software but has no ordinary access path to message or notice content.

## Goals

- Give each tenant-scoped guardian identity one general parent/school conversation that can cover any matter.
- Support staff-direct conversations and staff rooms without allowing student participants or student direct messages.
- Store encrypted message content, private attachment keys, idempotent message writes, delivery state, and monotonic per-participant read cursors.
- Store ACE notices independently from the legacy mutable `Announcement` model, freezing the selected audience at publication and recording delivery/read receipts.
- Use direct tenant keys, composite tenant-local foreign keys, forced RLS, and database constraints/triggers for valid participant topology.
- Ensure realtime and outbox consumers receive identifiers and delivery references only, never message or notice content.

## Non-goals

- Student messaging, student participants, `StudentDirect` conversations, or any way to create a private student-to-student channel.
- A conversation per child, subject, staff member, or topic for parents. The parent/school chat is deliberately general.
- Parent-to-parent, parent-created group, cross-school, public, or NexSteps Home messaging.
- API endpoints, mobile/web interfaces, push delivery, typing indicators, server-side drafts, search, retention jobs, or notification dispatch. Those need later command and delivery slices.
- Migrating or changing existing `Announcement` records. They continue to power the established generic notices experience until an explicit migration is approved.

## Approved product decision

Parent/staff conversations are general: a parent can communicate with the school about anything in one conversation chat instead of tracking multiple child- or topic-specific chats.

The implementation represents this as exactly one `PARENT_STAFF` conversation per `GuardianIdentity` within a tenant. The conversation has no `childId`, child relation, topic relation, or child-derived uniqueness rule. A guardian relationship remains a creation and participation validation fact: the guardian must have at least one active, non-revoked relationship in that tenant. This proves the person is a current parent without binding the chat to a particular child.

## Recommended design

### Conversations and participants

`MessageConversation` is tenant-owned and has a closed `MessageConversationKind` enum:

- `PARENT_STAFF` has one `guardianIdentityId` and is unique by tenant and guardian identity. It is the single general school conversation for that parent identity.
- `STAFF_DIRECT` is a private staff-only conversation.
- `STAFF_ROOM` is a staff-only multi-person conversation.

There is no `STUDENT_DIRECT`, `STUDENT`, `PARENT_GROUP`, or generic public/private kind. `MessageConversation` does not include `childId`, a topic key, or a title intended to create topic threads for parents.

`MessageParticipant` stores the tenant, conversation, user, participant kind (`GUARDIAN` or `STAFF`), joined time, and nullable `removedAt`. A tenant-local guardian identity is recorded for guardian participants. A database trigger enforces the participant facts, and a deferred constraint trigger enforces the completed conversation topology at transaction commit:

- a parent/staff conversation has the conversation's one guardian as its only guardian participant;
- that guardian has a current relationship to at least one child in the tenant when added or restored;
- every staff participant has a current `SiteMembership` in the tenant; and
- staff-direct and staff-room conversations have staff participants only.

At commit, a parent/staff conversation must have one active guardian and at least one active staff participant; a staff-direct conversation has exactly two active staff participants; and a staff room has at least two active staff participants. Creating, replacing, or removing participants therefore happens atomically without leaving a usable invalid conversation.

The participant record is retained after removal for accountability, but `removedAt` blocks subsequent authoring, delivery, and cursor advancement. The later messaging command service will also restrict reads and writes to active participants and typed permissions. Tenant RLS cannot replace that actor-level service check because the existing database RLS context is tenant-based rather than user-based.

### Messages, state, and attachments

`Message` belongs to one conversation and has an immutable, increasing `sequence` within that conversation, its sender, encrypted `bodyEncrypted`, a bounded client idempotency key, and a creation time. The unique sequence and idempotency constraints make duplicate requests safe and make read positions comparable without relying on UUID ordering.

`MessageParticipantReadCursor` has one row per participant and records `lastReadSequence`. A trigger rejects an update that moves the cursor backwards or beyond the conversation's latest message. `MessageDelivery` tracks recipient delivery state without repeating encrypted content. It is keyed to a message and its recipient participant, and it retains timestamps for `PENDING`, `DELIVERED`, and `READ` state transitions.

`MessageAttachment` stores only a tenant-owned private object key, content type, byte size, checksum, and message relation. It stores neither a public URL nor attachment content. Storage authorization and signed URL generation stay in the later API slice.

The existing organisation-scoped `OutboxEvent` is reused by later message commands. Its payload for messaging may contain only the org/tenant, conversation, message, recipient, and delivery identifiers. It must not include `bodyEncrypted`, decrypted text, attachment keys, notice text, or recipient names. F21 supplies the stable identifiers and delivery records needed for such references; it does not introduce a second outbox table.

`MessageDraft` and typing state are client-local only and have no Prisma model, table, migration, or outbox event.

### Notices and frozen recipients

ACE notices use a dedicated `AceNotice` model rather than extending `Announcement`. An `AceNotice` has a tenant, author, title, body, audience selector (`PARENTS`, `STAFF`, or `PARENTS_AND_STAFF`), lifecycle timestamps, and optional private attachments. The existing `Announcement` audience remains mutable and has no recipient snapshot, so reusing it would make historic delivery and receipt claims unreliable.

Publishing an `AceNotice` creates immutable `AceNoticeAudienceMember` rows. Each row stores the tenant, notice, recipient user, recipient kind, and, for a guardian recipient, the guardian identity that justified inclusion at publication. It is a snapshot: later staff membership, guardian relationship, or role changes never rewrite the original recipient set.

`AceNoticeReceipt` belongs to one frozen audience member and records delivery and read timestamps. Notice audience membership is immutable once the notice is published. Receipt state is forward-only: delivery and read timestamps may be added as delivery progresses, but cannot be cleared or moved backwards. Any later delivery event again references identifiers only, never notice body or attachment content.

`AceNoticeAttachment` follows the same private-key rule as message attachments. Student notice recipients are deliberately out of scope for this parent/staff foundation.

## Access and data flow

1. A school resolves a parent user to a tenant-scoped `GuardianIdentity` with an active guardian-child relationship.
2. The messaging command service finds or creates that guardian's single general `PARENT_STAFF` conversation and maintains the active staff participants selected by the school.
3. An active participant creates an idempotent message. The database validates the sender's active participant record and assigns the next immutable sequence.
4. Recipient delivery records and content-free outbox references let later realtime or push delivery notify the appropriate active participants.
5. An authorised staff member creates and publishes an ACE notice. Publication resolves the intended parent/staff audience once and persists the frozen recipient rows.
6. Later changes to guardian relationships, staff membership, or notice targeting do not alter historic recipient records or reverse a recorded receipt state.

## Security and privacy

- Every new model owns `tenantId`; tenant-local relationships use composite foreign keys where the target is tenant-scoped.
- Every new table has `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, a tenant policy requiring a non-null current tenant, and revoked `PUBLIC`, `anon`, and `authenticated` privileges.
- `Message.bodyEncrypted` is registered in the existing Prisma encryption extension, so normal Prisma and tenant-scoped transaction reads decrypt for the application while raw storage contains ciphertext.
- Parent eligibility is a tenant-local guardian relationship validation, not a child-topic mapping. No message model includes `childId`.
- Only active participants may author messages or advance their cursor. Removed participants remain in historical rows but cannot receive new deliveries or write.
- The schema contains no student identity field, student participant type, or direct-message enum value. The integration contract must explicitly reject `StudentDirect` topology.
- Message and notice attachment rows contain private storage keys only. Realtime and outbox payloads must be content-free references.
- NexSteps has no privileged messaging or notice-content data model. Schools retain their own content, recipient snapshots, and delivery records.

## Failure modes and recovery

- A duplicate client message request is identified by its unique idempotency key rather than adding a second message or delivery set. The later command service resolves that unique-key conflict by returning the original message.
- A stale cursor write is rejected rather than marking a participant unread again; a cursor beyond the latest sequence is also rejected.
- A guardian whose relationship has ended cannot be newly added or restored as an active parent participant. The later service removes access promptly while retaining history.
- A removed participant cannot send, receive new delivery rows, or update a read cursor.
- A parent/staff conversation cannot fragment into per-child or per-topic threads because no such foreign key or uniqueness dimension exists.
- A notice keeps the original audience even if a family moves site, a guardian relationship changes, or a staff membership is revoked later. Receipt timestamps remain forward-only as delivery progresses.
- The migration is additive. Rollback disables new messaging/notice writes and leaves retained history intact for school audit and retention policy.

## Verification

The ACE-F21 integration contract will prove that:

- `PARENT_STAFF`, `STAFF_DIRECT`, and `STAFF_ROOM` are the only conversation kinds, and `StudentDirect` cannot be represented;
- a `PARENT_STAFF` conversation is general, contains no child relation, and is unique for a tenant guardian identity;
- guardian and staff participant validation rejects invalid relationships, missing site membership, cross-tenant joins, and student-shaped data;
- removed participants cannot create a message, delivery, or cursor update;
- message idempotency and monotonic sequence/cursor rules hold under valid and invalid writes;
- messages are encrypted at rest through ordinary Prisma and tenant-scoped transaction paths;
- notice audience rows are frozen at publication and receipt state is tenant-safe and forward-only;
- every F21 table fails closed with missing tenant context and across tenant contexts; and
- strict RLS inventory checks include all F21 storage tables with no public access grants.

## Implementation boundary

ACE-F21 changes the Prisma schema, additive migration, PII encryption registration, strict RLS inventory, and storage integration tests only. It deliberately leaves messaging/notices endpoints, permissions, delivery workers, UI, and client-local drafts for later ACE communication slices.
