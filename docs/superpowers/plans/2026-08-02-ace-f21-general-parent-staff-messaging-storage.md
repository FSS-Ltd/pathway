# ACE-F21 General Parent/Staff Messaging Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver tenant-safe ACE messaging and notice storage with one general parent/school conversation per guardian, staff-only conversations, encrypted messages, and frozen notice recipients.

**Architecture:** Add a dedicated tenant-owned messaging model family and ACE-specific notice snapshot model family. PostgreSQL constraints and triggers enforce valid parent/staff topology, active participants, ordered message state, immutable audience snapshots, and forced tenant RLS. The slice remains storage-only: no routes, UI, delivery worker, or server-side draft model is added.

**Tech Stack:** TypeScript, Prisma, PostgreSQL triggers and RLS, Jest integration tests, pnpm.

## Global Constraints

- The approved design is `docs/superpowers/specs/2026-08-02-ace-f21-general-parent-staff-messaging-design.md`.
- A parent has exactly one general `PARENT_STAFF` conversation per tenant-scoped `GuardianIdentity`. It has no child, topic, subject, or per-staff thread dimension.
- The only conversation kinds are `PARENT_STAFF`, `STAFF_DIRECT`, and `STAFF_ROOM`. Do not add students, `StudentDirect`, parent groups, public chats, typing state, or server-side drafts.
- Every new storage table owns `tenantId`, uses composite same-tenant foreign keys where possible, forces RLS, and revokes `PUBLIC`, `anon`, and `authenticated` grants.
- Reuse the existing organisation-scoped `OutboxEvent` in later command work. Its F21 payload contract is identifier-only and it must never contain message/notice text, attachment keys, or recipient names.
- Register `Message.bodyEncrypted` with the existing Prisma field-encryption extension. Notice content is not added to the encryption registry in this storage slice.
- Do not alter `Announcement` or migrate its rows. `AceNotice` is the new immutable-audience model family.
- Use additive migrations only, no new dependency, and no NexSteps Home messaging/community changes.

---

## File structure

| File                                                                                 | Responsibility                                                                                         |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `packages/db/prisma/schema.prisma`                                                   | Messaging/notice enums, model family, direct tenant relations, and inverse relations.                  |
| `packages/db/prisma/migrations/20260802200000_ace_messaging_notices/migration.sql`   | DDL, composite foreign keys, trigger functions, indexes, forced RLS, and grant revocations.            |
| `packages/db/src/pii-encryption.ts`                                                  | Transparent encryption registration for `Message.bodyEncrypted`.                                       |
| `apps/api/src/messaging/tests/messaging-notices.rls.e2e.spec.ts`                     | Tenant/RLS, topology, state, idempotency, encrypted-storage, and frozen-audience integration contract. |
| `scripts/check-supabase-rls.mjs`                                                     | Strict RLS inventory for every new table.                                                              |
| `docs/superpowers/specs/2026-08-02-ace-f21-general-parent-staff-messaging-design.md` | Approved product and technical design.                                                                 |

## Model contract

```ts
type MessageConversationKind = "PARENT_STAFF" | "STAFF_DIRECT" | "STAFF_ROOM";
type MessageParticipantKind = "GUARDIAN" | "STAFF";
type MessageDeliveryStatus = "PENDING" | "DELIVERED" | "READ";
type AceNoticeAudience = "PARENTS" | "STAFF" | "PARENTS_AND_STAFF";
type AceNoticeAudienceMemberKind = "GUARDIAN" | "STAFF";
```

`MessageConversation` has `guardianIdentityId` only for `PARENT_STAFF`. Its unique key is `[tenantId, kind, guardianIdentityId]`, which gives each guardian one general parent/school chat without a child or topic key. `MessageParticipant` validates guardian or staff membership. `Message` gets its durable `sequence` from an atomic conversation counter; a separate client idempotency key identifies retries. `MessageParticipantReadCursor` and `MessageDelivery` use that sequence to make forward-only read/delivery state verifiable.

`AceNotice` records the author and selected parent/staff audience. Publishing creates `AceNoticeAudienceMember` snapshot rows and optional `AceNoticeReceipt` state. The audience snapshot cannot be changed or removed; receipt timestamps may only move from null to a later state.

### Task 1: Define the failing messaging and notices storage contract

**Files:**

- Create: `apps/api/src/messaging/tests/messaging-notices.rls.e2e.spec.ts`

**Interfaces:**

- Consumes: `Prisma`, `prisma`, `withTenantRlsContext`, `Prisma.TransactionClient`, `isDatabaseAvailable`, and `requireDatabase`.
- Produces: `MessagingFixture`, tenant/no-context helpers, raw fixture writers, and explicit database rejection assertions.

- [ ] **Step 1: Add an isolated two-tenant fixture and context helpers**

Create two orgs and tenants, three current site staff users, two guardian users, one student user, tenant-local children, guardian identities, active guardian-child relationships, and site memberships. Reuse the role-aware `withTenantRlsContext` pattern from `apps/api/src/identity/tests/identity-relationships.rls.e2e.spec.ts`. Delete the F21 tables in dependency order before deleting fixture identities, children, tenants, orgs, and users.

```ts
async function withMessagingRlsContext<T>(
  tenantId: string,
  orgId: string,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return withTenantRlsContext(tenantId, orgId, callback);
}

async function expectDatabaseRejection(
  operation: () => Promise<unknown>,
  postgresCode: string,
): Promise<void> {
  await expect(operation()).rejects.toMatchObject({
    code: "P2010",
    meta: { code: postgresCode },
  });
}
```

- [ ] **Step 2: Write the general parent/school conversation and topology tests**

Assert Prisma exposes the three allowed conversation kinds and does not expose a `childId`, child relation, student identity field, student participant kind, or `StudentDirect` kind on any F21 messaging model. Create a valid `PARENT_STAFF` conversation for guardian A, then prove a second parent/staff conversation for the same tenant and guardian fails with PostgreSQL `23505`. Create valid `STAFF_DIRECT` and `STAFF_ROOM` conversations. Reject a guardian participant on either staff-only kind, a student user as a participant, and a guardian participant without an active tenant-local relationship with PostgreSQL `23514`.

```ts
const messagingNames = Prisma.dmmf.datamodel.models
  .filter((model) => model.name.startsWith("Message"))
  .flatMap((model) => [model.name, ...model.fields.map((field) => field.name)]);

expect(messagingNames).not.toEqual(
  expect.arrayContaining([expect.stringMatching(/child|student/i)]),
);
const conversationKind = Prisma.dmmf.datamodel.enums.find(
  (item) => item.name === "MessageConversationKind",
);
expect(conversationKind?.values.map((value) => value.name)).toEqual([
  "PARENT_STAFF",
  "STAFF_DIRECT",
  "STAFF_ROOM",
]);
```

- [ ] **Step 3: Write participant removal, message, cursor, and delivery tests**

Seed a parent/staff conversation with its guardian and an active staff participant. Test that an active participant can create a message, but an inactive/removed participant cannot create a message, delivery, or cursor update. Insert two messages using distinct client idempotency keys and assert their assigned sequences increase. Assert a duplicate `[tenantId, conversationId, senderParticipantId, clientRequestId]` write fails with `23505`, a cursor cannot move backwards, and a cursor cannot exceed the conversation's latest sequence. Assert a delivery can move from `PENDING` to `DELIVERED` to `READ`, but cannot move backwards.

```ts
await expectDatabaseRejection(() => setReadCursor(tx, cursorId, 1), "23514");
await expectDatabaseRejection(
  () =>
    insertMessage(tx, {
      conversationId,
      senderParticipantId: removedParticipantId,
      clientRequestId: randomUUID(),
    }),
  "23514",
);
```

- [ ] **Step 4: Write encrypted message and attachment tests**

Create a message through normal tenant-scoped Prisma and assert the application receives the plaintext body. Query the raw `Message.bodyEncrypted` column in the same transaction and assert it matches the existing `v1:` encryption envelope and does not equal the plaintext. Create a message attachment with a tenant-prefixed storage key and assert the model exposes no public URL field.

```ts
expect(raw.bodyEncrypted).toMatch(/^v1:/);
expect(raw.bodyEncrypted).not.toBe("Parent message about transport.");
expect(created.bodyEncrypted).toBe("Parent message about transport.");
```

- [ ] **Step 5: Write frozen-notice-audience and RLS tests**

Create and publish an `AceNotice` for parent/staff recipients. Insert valid guardian and staff audience snapshot rows plus receipt rows. End the guardian relationship and remove a staff membership, then prove the original audience rows remain readable within the tenant. Reject a snapshot mutation/deletion after publication with `55000`; allow a receipt's first delivered/read transition but reject a backward transition. For each F21 table, assert tenant B and a transaction with no tenant context return no tenant-A rows.

```ts
const f21Tables = [
  "MessageConversation",
  "MessageParticipant",
  "Message",
  "MessageParticipantReadCursor",
  "MessageDelivery",
  "MessageAttachment",
  "AceNotice",
  "AceNoticeAudienceMember",
  "AceNoticeReceipt",
  "AceNoticeAttachment",
] as const;

for (const table of f21Tables) {
  await expect(countRowsAsTenant(table, fixture.tenantBId)).resolves.toBe(0);
  await expect(countRowsWithoutTenant(table)).resolves.toBe(0);
}
```

- [ ] **Step 6: Run the focused test in its red state and commit the contract**

Run:

```bash
pnpm --filter @pathway/api test:integration -- --runInBand messaging-notices.rls
```

Expected: the suite fails because the F21 Prisma models and migration tables do not exist. Then commit only the red test contract:

```bash
git add apps/api/src/messaging/tests/messaging-notices.rls.e2e.spec.ts
git commit -m "test: define ACE-F21 messaging storage contract"
```

### Task 2: Add Prisma models and encrypted message registration

**Files:**

- Modify: `packages/db/prisma/schema.prisma`
- Modify: `packages/db/src/pii-encryption.ts`

**Interfaces:**

- Consumes: `Tenant`, `User`, `GuardianIdentity`, `GuardianChildRelationship`, `SiteMembership`, and the PII encryption client extension.
- Produces: the ten F21 Prisma models, five enums, tenant/user/guardian inverse relations, and encrypted `Message.bodyEncrypted` reads/writes.

- [ ] **Step 1: Add the closed messaging and notice enums beside the ACE enums**

Add exactly these enum values. Do not add generic/private/student variants.

```prisma
enum MessageConversationKind {
  PARENT_STAFF
  STAFF_DIRECT
  STAFF_ROOM
}

enum MessageParticipantKind {
  GUARDIAN
  STAFF
}

enum MessageDeliveryStatus {
  PENDING
  DELIVERED
  READ
}

enum AceNoticeAudience {
  PARENTS
  STAFF
  PARENTS_AND_STAFF
}

enum AceNoticeAudienceMemberKind {
  GUARDIAN
  STAFF
}
```

- [ ] **Step 2: Add the messaging models and inverse relations**

`MessageConversation` owns `tenantId`, `kind`, optional `guardianIdentityId`, `createdByUserId`, `lastMessageSequence`, and timestamps. Add `@@unique([tenantId, kind, guardianIdentityId])`. `MessageParticipant` owns `tenantId`, `conversationId`, `userId`, `kind`, optional `guardianIdentityId`, `joinedAt`, and `removedAt`, with one row per `[tenantId, conversationId, userId]`. Use named relations for every model that points to `User` more than once.

```prisma
model Message {
  id                  String   @id @default(uuid())
  tenantId            String
  conversationId      String
  senderParticipantId String
  sequence            Int
  clientRequestId     String
  bodyEncrypted       String   @db.Text
  createdAt           DateTime @default(now())

  conversation MessageConversation @relation(fields: [conversationId, tenantId], references: [id, tenantId], onDelete: Restrict)
  sender       MessageParticipant  @relation(fields: [senderParticipantId, tenantId], references: [id, tenantId], onDelete: Restrict)

  @@unique([tenantId, conversationId, sequence])
  @@unique([tenantId, conversationId, senderParticipantId, clientRequestId])
  @@index([tenantId, conversationId, createdAt])
}
```

Add `MessageParticipantReadCursor`, `MessageDelivery`, and `MessageAttachment` with tenant-local composite relations. The attachment has `storageKey`, `contentType`, `byteSize`, and `sha256`; it has no URL field. Add inbox/history indexes on participant, conversation/sequence, and delivery state.

- [ ] **Step 3: Add ACE notice models and inverse relations**

`AceNotice` has `tenantId`, `createdByUserId`, title, body, `audience`, `publishedAt`, and timestamps. `AceNoticeAudienceMember` has a snapshot recipient user, recipient kind, optional guardian identity, and timestamp. `AceNoticeReceipt` has nullable delivered/read timestamps, and `AceNoticeAttachment` uses the same private-key shape as `MessageAttachment`.

```prisma
model AceNoticeAudienceMember {
  id                 String                      @id @default(uuid())
  tenantId           String
  noticeId           String
  recipientUserId    String
  recipientKind      AceNoticeAudienceMemberKind
  guardianIdentityId String?
  createdAt          DateTime                    @default(now())

  notice           AceNotice        @relation(fields: [noticeId, tenantId], references: [id, tenantId], onDelete: Restrict)
  recipient        User             @relation(fields: [recipientUserId], references: [id], onDelete: Restrict)
  guardianIdentity GuardianIdentity? @relation(fields: [guardianIdentityId, tenantId], references: [id, tenantId], onDelete: Restrict)

  @@unique([tenantId, noticeId, recipientUserId])
  @@index([tenantId, recipientUserId, createdAt])
}
```

Add only the matching `Tenant`, `User`, and `GuardianIdentity` inverse relations. Do not add any relationship to `Child`, `StudentIdentity`, `Group`, `Announcement`, or NexSteps Home models.

- [ ] **Step 4: Register message bodies with transparent PII encryption**

Extend the existing field map without changing its encrypt/decrypt mechanism.

```ts
const ENCRYPTED_STRING_FIELDS: Record<string, readonly string[]> = {
  // Existing entries remain unchanged.
  Message: ["bodyEncrypted"],
};
```

- [ ] **Step 5: Generate Prisma and run the focused contract**

Run:

```bash
pnpm db:generate
pnpm --filter @pathway/api test:integration -- --runInBand messaging-notices.rls
```

Expected: Prisma generation succeeds; the integration suite still fails because the database migration, constraints, and RLS rules have not been added. Commit the schema and encryption registration:

```bash
git add packages/db/prisma/schema.prisma packages/db/src/pii-encryption.ts
git commit -m "feat: add ACE messaging Prisma models"
```

### Task 3: Add the tenant-safe database migration

**Files:**

- Create: `packages/db/prisma/migrations/20260802200000_ace_messaging_notices/migration.sql`

**Interfaces:**

- Consumes: F21 Prisma contract, tenant/guardian/site identity tables, current `OutboxEvent` design, and existing RLS helper functions.
- Produces: F21 PostgreSQL types/tables, indexes, topology/state triggers, tenant RLS policies, and removed public grants.

- [ ] **Step 1: Create all enum types, tables, direct tenant foreign keys, and indexes**

Create the five enum types and ten tables from the Prisma contract. Add a direct `tenantId` foreign key to `Tenant` on every table. Add composite tenant foreign keys for conversation, participant, message, notice, guardian identity, and attachment relations. Add these checks and unique keys:

```sql
CONSTRAINT "MessageConversation_parent_staff_shape_check" CHECK (
  ("kind" = 'PARENT_STAFF' AND "guardianIdentityId" IS NOT NULL)
  OR ("kind" IN ('STAFF_DIRECT', 'STAFF_ROOM') AND "guardianIdentityId" IS NULL)
),
CONSTRAINT "Message_body_not_blank_check" CHECK (btrim("bodyEncrypted") <> ''),
CONSTRAINT "MessageParticipantReadCursor_non_negative_check"
  CHECK ("lastReadSequence" >= 0),
CONSTRAINT "AceNotice_title_not_blank_check" CHECK (btrim("title") <> ''),
CONSTRAINT "AceNotice_body_not_blank_check" CHECK (btrim("body") <> '')
```

Create indexes for participant inbox lookup, conversation history, message recipient delivery state, notice recipient inbox, and notice receipts. Do not create a child/topic index because those columns must not exist.

- [ ] **Step 2: Add participant, author, delivery, and sequence triggers**

Create `SECURITY DEFINER` trigger functions with `SET search_path = ''` that enforce these rules:

1. A guardian participant has the same guardian identity as its `PARENT_STAFF` conversation and at least one current non-`NONE`, non-revoked tenant guardian-child relationship.
2. A staff participant has a current `SiteMembership` and no guardian identity; `STAFF_DIRECT`/`STAFF_ROOM` reject guardian participants.
3. A deferred constraint trigger requires, at commit, exactly one active guardian and at least one active staff member for `PARENT_STAFF`, exactly two active staff members for `STAFF_DIRECT`, and at least two active staff members for `STAFF_ROOM`.
4. A message sender is an active, non-removed participant. Before insert, atomically increment `MessageConversation.lastMessageSequence` and assign `NEW.sequence` from `UPDATE ... RETURNING`.
5. A delivery recipient is a different active participant in the same conversation as the message, and status timestamps progress forward.
6. A cursor belongs to an active participant, stays at or above its previous sequence, and does not exceed the conversation's `lastMessageSequence`.

```sql
UPDATE app."MessageConversation"
SET "lastMessageSequence" = "lastMessageSequence" + 1
WHERE "id" = NEW."conversationId"
  AND "tenantId" = NEW."tenantId"
RETURNING "lastMessageSequence" INTO NEW."sequence";

IF NOT FOUND THEN
  RAISE EXCEPTION 'Message conversation does not belong to tenant'
    USING ERRCODE = 'foreign_key_violation';
END IF;
```

Attach the functions to `BEFORE INSERT OR UPDATE` triggers on participant, message, delivery, and cursor tables. The message trigger must reject a caller-provided `sequence` that differs from the allocated value.

- [ ] **Step 3: Add notice recipient snapshot and receipt-state triggers**

Create trigger functions that enforce:

1. A notice author is a current tenant `SiteMembership` user.
2. A guardian snapshot recipient has a matching guardian identity and an active tenant-local relationship; a staff snapshot recipient has current site membership.
3. Snapshot rows cannot be updated or deleted after the notice has `publishedAt`.
4. Receipt timestamps can transition only from null to non-null, `readAt` requires `deliveredAt`, and neither timestamp can be cleared or moved backwards.
5. Notice attachments and message attachments have non-empty private keys and never include public URL columns.

```sql
IF OLD."publishedAt" IS NOT NULL THEN
  RAISE EXCEPTION 'Published notice audience is immutable'
    USING ERRCODE = 'object_not_in_prerequisite_state';
END IF;
```

Use `BEFORE UPDATE OR DELETE` on `AceNoticeAudienceMember` and `BEFORE UPDATE` on `AceNoticeReceipt`. Do not make receipt rows completely immutable because their state must be able to move from pending to delivered/read.

- [ ] **Step 4: Add forced tenant RLS and revoke public grants**

Use the existing tenant policy shape for every F21 table. The policy must require `app.current_tenant_id() IS NOT NULL` and match the row's `tenantId` for both `USING` and `WITH CHECK`.

```sql
ALTER TABLE "MessageConversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MessageConversation" FORCE ROW LEVEL SECURITY;

CREATE POLICY "MessageConversation_tenant_rls"
  ON "MessageConversation"
  USING (
    app.current_tenant_id() IS NOT NULL
    AND "tenantId" = app.current_tenant_id()
  )
  WITH CHECK (
    app.current_tenant_id() IS NOT NULL
    AND "tenantId" = app.current_tenant_id()
  );

REVOKE ALL ON TABLE "MessageConversation" FROM PUBLIC, anon, authenticated;
```

Apply the same policy and revocations to all ten F21 tables. Add no NexSteps/platform exception. Run the focused integration suite and commit the migration:

```bash
pnpm --filter @pathway/api test:integration -- --runInBand messaging-notices.rls
git add packages/db/prisma/migrations/20260802200000_ace_messaging_notices/migration.sql
git commit -m "feat: add ACE messaging notices migration"
```

### Task 4: Register the strict RLS inventory and complete verification

**Files:**

- Modify: `scripts/check-supabase-rls.mjs`
- Modify: `docs/superpowers/specs/2026-08-02-ace-f21-general-parent-staff-messaging-design.md`

**Interfaces:**

- Consumes: completed migration and F21 integration contract.
- Produces: enforced strict-table coverage and final design verification evidence.

- [ ] **Step 1: Add every F21 table to `REQUIRED_RLS_TABLES`**

Append the complete list adjacent to the existing ACE table families:

```js
  "MessageConversation",
  "MessageParticipant",
  "Message",
  "MessageParticipantReadCursor",
  "MessageDelivery",
  "MessageAttachment",
  "AceNotice",
  "AceNoticeAudienceMember",
  "AceNoticeReceipt",
  "AceNoticeAttachment",
```

- [ ] **Step 2: Run the complete F21 verification sequence**

Run each command from the feature worktree:

```bash
pnpm db:generate
pnpm --filter @pathway/api test:integration -- --runInBand messaging-notices.rls
pnpm --filter @pathway/db test:unit
pnpm supabase:rls:check -- --strict
pnpm --filter @pathway/db typecheck
pnpm --filter @pathway/api typecheck
```

If strict RLS reports the known legacy `ChildGuardianContact` or `OrgDeletedUser` finding, preserve that result and rerun only the F21 table coverage check with the documented gate acceptance:

```bash
SUPABASE_RLS_GATE_ACCEPTED=true pnpm supabase:rls:check -- --strict
```

Do not mark the legacy issue resolved and do not weaken the F21 required-table list.

- [ ] **Step 3: Record final verification and commit**

Update the specification status to `Implemented` only after every F21 check is green or an unrelated pre-existing strict-RLS exception is documented as above. Record the exact commands and outcomes in a `## Verification evidence` section. Then commit the RLS inventory and final design evidence:

```bash
git add scripts/check-supabase-rls.mjs \
  docs/superpowers/specs/2026-08-02-ace-f21-general-parent-staff-messaging-design.md
git commit -m "test: verify ACE messaging storage controls"
```

## Plan self-review

- **Spec coverage:** Tasks 1-3 cover the general guardian conversation, allowed staff conversation types, encrypted message text, private attachments, idempotency, ordered state, frozen notice audiences, receipt transitions, content-free outbox contract, tenant locality, and student-DM exclusion. Task 4 covers strict RLS inventory and final evidence.
- **Scope control:** The plan intentionally excludes routes, permissions, UI, delivery workers, typing, drafts, `Announcement` migration, and NexSteps Home changes.
- **Type consistency:** All test/model/migration references use `MessageConversation`, `MessageParticipant`, `Message`, `MessageParticipantReadCursor`, `MessageDelivery`, `MessageAttachment`, `AceNotice`, `AceNoticeAudienceMember`, `AceNoticeReceipt`, and `AceNoticeAttachment` consistently.
- **Placeholder scan:** No task relies on TODOs, unnamed helpers, or implicit test cases. The commands, table names, model names, trigger rules, and acceptance assertions are explicit.
