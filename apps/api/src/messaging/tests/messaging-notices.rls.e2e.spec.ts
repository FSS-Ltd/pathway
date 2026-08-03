import { randomUUID } from "node:crypto";
import {
  Prisma,
  prisma,
  runTransaction,
  withTenantRlsContext,
  type PrismaClientType,
} from "@pathway/db";
import {
  isDatabaseAvailable,
  requireDatabase,
} from "../../../test-helpers.e2e";

const TENANT_RLS_ROLE = "pathway_e2e_tenant_rls";
const CONCURRENT_PUBLICATION_WAIT_MS = 200;

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

type F21Table = (typeof f21Tables)[number];

const f21TablesWithTenantLocalReferences = [
  "MessageConversation",
  "MessageParticipant",
  "Message",
  "MessageParticipantReadCursor",
  "MessageDelivery",
  "MessageAttachment",
  "AceNoticeAudienceMember",
  "AceNoticeReceipt",
  "AceNoticeAttachment",
] as const satisfies readonly F21Table[];

interface MessagingFixture {
  orgAId: string;
  orgBId: string;
  tenantAId: string;
  tenantBId: string;
  staffAId: string;
  staffBId: string;
  staffCId: string;
  guardianAUserId: string;
  guardianBUserId: string;
  studentUserId: string;
  childAId: string;
  childBId: string;
  guardianAIdentityId: string;
  guardianBIdentityId: string;
  guardianBTenantBIdentityId: string;
  guardianARelationshipId: string;
  guardianBRelationshipId: string;
  studentIdentityId: string;
  studentIdentityLinkId: string;
}

interface ConversationParticipants {
  conversationId: string;
  guardianParticipantId?: string;
  staffParticipantIds: string[];
}

interface F21StorageRows {
  conversationId: string;
  guardianParticipantId: string;
  staffParticipantId: string;
  messageId: string;
  cursorId: string;
  deliveryId: string;
  noticeId: string;
  audienceMemberId: string;
}

interface MessageRecord {
  id: string;
  bodyEncrypted: string;
}

interface MessageDelegate {
  create(args: {
    data: {
      tenantId: string;
      conversationId: string;
      senderParticipantId: string;
      clientRequestId: string;
      bodyEncrypted: string;
    };
  }): Promise<MessageRecord>;
}

function useTenantRlsRole(): boolean {
  return process.env.E2E_USE_GLOBAL_SETUP === "true";
}

async function withMessagingRlsContext<T>(
  tenantId: string,
  orgId: string,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return withTenantRlsContext(tenantId, orgId, async (tx) => {
    if (useTenantRlsRole()) {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE "${TENANT_RLS_ROLE}"`);
    }

    return callback(tx);
  });
}

async function withNoTenantRlsContext<T>(
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return runTransaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE "${TENANT_RLS_ROLE}"`);
    await tx.$executeRawUnsafe("SET LOCAL row_security = on");
    return callback(tx);
  });
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

function getMessageDelegate(tx: Prisma.TransactionClient): MessageDelegate {
  const delegate = Reflect.get(tx, "message");
  if (!delegate || typeof delegate !== "object" || !("create" in delegate)) {
    throw new Error("Prisma Message delegate has not been generated");
  }

  // Task 1 intentionally precedes Prisma generation. This test-only bridge
  // lets the encryption contract exercise the eventual transaction delegate.
  return delegate as unknown as MessageDelegate;
}

async function insertConversation(
  tx: Prisma.TransactionClient,
  fixture: MessagingFixture,
  options: {
    kind: "PARENT_STAFF" | "STAFF_DIRECT" | "STAFF_ROOM";
    guardianIdentityId?: string | null;
    createdByUserId?: string;
  },
): Promise<string> {
  const id = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "MessageConversation" (
      "id", "tenantId", "kind", "guardianIdentityId", "createdByUserId"
    ) VALUES (
      ${id}, ${fixture.tenantAId},
      ${options.kind}::"MessageConversationKind",
      ${options.guardianIdentityId ?? null},
      ${options.createdByUserId ?? fixture.staffAId}
    )
  `;
  return id;
}

async function insertParticipant(
  tx: Prisma.TransactionClient,
  fixture: MessagingFixture,
  options: {
    conversationId: string;
    userId: string;
    kind: "GUARDIAN" | "STAFF";
    guardianIdentityId?: string | null;
  },
): Promise<string> {
  const id = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "MessageParticipant" (
      "id", "tenantId", "conversationId", "userId", "kind", "guardianIdentityId"
    ) VALUES (
      ${id}, ${fixture.tenantAId}, ${options.conversationId}, ${options.userId},
      ${options.kind}::"MessageParticipantKind", ${options.guardianIdentityId ?? null}
    )
  `;
  return id;
}

async function createParentStaffConversation(
  tx: Prisma.TransactionClient,
  fixture: MessagingFixture,
): Promise<ConversationParticipants> {
  const conversationId = await insertConversation(tx, fixture, {
    kind: "PARENT_STAFF",
    guardianIdentityId: fixture.guardianAIdentityId,
  });
  const guardianParticipantId = await insertParticipant(tx, fixture, {
    conversationId,
    userId: fixture.guardianAUserId,
    kind: "GUARDIAN",
    guardianIdentityId: fixture.guardianAIdentityId,
  });
  const staffParticipantId = await insertParticipant(tx, fixture, {
    conversationId,
    userId: fixture.staffAId,
    kind: "STAFF",
  });
  return {
    conversationId,
    guardianParticipantId,
    staffParticipantIds: [staffParticipantId],
  };
}

async function createStaffConversation(
  tx: Prisma.TransactionClient,
  fixture: MessagingFixture,
  kind: "STAFF_DIRECT" | "STAFF_ROOM",
): Promise<ConversationParticipants> {
  const conversationId = await insertConversation(tx, fixture, { kind });
  const staffParticipantIds = await Promise.all(
    [fixture.staffAId, fixture.staffBId].map((userId) =>
      insertParticipant(tx, fixture, {
        conversationId,
        userId,
        kind: "STAFF",
      }),
    ),
  );
  return { conversationId, staffParticipantIds };
}

async function insertMessage(
  tx: Prisma.TransactionClient,
  fixture: MessagingFixture,
  options: {
    conversationId: string;
    senderParticipantId: string;
    clientRequestId: string;
    bodyEncrypted?: string;
  },
): Promise<{ id: string; sequence: number }> {
  const id = randomUUID();
  const [message] = await tx.$queryRaw<Array<{ id: string; sequence: number }>>`
    INSERT INTO "Message" (
      "id", "tenantId", "conversationId", "senderParticipantId", "clientRequestId", "bodyEncrypted"
    ) VALUES (
      ${id}, ${fixture.tenantAId}, ${options.conversationId},
      ${options.senderParticipantId}, ${options.clientRequestId},
      ${options.bodyEncrypted ?? "A parent message about transport."}
    )
    RETURNING "id", "sequence"
  `;
  return message;
}

async function insertReadCursor(
  tx: Prisma.TransactionClient,
  fixture: MessagingFixture,
  conversationId: string,
  participantId: string,
): Promise<string> {
  const id = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "MessageParticipantReadCursor" (
      "id", "tenantId", "conversationId", "participantId", "lastReadSequence"
    ) VALUES (
      ${id}, ${fixture.tenantAId}, ${conversationId}, ${participantId}, 0
    )
  `;
  return id;
}

async function setReadCursor(
  tx: Prisma.TransactionClient,
  cursorId: string,
  lastReadSequence: number,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE "MessageParticipantReadCursor"
    SET "lastReadSequence" = ${lastReadSequence}
    WHERE "id" = ${cursorId}
  `;
}

async function insertDelivery(
  tx: Prisma.TransactionClient,
  fixture: MessagingFixture,
  messageId: string,
  recipientParticipantId: string,
): Promise<string> {
  const id = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "MessageDelivery" (
      "id", "tenantId", "messageId", "recipientParticipantId", "status"
    ) VALUES (
      ${id}, ${fixture.tenantAId}, ${messageId}, ${recipientParticipantId},
      'PENDING'::"MessageDeliveryStatus"
    )
  `;
  return id;
}

async function setDeliveryStatus(
  tx: Prisma.TransactionClient,
  deliveryId: string,
  status: "PENDING" | "DELIVERED" | "READ",
): Promise<void> {
  const deliveredAt = status === "PENDING" ? null : new Date();
  const readAt = status === "READ" ? new Date() : null;
  await tx.$executeRaw`
    UPDATE "MessageDelivery"
    SET
      "status" = ${status}::"MessageDeliveryStatus",
      "deliveredAt" = ${deliveredAt},
      "readAt" = ${readAt}
    WHERE "id" = ${deliveryId}
  `;
}

async function insertMessageAttachment(
  tx: Prisma.TransactionClient,
  fixture: MessagingFixture,
  messageId: string,
): Promise<string> {
  const id = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "MessageAttachment" (
      "id", "tenantId", "messageId", "storageKey", "contentType", "byteSize", "sha256"
    ) VALUES (
      ${id}, ${fixture.tenantAId}, ${messageId},
      ${`${fixture.tenantAId}/messages/${id}.pdf`}, 'application/pdf', 128, ${"a".repeat(64)}
    )
  `;
  return id;
}

async function insertNotice(
  tx: Prisma.TransactionClient,
  fixture: MessagingFixture,
): Promise<string> {
  const id = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "AceNotice" (
      "id", "tenantId", "createdByUserId", "title", "body", "audience", "publishedAt"
    ) VALUES (
      ${id}, ${fixture.tenantAId}, ${fixture.staffAId}, 'Transport update',
      'Notice body for parents and staff.', 'PARENTS_AND_STAFF'::"AceNoticeAudience", NULL
    )
  `;
  return id;
}

async function publishNotice(
  tx: Prisma.TransactionClient,
  noticeId: string,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE "AceNotice"
    SET "publishedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${noticeId}
  `;
}

async function insertNoticeAudienceMember(
  tx: Prisma.TransactionClient,
  fixture: MessagingFixture,
  options: {
    noticeId: string;
    recipientUserId: string;
    recipientKind: "GUARDIAN" | "STAFF";
    guardianIdentityId?: string | null;
  },
): Promise<string> {
  const id = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "AceNoticeAudienceMember" (
      "id", "tenantId", "noticeId", "recipientUserId", "recipientKind", "guardianIdentityId"
    ) VALUES (
      ${id}, ${fixture.tenantAId}, ${options.noticeId}, ${options.recipientUserId},
      ${options.recipientKind}::"AceNoticeAudienceMemberKind",
      ${options.guardianIdentityId ?? null}
    )
  `;
  return id;
}

async function insertNoticeReceipt(
  tx: Prisma.TransactionClient,
  fixture: MessagingFixture,
  audienceMemberId: string,
): Promise<string> {
  const id = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "AceNoticeReceipt" ("id", "tenantId", "audienceMemberId")
    VALUES (${id}, ${fixture.tenantAId}, ${audienceMemberId})
  `;
  return id;
}

async function setNoticeReceiptState(
  tx: Prisma.TransactionClient,
  receiptId: string,
  deliveredAt: Date | null,
  readAt: Date | null,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE "AceNoticeReceipt"
    SET "deliveredAt" = ${deliveredAt}, "readAt" = ${readAt}
    WHERE "id" = ${receiptId}
  `;
}

async function insertNoticeAttachment(
  tx: Prisma.TransactionClient,
  fixture: MessagingFixture,
  noticeId: string,
): Promise<string> {
  const id = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "AceNoticeAttachment" (
      "id", "tenantId", "noticeId", "storageKey", "contentType", "byteSize", "sha256"
    ) VALUES (
      ${id}, ${fixture.tenantAId}, ${noticeId},
      ${`${fixture.tenantAId}/notices/${id}.pdf`}, 'application/pdf', 256, ${"b".repeat(64)}
    )
  `;
  return id;
}

async function deleteMessagingRowsIfPresent(
  client: PrismaClientType,
): Promise<void> {
  const [row] = await client.$queryRaw<Array<{ exists: string | null }>>`
    SELECT to_regclass('app."MessageConversation"')::text AS "exists"
  `;
  if (!row?.exists) return;

  await client.$executeRawUnsafe(`
    TRUNCATE TABLE
      "AceNoticeReceipt",
      "AceNoticeAttachment",
      "AceNoticeAudienceMember",
      "AceNotice",
      "MessageAttachment",
      "MessageDelivery",
      "MessageParticipantReadCursor",
      "Message",
      "MessageParticipant",
      "MessageConversation"
  `);
}

async function countRowsAsTenant(
  table: F21Table,
  tenantId: string,
  fixture: MessagingFixture,
): Promise<number> {
  return withMessagingRlsContext(
    tenantId,
    tenantId === fixture.tenantAId ? fixture.orgAId : fixture.orgBId,
    async (tx) => {
      const [row] = await tx.$queryRawUnsafe<Array<{ count: number }>>(
        `SELECT count(*)::int AS "count" FROM "${table}"`,
      );
      return row.count;
    },
  );
}

async function countRowsWithoutTenant(table: F21Table): Promise<number> {
  return withNoTenantRlsContext(async (tx) => {
    const [row] = await tx.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT count(*)::int AS "count" FROM "${table}"`,
    );
    return row.count;
  });
}

async function seedTenantAF21Rows(
  tx: Prisma.TransactionClient,
  fixture: MessagingFixture,
): Promise<F21StorageRows> {
  const conversation = await createParentStaffConversation(tx, fixture);
  const guardianParticipantId = conversation.guardianParticipantId!;
  const staffParticipantId = conversation.staffParticipantIds[0];
  const message = await insertMessage(tx, fixture, {
    conversationId: conversation.conversationId,
    senderParticipantId: guardianParticipantId,
    clientRequestId: randomUUID(),
  });
  const cursorId = await insertReadCursor(
    tx,
    fixture,
    conversation.conversationId,
    guardianParticipantId,
  );
  const deliveryId = await insertDelivery(
    tx,
    fixture,
    message.id,
    staffParticipantId,
  );
  await insertMessageAttachment(tx, fixture, message.id);
  const noticeId = await insertNotice(tx, fixture);
  const audienceMemberId = await insertNoticeAudienceMember(tx, fixture, {
    noticeId,
    recipientUserId: fixture.guardianAUserId,
    recipientKind: "GUARDIAN",
    guardianIdentityId: fixture.guardianAIdentityId,
  });
  await publishNotice(tx, noticeId);
  await insertNoticeReceipt(tx, fixture, audienceMemberId);
  await insertNoticeAttachment(tx, fixture, noticeId);
  return {
    conversationId: conversation.conversationId,
    guardianParticipantId,
    staffParticipantId,
    messageId: message.id,
    cursorId,
    deliveryId,
    noticeId,
    audienceMemberId,
  };
}

async function seedTenantBF21References(
  tx: Prisma.TransactionClient,
  fixture: MessagingFixture,
): Promise<
  Pick<
    F21StorageRows,
    | "conversationId"
    | "guardianParticipantId"
    | "staffParticipantId"
    | "messageId"
    | "noticeId"
    | "audienceMemberId"
  >
> {
  const conversationId = randomUUID();
  const guardianParticipantId = randomUUID();
  const staffParticipantId = randomUUID();
  const messageId = randomUUID();
  const noticeId = randomUUID();
  const audienceMemberId = randomUUID();

  await tx.$executeRaw`
    INSERT INTO "MessageConversation" (
      "id", "tenantId", "kind", "guardianIdentityId", "createdByUserId"
    ) VALUES (
      ${conversationId}, ${fixture.tenantBId}, 'PARENT_STAFF'::"MessageConversationKind",
      ${fixture.guardianBTenantBIdentityId}, ${fixture.staffCId}
    )
  `;
  await tx.$executeRaw`
    INSERT INTO "MessageParticipant" (
      "id", "tenantId", "conversationId", "userId", "kind", "guardianIdentityId"
    ) VALUES
      (
        ${guardianParticipantId}, ${fixture.tenantBId}, ${conversationId},
        ${fixture.guardianBUserId}, 'GUARDIAN'::"MessageParticipantKind",
        ${fixture.guardianBTenantBIdentityId}
      ),
      (
        ${staffParticipantId}, ${fixture.tenantBId}, ${conversationId},
        ${fixture.staffCId}, 'STAFF'::"MessageParticipantKind", NULL
      )
  `;
  await tx.$executeRaw`
    INSERT INTO "Message" (
      "id", "tenantId", "conversationId", "senderParticipantId", "clientRequestId", "bodyEncrypted"
    ) VALUES (
      ${messageId}, ${fixture.tenantBId}, ${conversationId},
      ${guardianParticipantId}, ${randomUUID()}, 'Tenant B message.'
    )
  `;
  await tx.$executeRaw`
    INSERT INTO "AceNotice" (
      "id", "tenantId", "createdByUserId", "title", "body", "audience", "publishedAt"
    ) VALUES (
      ${noticeId}, ${fixture.tenantBId}, ${fixture.staffCId}, 'Tenant B notice',
      'Tenant B notice body.', 'PARENTS'::"AceNoticeAudience", NULL
    )
  `;
  await tx.$executeRaw`
    INSERT INTO "AceNoticeAudienceMember" (
      "id", "tenantId", "noticeId", "recipientUserId", "recipientKind", "guardianIdentityId"
    ) VALUES (
      ${audienceMemberId}, ${fixture.tenantBId}, ${noticeId}, ${fixture.guardianBUserId},
      'GUARDIAN'::"AceNoticeAudienceMemberKind", ${fixture.guardianBTenantBIdentityId}
    )
  `;
  await tx.$executeRaw`
    UPDATE "AceNotice"
    SET "publishedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${noticeId}
  `;
  return {
    conversationId,
    guardianParticipantId,
    staffParticipantId,
    messageId,
    noticeId,
    audienceMemberId,
  };
}

async function insertTenantAWriteProbe(
  tx: Prisma.TransactionClient,
  fixture: MessagingFixture,
  rows: F21StorageRows,
  table: F21Table,
): Promise<void> {
  const id = randomUUID();
  switch (table) {
    case "MessageConversation":
      await tx.$executeRaw`
        INSERT INTO "MessageConversation" (
          "id", "tenantId", "kind", "guardianIdentityId", "createdByUserId"
        ) VALUES (
          ${id}, ${fixture.tenantAId}, 'PARENT_STAFF'::"MessageConversationKind",
          ${fixture.guardianAIdentityId}, ${fixture.staffAId}
        )
      `;
      return;
    case "MessageParticipant":
      await tx.$executeRaw`
        INSERT INTO "MessageParticipant" (
          "id", "tenantId", "conversationId", "userId", "kind", "guardianIdentityId"
        ) VALUES (
          ${id}, ${fixture.tenantAId}, ${rows.conversationId}, ${fixture.staffCId},
          'STAFF'::"MessageParticipantKind", NULL
        )
      `;
      return;
    case "Message":
      await tx.$executeRaw`
        INSERT INTO "Message" (
          "id", "tenantId", "conversationId", "senderParticipantId", "clientRequestId", "bodyEncrypted"
        ) VALUES (
          ${id}, ${fixture.tenantAId}, ${rows.conversationId},
          ${rows.guardianParticipantId}, ${randomUUID()}, 'RLS write probe.'
        )
      `;
      return;
    case "MessageParticipantReadCursor":
      await tx.$executeRaw`
        INSERT INTO "MessageParticipantReadCursor" (
          "id", "tenantId", "conversationId", "participantId", "lastReadSequence"
        ) VALUES (
          ${id}, ${fixture.tenantAId}, ${rows.conversationId},
          ${rows.staffParticipantId}, 0
        )
      `;
      return;
    case "MessageDelivery":
      await tx.$executeRaw`
        INSERT INTO "MessageDelivery" (
          "id", "tenantId", "messageId", "recipientParticipantId", "status"
        ) VALUES (
          ${id}, ${fixture.tenantAId}, ${rows.messageId},
          ${rows.staffParticipantId}, 'PENDING'::"MessageDeliveryStatus"
        )
      `;
      return;
    case "MessageAttachment":
      await tx.$executeRaw`
        INSERT INTO "MessageAttachment" (
          "id", "tenantId", "messageId", "storageKey", "contentType", "byteSize", "sha256"
        ) VALUES (
          ${id}, ${fixture.tenantAId}, ${rows.messageId},
          ${`${fixture.tenantAId}/messages/${id}.pdf`}, 'application/pdf', 64, ${"c".repeat(64)}
        )
      `;
      return;
    case "AceNotice":
      await tx.$executeRaw`
        INSERT INTO "AceNotice" (
          "id", "tenantId", "createdByUserId", "title", "body", "audience", "publishedAt"
        ) VALUES (
          ${id}, ${fixture.tenantAId}, ${fixture.staffAId}, 'RLS write probe',
          'RLS write probe body.', 'PARENTS'::"AceNoticeAudience", CURRENT_TIMESTAMP
        )
      `;
      return;
    case "AceNoticeAudienceMember":
      await tx.$executeRaw`
        INSERT INTO "AceNoticeAudienceMember" (
          "id", "tenantId", "noticeId", "recipientUserId", "recipientKind", "guardianIdentityId"
        ) VALUES (
          ${id}, ${fixture.tenantAId}, ${rows.noticeId}, ${fixture.guardianAUserId},
          'GUARDIAN'::"AceNoticeAudienceMemberKind", ${fixture.guardianAIdentityId}
        )
      `;
      return;
    case "AceNoticeReceipt":
      await tx.$executeRaw`
        INSERT INTO "AceNoticeReceipt" ("id", "tenantId", "audienceMemberId")
        VALUES (${id}, ${fixture.tenantAId}, ${rows.audienceMemberId})
      `;
      return;
    case "AceNoticeAttachment":
      await tx.$executeRaw`
        INSERT INTO "AceNoticeAttachment" (
          "id", "tenantId", "noticeId", "storageKey", "contentType", "byteSize", "sha256"
        ) VALUES (
          ${id}, ${fixture.tenantAId}, ${rows.noticeId},
          ${`${fixture.tenantAId}/notices/${id}.pdf`}, 'application/pdf', 64, ${"d".repeat(64)}
        )
      `;
      return;
  }
}

async function insertMixedTenantReferenceProbe(
  tx: Prisma.TransactionClient,
  fixture: MessagingFixture,
  tenantBRows: Pick<
    F21StorageRows,
    | "conversationId"
    | "guardianParticipantId"
    | "staffParticipantId"
    | "messageId"
    | "noticeId"
    | "audienceMemberId"
  >,
  table: F21Table,
): Promise<void> {
  const id = randomUUID();
  switch (table) {
    case "MessageConversation":
      await tx.$executeRaw`
        INSERT INTO "MessageConversation" (
          "id", "tenantId", "kind", "guardianIdentityId", "createdByUserId"
        ) VALUES (
          ${id}, ${fixture.tenantAId}, 'PARENT_STAFF'::"MessageConversationKind",
          ${fixture.guardianBTenantBIdentityId}, ${fixture.staffAId}
        )
      `;
      return;
    case "MessageParticipant":
      await tx.$executeRaw`
        INSERT INTO "MessageParticipant" (
          "id", "tenantId", "conversationId", "userId", "kind", "guardianIdentityId"
        ) VALUES (
          ${id}, ${fixture.tenantAId}, ${tenantBRows.conversationId}, ${fixture.staffAId},
          'STAFF'::"MessageParticipantKind", NULL
        )
      `;
      return;
    case "Message":
      await tx.$executeRaw`
        INSERT INTO "Message" (
          "id", "tenantId", "conversationId", "senderParticipantId", "clientRequestId", "bodyEncrypted"
        ) VALUES (
          ${id}, ${fixture.tenantAId}, ${tenantBRows.conversationId},
          ${tenantBRows.guardianParticipantId}, ${randomUUID()}, 'Mixed tenant message.'
        )
      `;
      return;
    case "MessageParticipantReadCursor":
      await tx.$executeRaw`
        INSERT INTO "MessageParticipantReadCursor" (
          "id", "tenantId", "conversationId", "participantId", "lastReadSequence"
        ) VALUES (
          ${id}, ${fixture.tenantAId}, ${tenantBRows.conversationId},
          ${tenantBRows.staffParticipantId}, 0
        )
      `;
      return;
    case "MessageDelivery":
      await tx.$executeRaw`
        INSERT INTO "MessageDelivery" (
          "id", "tenantId", "messageId", "recipientParticipantId", "status"
        ) VALUES (
          ${id}, ${fixture.tenantAId}, ${tenantBRows.messageId},
          ${tenantBRows.staffParticipantId}, 'PENDING'::"MessageDeliveryStatus"
        )
      `;
      return;
    case "MessageAttachment":
      await tx.$executeRaw`
        INSERT INTO "MessageAttachment" (
          "id", "tenantId", "messageId", "storageKey", "contentType", "byteSize", "sha256"
        ) VALUES (
          ${id}, ${fixture.tenantAId}, ${tenantBRows.messageId},
          ${`${fixture.tenantAId}/messages/${id}.pdf`}, 'application/pdf', 64, ${"e".repeat(64)}
        )
      `;
      return;
    case "AceNotice":
      await tx.$executeRaw`
        INSERT INTO "AceNotice" (
          "id", "tenantId", "createdByUserId", "title", "body", "audience", "publishedAt"
        ) VALUES (
          ${id}, ${fixture.tenantAId}, ${fixture.staffCId}, 'Mixed tenant notice',
          'Mixed tenant notice body.', 'PARENTS'::"AceNoticeAudience", CURRENT_TIMESTAMP
        )
      `;
      return;
    case "AceNoticeAudienceMember":
      await tx.$executeRaw`
        INSERT INTO "AceNoticeAudienceMember" (
          "id", "tenantId", "noticeId", "recipientUserId", "recipientKind", "guardianIdentityId"
        ) VALUES (
          ${id}, ${fixture.tenantAId}, ${tenantBRows.noticeId}, ${fixture.guardianAUserId},
          'GUARDIAN'::"AceNoticeAudienceMemberKind", ${fixture.guardianAIdentityId}
        )
      `;
      return;
    case "AceNoticeReceipt":
      await tx.$executeRaw`
        INSERT INTO "AceNoticeReceipt" ("id", "tenantId", "audienceMemberId")
        VALUES (${id}, ${fixture.tenantAId}, ${tenantBRows.audienceMemberId})
      `;
      return;
    case "AceNoticeAttachment":
      await tx.$executeRaw`
        INSERT INTO "AceNoticeAttachment" (
          "id", "tenantId", "noticeId", "storageKey", "contentType", "byteSize", "sha256"
        ) VALUES (
          ${id}, ${fixture.tenantAId}, ${tenantBRows.noticeId},
          ${`${fixture.tenantAId}/notices/${id}.pdf`}, 'application/pdf', 64, ${"f".repeat(64)}
        )
      `;
      return;
  }
}

function messagingModelAndFieldNames(): string[] {
  return Prisma.dmmf.datamodel.models
    .filter((model) => model.name.startsWith("Message"))
    .flatMap((model) => [
      model.name,
      ...model.fields.map((field) => field.name),
    ]);
}

describe("ACE parent/staff messaging and notices storage", () => {
  let fixture: MessagingFixture;

  it("exposes the closed parent/staff messaging topology without student or child dimensions", () => {
    const messagingNames = messagingModelAndFieldNames();
    const messagingModels = Prisma.dmmf.datamodel.models
      .filter((model) => model.name.startsWith("Message"))
      .map((model) => model.name)
      .sort();
    const conversationKind = Prisma.dmmf.datamodel.enums.find(
      (item) => item.name === "MessageConversationKind",
    );
    const participantKind = Prisma.dmmf.datamodel.enums.find(
      (item) => item.name === "MessageParticipantKind",
    );

    expect(messagingModels).toEqual([
      "Message",
      "MessageAttachment",
      "MessageConversation",
      "MessageDelivery",
      "MessageParticipant",
      "MessageParticipantReadCursor",
    ]);
    expect(messagingNames).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/child|student/i)]),
    );
    expect(messagingNames).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(/topic|subject/i),
        expect.stringMatching(/^(staffId|staffUserId|assignedStaffUserId)$/i),
        expect.stringMatching(/parentGroup|groupId/i),
        expect.stringMatching(/public|visibility/i),
        expect.stringMatching(/typing/i),
        expect.stringMatching(/draft/i),
      ]),
    );
    expect(conversationKind?.values.map((value) => value.name)).toEqual([
      "PARENT_STAFF",
      "STAFF_DIRECT",
      "STAFF_ROOM",
    ]);
    expect(participantKind?.values.map((value) => value.name)).toEqual([
      "GUARDIAN",
      "STAFF",
    ]);
  });

  beforeAll(async () => {
    if (!requireDatabase()) return;

    fixture = {
      orgAId: randomUUID(),
      orgBId: randomUUID(),
      tenantAId: randomUUID(),
      tenantBId: randomUUID(),
      staffAId: randomUUID(),
      staffBId: randomUUID(),
      staffCId: randomUUID(),
      guardianAUserId: randomUUID(),
      guardianBUserId: randomUUID(),
      studentUserId: randomUUID(),
      childAId: randomUUID(),
      childBId: randomUUID(),
      guardianAIdentityId: randomUUID(),
      guardianBIdentityId: randomUUID(),
      guardianBTenantBIdentityId: randomUUID(),
      guardianARelationshipId: randomUUID(),
      guardianBRelationshipId: randomUUID(),
      studentIdentityId: randomUUID(),
      studentIdentityLinkId: randomUUID(),
    };

    await prisma.org.createMany({
      data: [
        {
          id: fixture.orgAId,
          name: `Messaging org A ${fixture.orgAId}`,
          slug: `messaging-a-${fixture.orgAId}`,
          planCode: "trial",
        },
        {
          id: fixture.orgBId,
          name: `Messaging org B ${fixture.orgBId}`,
          slug: `messaging-b-${fixture.orgBId}`,
          planCode: "trial",
        },
      ],
    });
    await prisma.tenant.createMany({
      data: [
        {
          id: fixture.tenantAId,
          orgId: fixture.orgAId,
          name: `Messaging tenant A ${fixture.tenantAId}`,
          slug: `messaging-a-${fixture.tenantAId}`,
        },
        {
          id: fixture.tenantBId,
          orgId: fixture.orgBId,
          name: `Messaging tenant B ${fixture.tenantBId}`,
          slug: `messaging-b-${fixture.tenantBId}`,
        },
      ],
    });
    await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        await tx.user.createMany({
          data: [
            fixture.staffAId,
            fixture.staffBId,
            fixture.staffCId,
            fixture.guardianAUserId,
            fixture.guardianBUserId,
            fixture.studentUserId,
          ].map((id) => ({
            id,
            email: `${id}@example.test`,
            tenantId: fixture.tenantAId,
          })),
        });
        await tx.siteMembership.createMany({
          data: [
            fixture.staffAId,
            fixture.staffBId,
            fixture.staffCId,
            // The student retains a site membership so its rejection proves
            // the no-student-participant rule, not just missing membership.
            fixture.studentUserId,
          ].map((userId) => ({
            tenantId: fixture.tenantAId,
            userId,
          })),
        });
        await tx.child.create({
          data: {
            id: fixture.childAId,
            firstName: "Messaging",
            lastName: "Child A",
            tenantId: fixture.tenantAId,
          },
        });
        await tx.$executeRaw`
        INSERT INTO "GuardianIdentity" ("id", "tenantId", "userId")
        VALUES
          (${fixture.guardianAIdentityId}, ${fixture.tenantAId}, ${fixture.guardianAUserId}),
          (${fixture.guardianBIdentityId}, ${fixture.tenantAId}, ${fixture.guardianBUserId})
      `;
        await tx.$executeRaw`
        INSERT INTO "GuardianChildRelationship" (
          "id", "tenantId", "guardianIdentityId", "childId", "legalAccess"
        ) VALUES (
          ${fixture.guardianARelationshipId}, ${fixture.tenantAId},
          ${fixture.guardianAIdentityId}, ${fixture.childAId}, 'FULL'::"GuardianLegalAccess"
        )
      `;
        await tx.$executeRaw`
        INSERT INTO "StudentPortalPolicy" ("tenantId", "studentPortalEnabled")
        VALUES (${fixture.tenantAId}, true)
      `;
        await tx.$executeRaw`
        INSERT INTO "StudentIdentity" ("id", "tenantId", "userId")
        VALUES (${fixture.studentIdentityId}, ${fixture.tenantAId}, ${fixture.studentUserId})
      `;
        await tx.$executeRaw`
        INSERT INTO "StudentIdentityLink" (
          "id", "tenantId", "studentIdentityId", "childId"
        ) VALUES (
          ${fixture.studentIdentityLinkId}, ${fixture.tenantAId},
          ${fixture.studentIdentityId}, ${fixture.childAId}
        )
      `;
      },
    );
    await withMessagingRlsContext(
      fixture.tenantBId,
      fixture.orgBId,
      async (tx) => {
        await tx.child.create({
          data: {
            id: fixture.childBId,
            firstName: "Messaging",
            lastName: "Child B",
            tenantId: fixture.tenantBId,
          },
        });
        await tx.siteMembership.create({
          data: { tenantId: fixture.tenantBId, userId: fixture.staffCId },
        });
        await tx.$executeRaw`
        INSERT INTO "GuardianIdentity" ("id", "tenantId", "userId")
        VALUES (
          ${fixture.guardianBTenantBIdentityId}, ${fixture.tenantBId},
          ${fixture.guardianBUserId}
        )
      `;
        await tx.$executeRaw`
        INSERT INTO "GuardianChildRelationship" (
          "id", "tenantId", "guardianIdentityId", "childId", "legalAccess"
        ) VALUES (
          ${fixture.guardianBRelationshipId}, ${fixture.tenantBId},
          ${fixture.guardianBTenantBIdentityId}, ${fixture.childBId},
          'FULL'::"GuardianLegalAccess"
        )
      `;
      },
    );
  });

  afterEach(async () => {
    if (!isDatabaseAvailable() || !fixture) return;
    await deleteMessagingRowsIfPresent(prisma);
    await prisma.guardianChildRelationship.updateMany({
      where: { id: fixture.guardianARelationshipId },
      data: {
        endedAt: null,
        revokedAt: null,
        revokedByUserId: null,
        revocationReason: null,
      },
    });
    await prisma.siteMembership.upsert({
      where: {
        tenantId_userId: {
          tenantId: fixture.tenantAId,
          userId: fixture.staffAId,
        },
      },
      create: { tenantId: fixture.tenantAId, userId: fixture.staffAId },
      update: {},
    });
  });

  afterAll(async () => {
    if (!isDatabaseAvailable() || !fixture) return;
    await deleteMessagingRowsIfPresent(prisma);
    await prisma.studentIdentityLink.deleteMany({
      where: { id: fixture.studentIdentityLinkId },
    });
    await prisma.studentIdentity.deleteMany({
      where: { id: fixture.studentIdentityId },
    });
    await prisma.studentPortalPolicy.deleteMany({
      where: { tenantId: fixture.tenantAId },
    });
    await prisma.guardianChildRelationship.deleteMany({
      where: {
        id: {
          in: [
            fixture.guardianARelationshipId,
            fixture.guardianBRelationshipId,
          ],
        },
      },
    });
    await prisma.guardianIdentity.deleteMany({
      where: {
        id: {
          in: [
            fixture.guardianAIdentityId,
            fixture.guardianBIdentityId,
            fixture.guardianBTenantBIdentityId,
          ],
        },
      },
    });
    await prisma.child.deleteMany({
      where: { id: { in: [fixture.childAId, fixture.childBId] } },
    });
    await prisma.siteMembership.deleteMany({
      where: {
        userId: {
          in: [
            fixture.staffAId,
            fixture.staffBId,
            fixture.staffCId,
            fixture.studentUserId,
          ],
        },
      },
    });
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [
            fixture.staffAId,
            fixture.staffBId,
            fixture.staffCId,
            fixture.guardianAUserId,
            fixture.guardianBUserId,
            fixture.studentUserId,
          ],
        },
      },
    });
    await prisma.tenant.deleteMany({
      where: { id: { in: [fixture.tenantAId, fixture.tenantBId] } },
    });
    await prisma.org.deleteMany({
      where: { id: { in: [fixture.orgAId, fixture.orgBId] } },
    });
  });

  it("permits one general parent conversation per guardian and valid staff conversation kinds", async () => {
    if (!isDatabaseAvailable()) return;

    await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        await createParentStaffConversation(tx, fixture);
        await createStaffConversation(tx, fixture, "STAFF_DIRECT");
        await createStaffConversation(tx, fixture, "STAFF_ROOM");
      },
    );
    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertConversation(tx, fixture, {
            kind: "PARENT_STAFF",
            guardianIdentityId: fixture.guardianAIdentityId,
          }),
        ),
      "23505",
    );
  });

  it("rejects guardians in staff conversations, student participants, and guardians without active relationships", async () => {
    if (!isDatabaseAvailable()) return;

    for (const kind of ["STAFF_DIRECT", "STAFF_ROOM"] as const) {
      await expectDatabaseRejection(
        () =>
          withMessagingRlsContext(
            fixture.tenantAId,
            fixture.orgAId,
            async (tx) => {
              const staffConversation = await createStaffConversation(
                tx,
                fixture,
                kind,
              );
              await insertParticipant(tx, fixture, {
                conversationId: staffConversation.conversationId,
                userId: fixture.guardianAUserId,
                kind: "GUARDIAN",
                guardianIdentityId: fixture.guardianAIdentityId,
              });
            },
          ),
        "23514",
      );
    }
    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          async (tx) => {
            const staffRoom = await createStaffConversation(
              tx,
              fixture,
              "STAFF_ROOM",
            );
            await insertParticipant(tx, fixture, {
              conversationId: staffRoom.conversationId,
              userId: fixture.studentUserId,
              kind: "STAFF",
            });
          },
        ),
      "23514",
    );
    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          async (tx) => {
            const conversationId = await insertConversation(tx, fixture, {
              kind: "PARENT_STAFF",
              guardianIdentityId: fixture.guardianBIdentityId,
            });
            await insertParticipant(tx, fixture, {
              conversationId,
              userId: fixture.guardianBUserId,
              kind: "GUARDIAN",
              guardianIdentityId: fixture.guardianBIdentityId,
            });
          },
        ),
      "23514",
    );
  });

  it("orders active-participant messages and rejects removed participants, duplicate retries, and invalid cursor or delivery transitions", async () => {
    if (!isDatabaseAvailable()) return;

    const seeded = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        const conversation = await createParentStaffConversation(tx, fixture);
        const removedParticipantId = await insertParticipant(tx, fixture, {
          conversationId: conversation.conversationId,
          userId: fixture.staffBId,
          kind: "STAFF",
        });
        const firstClientRequestId = randomUUID();
        const firstMessage = await insertMessage(tx, fixture, {
          conversationId: conversation.conversationId,
          senderParticipantId: conversation.guardianParticipantId!,
          clientRequestId: firstClientRequestId,
        });
        const secondMessage = await insertMessage(tx, fixture, {
          conversationId: conversation.conversationId,
          senderParticipantId: conversation.staffParticipantIds[0],
          clientRequestId: randomUUID(),
        });
        const activeCursorId = await insertReadCursor(
          tx,
          fixture,
          conversation.conversationId,
          conversation.guardianParticipantId!,
        );
        const removedCursorId = await insertReadCursor(
          tx,
          fixture,
          conversation.conversationId,
          removedParticipantId,
        );
        const deliveryId = await insertDelivery(
          tx,
          fixture,
          firstMessage.id,
          conversation.staffParticipantIds[0],
        );
        await setReadCursor(tx, activeCursorId, secondMessage.sequence);
        await setDeliveryStatus(tx, deliveryId, "DELIVERED");
        await setDeliveryStatus(tx, deliveryId, "READ");
        await tx.$executeRaw`
        UPDATE "MessageParticipant"
        SET "removedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${removedParticipantId}
      `;
        return {
          conversationId: conversation.conversationId,
          guardianParticipantId: conversation.guardianParticipantId!,
          removedParticipantId,
          firstClientRequestId,
          firstMessage,
          secondMessage,
          activeCursorId,
          removedCursorId,
          deliveryId,
        };
      },
    );

    expect(seeded.secondMessage.sequence).toBeGreaterThan(
      seeded.firstMessage.sequence,
    );
    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          tx.$executeRaw`
            UPDATE "Message"
            SET "bodyEncrypted" = 'Altered post-send message body.'
            WHERE "id" = ${seeded.firstMessage.id}
          `,
        ),
      "55000",
    );
    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertMessage(tx, fixture, {
            conversationId: seeded.conversationId,
            senderParticipantId: seeded.guardianParticipantId,
            clientRequestId: seeded.firstClientRequestId,
          }),
        ),
      "23505",
    );
    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertMessage(tx, fixture, {
            conversationId: seeded.conversationId,
            senderParticipantId: seeded.removedParticipantId,
            clientRequestId: randomUUID(),
          }),
        ),
      "23514",
    );
    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertDelivery(
            tx,
            fixture,
            seeded.secondMessage.id,
            seeded.removedParticipantId,
          ),
        ),
      "23514",
    );
    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          setReadCursor(tx, seeded.removedCursorId, 1),
        ),
      "23514",
    );
    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          setReadCursor(tx, seeded.activeCursorId, 1),
        ),
      "23514",
    );
    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          setReadCursor(
            tx,
            seeded.activeCursorId,
            seeded.secondMessage.sequence + 1,
          ),
        ),
      "23514",
    );
    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          setDeliveryStatus(tx, seeded.deliveryId, "PENDING"),
        ),
      "23514",
    );
  });

  it("encrypts message bodies through Prisma and keeps attachment storage keys private", async () => {
    if (!isDatabaseAvailable()) return;

    const plaintext = "Parent message about transport.";
    const result = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        const conversation = await createParentStaffConversation(tx, fixture);
        const created = await getMessageDelegate(tx).create({
          data: {
            tenantId: fixture.tenantAId,
            conversationId: conversation.conversationId,
            senderParticipantId: conversation.guardianParticipantId!,
            clientRequestId: randomUUID(),
            bodyEncrypted: plaintext,
          },
        });
        const [raw] = await tx.$queryRaw<Array<{ bodyEncrypted: string }>>`
        SELECT "bodyEncrypted" FROM "Message" WHERE "id" = ${created.id}
      `;
        await insertMessageAttachment(tx, fixture, created.id);
        return { created, raw };
      },
    );

    const attachmentFields =
      Prisma.dmmf.datamodel.models
        .find((model) => model.name === "MessageAttachment")
        ?.fields.map((field) => field.name) ?? [];
    expect(result.raw.bodyEncrypted).toMatch(/^v1:/);
    expect(result.raw.bodyEncrypted).not.toBe(plaintext);
    expect(result.created.bodyEncrypted).toBe(plaintext);
    expect(attachmentFields).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/url/i)]),
    );
  });

  it("freezes published notice audiences and metadata while receipts progress forward", async () => {
    if (!isDatabaseAvailable()) return;

    const seeded = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        const noticeId = await insertNotice(tx, fixture);
        const guardianAudienceMemberId = await insertNoticeAudienceMember(
          tx,
          fixture,
          {
            noticeId,
            recipientUserId: fixture.guardianAUserId,
            recipientKind: "GUARDIAN",
            guardianIdentityId: fixture.guardianAIdentityId,
          },
        );
        const staffAudienceMemberId = await insertNoticeAudienceMember(
          tx,
          fixture,
          {
            noticeId,
            recipientUserId: fixture.staffAId,
            recipientKind: "STAFF",
          },
        );
        const draftAudienceMemberId = await insertNoticeAudienceMember(
          tx,
          fixture,
          {
            noticeId,
            recipientUserId: fixture.staffCId,
            recipientKind: "STAFF",
          },
        );
        const draftAudienceMemberUpdateCount = await tx.$executeRaw`
          UPDATE "AceNoticeAudienceMember"
          SET "recipientUserId" = ${fixture.staffBId}
          WHERE "id" = ${draftAudienceMemberId}
        `;
        expect(draftAudienceMemberUpdateCount).toBe(1);
        const draftAudienceMemberDeleteCount = await tx.$executeRaw`
          DELETE FROM "AceNoticeAudienceMember"
          WHERE "id" = ${draftAudienceMemberId}
        `;
        expect(draftAudienceMemberDeleteCount).toBe(1);
        await publishNotice(tx, noticeId);
        const receiptId = await insertNoticeReceipt(
          tx,
          fixture,
          guardianAudienceMemberId,
        );
        await insertNoticeReceipt(tx, fixture, staffAudienceMemberId);
        await insertNoticeAttachment(tx, fixture, noticeId);
        return {
          noticeId,
          guardianAudienceMemberId,
          staffAudienceMemberId,
          receiptId,
        };
      },
    );

    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) =>
            insertNoticeAudienceMember(tx, fixture, {
              noticeId: seeded.noticeId,
              recipientUserId: fixture.staffCId,
              recipientKind: "STAFF",
            }),
        ),
      "55000",
    );
    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) => tx.$executeRaw`
            UPDATE "AceNoticeAudienceMember"
            SET "recipientUserId" = ${fixture.staffBId}
            WHERE "id" = ${seeded.staffAudienceMemberId}
          `,
        ),
      "55000",
    );
    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) => tx.$executeRaw`
            DELETE FROM "AceNoticeAudienceMember"
            WHERE "id" = ${seeded.guardianAudienceMemberId}
          `,
        ),
      "55000",
    );
    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) => tx.$executeRaw`
            UPDATE "AceNotice"
            SET "publishedAt" = NULL
            WHERE "id" = ${seeded.noticeId}
          `,
        ),
      "55000",
    );
    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) => tx.$executeRaw`
            UPDATE "AceNotice"
            SET "publishedAt" = CURRENT_TIMESTAMP + INTERVAL '1 minute'
            WHERE "id" = ${seeded.noticeId}
          `,
        ),
      "55000",
    );
    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) => tx.$executeRaw`
            UPDATE "AceNotice"
            SET "audience" = 'STAFF'::"AceNoticeAudience"
            WHERE "id" = ${seeded.noticeId}
          `,
        ),
      "55000",
    );

    const audienceCount = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        await tx.$executeRaw`
          UPDATE "GuardianChildRelationship"
          SET "endedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${fixture.guardianARelationshipId}
        `;
        await tx.siteMembership.delete({
          where: {
            tenantId_userId: {
              tenantId: fixture.tenantAId,
              userId: fixture.staffAId,
            },
          },
        });
        const [audienceCount] = await tx.$queryRaw<Array<{ count: number }>>`
        SELECT count(*)::int AS "count" FROM "AceNoticeAudienceMember"
        WHERE "noticeId" = ${seeded.noticeId}
      `;
        await setNoticeReceiptState(tx, seeded.receiptId, new Date(), null);
        await setNoticeReceiptState(tx, seeded.receiptId, new Date(), new Date());
        return audienceCount.count;
      },
    );

    expect(audienceCount).toBe(2);
    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          setNoticeReceiptState(tx, seeded.receiptId, new Date(), null),
        ),
      "23514",
    );
  });

  it("serializes draft audience inserts before publication", async () => {
    if (!isDatabaseAvailable()) return;

    const noticeId = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => insertNotice(tx, fixture),
    );
    let releaseAudienceMutation: (() => void) | undefined;
    const audienceMutationCanCommit = new Promise<void>((resolve) => {
      releaseAudienceMutation = resolve;
    });
    let audienceMutationStarted: (() => void) | undefined;
    const audienceMutationInserted = new Promise<void>((resolve) => {
      audienceMutationStarted = resolve;
    });
    const audienceMutation = withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        const audienceMemberId = await insertNoticeAudienceMember(tx, fixture, {
          noticeId,
          recipientUserId: fixture.staffCId,
          recipientKind: "STAFF",
        });
        audienceMutationStarted?.();
        await audienceMutationCanCommit;
        return audienceMemberId;
      },
    );

    let publicationDispatchStarted: (() => void) | undefined;
    const publicationDispatchStartedPromise = new Promise<void>((resolve) => {
      publicationDispatchStarted = resolve;
    });
    let publication: Promise<void> | undefined;
    try {
      await Promise.race([
        audienceMutationInserted,
        audienceMutation.then(() => {
          throw new Error(
            "Audience mutation transaction ended before it could be held open",
          );
        }),
      ]);
      publication = withMessagingRlsContext(
        fixture.tenantAId,
        fixture.orgAId,
        async (tx) => {
          publicationDispatchStarted?.();
          await publishNotice(tx, noticeId);
        },
      );
      await Promise.race([
        publicationDispatchStartedPromise,
        publication.then(() => {
          throw new Error(
            "Publication transaction ended before publish was dispatched",
          );
        }),
      ]);
      const publicationBeforeAudienceCommit = await Promise.race([
        publication.then(
          () => "resolved" as const,
          () => "rejected" as const,
        ),
        new Promise<"pending">((resolve) => {
          setTimeout(() => resolve("pending"), CONCURRENT_PUBLICATION_WAIT_MS);
        }),
      ]);

      releaseAudienceMutation?.();
      await audienceMutation;
      await publication;
      const [notice] = await withMessagingRlsContext(
        fixture.tenantAId,
        fixture.orgAId,
        (tx) =>
          tx.$queryRaw<
            Array<{
              audienceMemberCount: number;
              publishedAt: Date | null;
            }>
          >`
            SELECT
              notice."publishedAt",
              count(audience_member."id")::int AS "audienceMemberCount"
            FROM "AceNotice" notice
            LEFT JOIN "AceNoticeAudienceMember" audience_member
              ON audience_member."noticeId" = notice."id"
            WHERE notice."id" = ${noticeId}
            GROUP BY notice."id", notice."publishedAt"
          `,
      );

      expect(notice).toEqual({
        audienceMemberCount: 1,
        publishedAt: expect.any(Date),
      });
      expect(publicationBeforeAudienceCommit).toBe("pending");
    } finally {
      releaseAudienceMutation?.();
      await Promise.allSettled(
        publication ? [audienceMutation, publication] : [audienceMutation],
      );
    }
  });

  it("revalidates a committed guardian audience snapshot before publication", async () => {
    if (!isDatabaseAvailable()) return;

    const noticeId = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => insertNotice(tx, fixture),
    );
    let releaseGuardianAudienceMutation: (() => void) | undefined;
    const guardianAudienceMutationCanCommit = new Promise<void>((resolve) => {
      releaseGuardianAudienceMutation = resolve;
    });
    let guardianAudienceMutationStarted: (() => void) | undefined;
    const guardianAudienceMutationInserted = new Promise<void>((resolve) => {
      guardianAudienceMutationStarted = resolve;
    });
    const guardianAudienceMutation = withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        await insertNoticeAudienceMember(tx, fixture, {
          noticeId,
          recipientUserId: fixture.guardianAUserId,
          recipientKind: "GUARDIAN",
          guardianIdentityId: fixture.guardianAIdentityId,
        });
        guardianAudienceMutationStarted?.();
        await guardianAudienceMutationCanCommit;
      },
    );

    let publicationDispatchStarted: (() => void) | undefined;
    const publicationDispatchStartedPromise = new Promise<void>((resolve) => {
      publicationDispatchStarted = resolve;
    });
    let publication: Promise<void> | undefined;
    try {
      await Promise.race([
        guardianAudienceMutationInserted,
        guardianAudienceMutation.then(() => {
          throw new Error(
            "Guardian audience mutation transaction ended before it could be held open",
          );
        }),
      ]);
      publication = withMessagingRlsContext(
        fixture.tenantAId,
        fixture.orgAId,
        async (tx) => {
          publicationDispatchStarted?.();
          await publishNotice(tx, noticeId);
        },
      );
      await Promise.race([
        publicationDispatchStartedPromise,
        publication.then(() => {
          throw new Error(
            "Publication transaction ended before publish was dispatched",
          );
        }),
      ]);
      const publicationBeforeGuardianAudienceCommit = await Promise.race([
        publication.then(
          () => "resolved" as const,
          () => "rejected" as const,
        ),
        new Promise<"pending">((resolve) => {
          setTimeout(() => resolve("pending"), CONCURRENT_PUBLICATION_WAIT_MS);
        }),
      ]);

      await withMessagingRlsContext(
        fixture.tenantAId,
        fixture.orgAId,
        (tx) => tx.$executeRaw`
          UPDATE "GuardianChildRelationship"
          SET "endedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${fixture.guardianARelationshipId}
        `,
      );
      releaseGuardianAudienceMutation?.();
      await guardianAudienceMutation;

      expect(publicationBeforeGuardianAudienceCommit).toBe("pending");
      const publicationTransaction = publication;
      if (!publicationTransaction) {
        throw new Error("Publication transaction did not start");
      }
      await expectDatabaseRejection(() => publicationTransaction, "23514");

      const [notice] = await withMessagingRlsContext(
        fixture.tenantAId,
        fixture.orgAId,
        (tx) =>
          tx.$queryRaw<Array<{ publishedAt: Date | null }>>`
            SELECT "publishedAt"
            FROM "AceNotice"
            WHERE "id" = ${noticeId}
          `,
      );
      expect(notice?.publishedAt).toBeNull();
    } finally {
      releaseGuardianAudienceMutation?.();
      await Promise.allSettled(
        publication
          ? [guardianAudienceMutation, publication]
          : [guardianAudienceMutation],
      );
    }
  });

  it("rejects mixed-tenant references throughout the F21 table family", async () => {
    if (!isDatabaseAvailable()) return;

    const tenantBRows = await withMessagingRlsContext(
      fixture.tenantBId,
      fixture.orgBId,
      (tx) => seedTenantBF21References(tx, fixture),
    );

    for (const table of f21TablesWithTenantLocalReferences) {
      await expectDatabaseRejection(
        () =>
          withMessagingRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
            insertMixedTenantReferenceProbe(tx, fixture, tenantBRows, table),
          ),
        "23503",
      );
    }
  });

  it("fails closed for every F21 table under another tenant and no tenant context", async () => {
    if (!isDatabaseAvailable()) return;
    if (!useTenantRlsRole()) return;

    const tenantARows = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => seedTenantAF21Rows(tx, fixture),
    );
    for (const table of f21Tables) {
      await expect(
        countRowsAsTenant(table, fixture.tenantBId, fixture),
      ).resolves.toBe(0);
      await expectDatabaseRejection(
        () =>
          withMessagingRlsContext(fixture.tenantBId, fixture.orgBId, (tx) =>
            insertTenantAWriteProbe(tx, fixture, tenantARows, table),
          ),
        "42501",
      );
    }
    for (const table of f21Tables) {
      await expect(countRowsWithoutTenant(table)).resolves.toBe(0);
      await expectDatabaseRejection(
        () =>
          withNoTenantRlsContext((tx) =>
            insertTenantAWriteProbe(tx, fixture, tenantARows, table),
          ),
        "42501",
      );
    }
  });
});
