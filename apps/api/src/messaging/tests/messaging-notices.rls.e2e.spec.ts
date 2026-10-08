import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
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
import { MessagingService } from "../messaging.service";
import { MessagingConversationService } from "../messaging-conversation.service";
import { MessagingCommandService } from "../messaging-command.service";
import { ParentMessagingHistoryService } from "../parent-messaging-history.service";
import { ParentMessagingConversationService } from "../parent-messaging-conversation.service";
import { ParentMessagingCommandService } from "../parent-messaging-command.service";
import { ParentMessagingReadCursorService } from "../parent-messaging-read-cursor.service";
import { ParentMessagingService } from "../parent-messaging.service";
import { StaffSchoolTeamHistoryService } from "../staff-school-team-history.service";
import { StaffSchoolTeamReadCursorService } from "../staff-school-team-read-cursor.service";
import { StaffSchoolTeamCommandService } from "../staff-school-team-command.service";
import { StaffSchoolTeamService } from "../staff-school-team.service";

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
  tenantBOnlyUserId: string;
  studentUserId: string;
  dualIdentityUserId: string;
  childAId: string;
  childBId: string;
  dualIdentityChildId: string;
  guardianAIdentityId: string;
  guardianBIdentityId: string;
  guardianBTenantBIdentityId: string;
  dualGuardianIdentityId: string;
  guardianARelationshipId: string;
  guardianBRelationshipId: string;
  dualGuardianRelationshipId: string;
  studentIdentityId: string;
  studentIdentityLinkId: string;
  dualStudentIdentityId: string;
  dualStudentIdentityLinkId: string;
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
  postgresCode: string | readonly string[],
): Promise<void> {
  const expectedPostgresCode = Array.isArray(postgresCode)
    ? expect.stringMatching(new RegExp(`^(?:${postgresCode.join("|")})$`))
    : postgresCode;

  await expect(operation()).rejects.toMatchObject({
    code: "P2010",
    meta: { code: expectedPostgresCode },
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
  options: { createdByUserId?: string } = {},
): Promise<string> {
  const id = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "AceNotice" (
      "id", "tenantId", "createdByUserId", "title", "body", "audience", "publishedAt"
    ) VALUES (
      ${id}, ${fixture.tenantAId}, ${options.createdByUserId ?? fixture.staffAId}, 'Transport update',
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
  await insertNoticeAttachment(tx, fixture, noticeId);
  await publishNotice(tx, noticeId);
  await insertNoticeReceipt(tx, fixture, audienceMemberId);
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
      tenantBOnlyUserId: randomUUID(),
      studentUserId: randomUUID(),
      dualIdentityUserId: randomUUID(),
      childAId: randomUUID(),
      childBId: randomUUID(),
      dualIdentityChildId: randomUUID(),
      guardianAIdentityId: randomUUID(),
      guardianBIdentityId: randomUUID(),
      guardianBTenantBIdentityId: randomUUID(),
      dualGuardianIdentityId: randomUUID(),
      guardianARelationshipId: randomUUID(),
      guardianBRelationshipId: randomUUID(),
      dualGuardianRelationshipId: randomUUID(),
      studentIdentityId: randomUUID(),
      studentIdentityLinkId: randomUUID(),
      dualStudentIdentityId: randomUUID(),
      dualStudentIdentityLinkId: randomUUID(),
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
    // Fixture setup uses the bootstrap connection so it can create membership
    // records. Assertions below switch to the non-bypass tenant role.
    await withTenantRlsContext(
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
            fixture.dualIdentityUserId,
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
        await tx.child.create({
          data: {
            id: fixture.dualIdentityChildId,
            firstName: "Messaging",
            lastName: "Dual Identity Child",
            tenantId: fixture.tenantAId,
          },
        });
        await tx.$executeRaw`
        INSERT INTO "GuardianIdentity" ("id", "tenantId", "userId")
        VALUES
          (${fixture.guardianAIdentityId}, ${fixture.tenantAId}, ${fixture.guardianAUserId}),
          (${fixture.guardianBIdentityId}, ${fixture.tenantAId}, ${fixture.guardianBUserId}),
          (${fixture.dualGuardianIdentityId}, ${fixture.tenantAId}, ${fixture.dualIdentityUserId})
      `;
        await tx.$executeRaw`
        INSERT INTO "GuardianChildRelationship" (
          "id", "tenantId", "guardianIdentityId", "childId", "legalAccess"
        ) VALUES
          (
            ${fixture.guardianARelationshipId}, ${fixture.tenantAId},
            ${fixture.guardianAIdentityId}, ${fixture.childAId}, 'FULL'::"GuardianLegalAccess"
          ),
          (
            ${fixture.dualGuardianRelationshipId}, ${fixture.tenantAId},
            ${fixture.dualGuardianIdentityId}, ${fixture.dualIdentityChildId}, 'FULL'::"GuardianLegalAccess"
          )
      `;
        await tx.$executeRaw`
        INSERT INTO "StudentPortalPolicy" ("tenantId", "studentPortalEnabled")
        VALUES (${fixture.tenantAId}, true)
      `;
        await tx.$executeRaw`
        INSERT INTO "StudentIdentity" ("id", "tenantId", "userId")
        VALUES
          (${fixture.studentIdentityId}, ${fixture.tenantAId}, ${fixture.studentUserId}),
          (${fixture.dualStudentIdentityId}, ${fixture.tenantAId}, ${fixture.dualIdentityUserId})
      `;
        await tx.$executeRaw`
        INSERT INTO "StudentIdentityLink" (
          "id", "tenantId", "studentIdentityId", "childId"
        ) VALUES
          (
            ${fixture.studentIdentityLinkId}, ${fixture.tenantAId},
            ${fixture.studentIdentityId}, ${fixture.childAId}
          ),
          (
            ${fixture.dualStudentIdentityLinkId}, ${fixture.tenantAId},
            ${fixture.dualStudentIdentityId}, ${fixture.dualIdentityChildId}
          )
      `;
      },
    );
    await withTenantRlsContext(
      fixture.tenantBId,
      fixture.orgBId,
      async (tx) => {
        await tx.user.create({
          data: {
            id: fixture.tenantBOnlyUserId,
            email: `${fixture.tenantBOnlyUserId}@example.test`,
            tenantId: fixture.tenantBId,
          },
        });
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
    await prisma.auditEvent.deleteMany({
      where: { orgId: fixture.orgAId, entityType: "ACE_MESSAGE" },
    });
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
      where: {
        id: {
          in: [
            fixture.studentIdentityLinkId,
            fixture.dualStudentIdentityLinkId,
          ],
        },
      },
    });
    await prisma.studentIdentity.deleteMany({
      where: {
        id: {
          in: [fixture.studentIdentityId, fixture.dualStudentIdentityId],
        },
      },
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
            fixture.dualGuardianRelationshipId,
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
            fixture.dualGuardianIdentityId,
          ],
        },
      },
    });
    await prisma.child.deleteMany({
      where: {
        id: {
          in: [fixture.childAId, fixture.childBId, fixture.dualIdentityChildId],
        },
      },
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
            fixture.tenantBOnlyUserId,
            fixture.studentUserId,
            fixture.dualIdentityUserId,
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

  it("reads only joined staff conversations and their messages through the query service", async () => {
    if (!isDatabaseAvailable()) return;

    const created = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        const conversation = await createStaffConversation(
          tx,
          fixture,
          "STAFF_DIRECT",
        );
        await tx.message.create({
          data: {
            tenantId: fixture.tenantAId,
            conversationId: conversation.conversationId,
            senderParticipantId: conversation.staffParticipantIds[0],
            clientRequestId: randomUUID(),
            bodyEncrypted: "Staff-only update",
          },
        });
        return conversation;
      },
    );
    const service = new MessagingService();
    const joined = {
      tenantId: fixture.tenantAId,
      orgId: fixture.orgAId,
      userId: fixture.staffAId,
    };
    const unjoined = { ...joined, userId: fixture.staffCId };

    const list = await service.listStaffConversations(joined, {});
    expect(list.items.map((item) => item.id)).toContain(created.conversationId);
    expect(
      list.items.find((item) => item.id === created.conversationId)
        ?.latestMessage?.preview,
    ).toBe("Staff-only update");
    const page = await service.listStaffMessages(
      joined,
      created.conversationId,
      {},
    );
    expect(page.items.map((item) => item.body)).toEqual(["Staff-only update"]);
    expect((await service.listStaffConversations(unjoined, {})).items).toEqual(
      [],
    );
    await expect(
      service.listStaffMessages(unjoined, created.conversationId, {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("opens one audited direct conversation for two current site staff", async () => {
    if (!isDatabaseAvailable()) return;

    const service = new MessagingConversationService();
    const actor = {
      tenantId: fixture.tenantAId,
      orgId: fixture.orgAId,
      userId: fixture.staffAId,
    };
    const reverseActor = { ...actor, userId: fixture.staffBId };
    const [first, second] = await Promise.all([
      service.openStaffDirect(actor, {
        kind: "STAFF_DIRECT",
        recipientUserId: fixture.staffBId,
      }),
      service.openStaffDirect(reverseActor, {
        kind: "STAFF_DIRECT",
        recipientUserId: fixture.staffAId,
      }),
    ]);

    expect(first.id).toBe(second.id);
    expect([first.created, second.created].sort()).toEqual([false, true]);
    const conversation = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        tx.messageConversation.findUnique({
          where: { id: first.id },
          select: {
            participants: { select: { userId: true } },
          },
        }),
    );
    expect(
      conversation?.participants.map((item) => item.userId).sort(),
    ).toEqual([fixture.staffAId, fixture.staffBId].sort());
    expect(
      await prisma.auditEvent.count({
        where: {
          orgId: fixture.orgAId,
          entityType: "ACE_MESSAGE",
          entityId: first.id,
          action: "CREATED",
        },
      }),
    ).toBe(1);

    await expect(
      service.openStaffDirect(actor, {
        kind: "STAFF_DIRECT",
        recipientUserId: fixture.studentUserId,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.openStaffDirect(actor, {
        kind: "STAFF_DIRECT",
        recipientUserId: fixture.tenantBOnlyUserId,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("opens one site staff room and reconciles current participants", async () => {
    if (!isDatabaseAvailable()) return;

    const service = new MessagingConversationService();
    const actor = {
      tenantId: fixture.tenantAId,
      orgId: fixture.orgAId,
      userId: fixture.staffAId,
    };
    const staffB = { ...actor, userId: fixture.staffBId };
    const [first, second] = await Promise.all([
      service.openStaffRoom(actor),
      service.openStaffRoom(staffB),
    ]);
    expect(first.id).toBe(second.id);
    expect([first.created, second.created].sort()).toEqual([false, true]);

    const activeParticipants = () =>
      withMessagingRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
        tx.messageParticipant.findMany({
          where: {
            tenantId: fixture.tenantAId,
            conversationId: first.id,
            removedAt: null,
          },
          select: { userId: true },
          orderBy: { userId: "asc" },
        }),
      );
    expect((await activeParticipants()).map((item) => item.userId)).toEqual(
      [fixture.staffAId, fixture.staffBId, fixture.staffCId].sort(),
    );
    expect(
      await prisma.auditEvent.count({
        where: {
          orgId: fixture.orgAId,
          entityType: "ACE_MESSAGE",
          entityId: first.id,
          action: "CREATED",
        },
      }),
    ).toBe(1);

    await withTenantRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
      tx.siteMembership.delete({
        where: {
          tenantId_userId: {
            tenantId: fixture.tenantAId,
            userId: fixture.staffCId,
          },
        },
      }),
    );
    await expect(service.openStaffRoom(actor)).resolves.toEqual({
      id: first.id,
      kind: "STAFF_ROOM",
      created: false,
    });
    expect((await activeParticipants()).map((item) => item.userId)).toEqual(
      [fixture.staffAId, fixture.staffBId].sort(),
    );
    await expect(
      service.openStaffRoom({ ...actor, userId: fixture.staffCId }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      new MessagingCommandService().sendStaffMessage(actor, first.id, {
        clientRequestId: randomUUID(),
        body: "Current team only",
      }),
    ).resolves.toMatchObject({ conversationId: first.id, reused: false });

    await withTenantRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
      tx.siteMembership.create({
        data: { tenantId: fixture.tenantAId, userId: fixture.staffCId },
      }),
    );
    await service.openStaffRoom(actor);
    expect((await activeParticipants()).map((item) => item.userId)).toEqual(
      [fixture.staffAId, fixture.staffBId, fixture.staffCId].sort(),
    );
    expect(
      await prisma.auditEvent.count({
        where: {
          orgId: fixture.orgAId,
          entityType: "ACE_MESSAGE",
          entityId: first.id,
          action: "UPDATED",
        },
      }),
    ).toBe(2);

    await expect(
      service.openStaffRoom({
        tenantId: fixture.tenantBId,
        orgId: fixture.orgBId,
        userId: fixture.staffCId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.openStaffRoom({ ...actor, userId: fixture.studentUserId }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("discovers only eligible same-site staff through the tenant query", async () => {
    if (!isDatabaseAvailable()) return;

    const candidates = [
      fixture.staffAId,
      fixture.staffBId,
      fixture.studentUserId,
      fixture.tenantBOnlyUserId,
    ];
    try {
      await prisma.user.updateMany({
        where: { id: { in: candidates } },
        data: { displayName: "Recipient search match" },
      });
      const result =
        await new MessagingConversationService().listStaffRecipients(
          {
            tenantId: fixture.tenantAId,
            orgId: fixture.orgAId,
            userId: fixture.staffAId,
          },
          { search: "Recipient search" },
        );

      expect(result).toEqual({
        items: [
          { id: fixture.staffBId, displayName: "Recipient search match" },
        ],
        hasMore: false,
      });
    } finally {
      await prisma.user.updateMany({
        where: { id: { in: candidates } },
        data: { displayName: null },
      });
    }
  });

  it("sends one encrypted, audited message with one delivery across concurrent retries", async () => {
    if (!isDatabaseAvailable()) return;

    const actor = {
      tenantId: fixture.tenantAId,
      orgId: fixture.orgAId,
      userId: fixture.staffAId,
    };
    const opened = await new MessagingConversationService().openStaffDirect(
      actor,
      {
        kind: "STAFF_DIRECT",
        recipientUserId: fixture.staffBId,
      },
    );
    const service = new MessagingCommandService();
    const input = {
      clientRequestId: randomUUID(),
      body: "A private staff update",
    };
    const [first, second] = await Promise.all([
      service.sendStaffMessage(actor, opened.id, input),
      service.sendStaffMessage(actor, opened.id, input),
    ]);
    expect(first.id).toBe(second.id);
    expect(first.sequence).toBe(1);
    expect([first.reused, second.reused].sort()).toEqual([false, true]);

    const evidence = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        const [messages, deliveries, raw] = await Promise.all([
          tx.message.findMany({ where: { conversationId: opened.id } }),
          tx.messageDelivery.findMany({ where: { messageId: first.id } }),
          tx.$queryRaw<Array<{ bodyEncrypted: string }>>`
            SELECT "bodyEncrypted" FROM "Message" WHERE "id" = ${first.id}
          `,
        ]);
        return { messages, deliveries, raw };
      },
    );
    expect(evidence.messages).toHaveLength(1);
    expect(evidence.messages[0].bodyEncrypted).toBe(input.body);
    expect(evidence.raw[0].bodyEncrypted).toMatch(/^v1:/);
    expect(evidence.deliveries).toHaveLength(1);
    expect(evidence.deliveries[0].status).toBe("PENDING");
    expect(
      await prisma.auditEvent.count({
        where: {
          orgId: fixture.orgAId,
          entityType: "ACE_MESSAGE",
          entityId: first.id,
          action: "CREATED",
        },
      }),
    ).toBe(1);
    expect(
      (await new MessagingService().listStaffConversations(actor, {})).items[0]
        .latestMessage?.preview,
    ).toBe(input.body);
    await expect(
      service.sendStaffMessage(
        { ...actor, userId: fixture.staffCId },
        opened.id,
        { ...input, clientRequestId: randomUUID() },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.sendStaffMessage(
        {
          tenantId: fixture.tenantBId,
          orgId: fixture.orgBId,
          userId: fixture.staffCId,
        },
        opened.id,
        { ...input, clientRequestId: randomUUID() },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("allocates ordered staff-room sequences for distinct concurrent sends", async () => {
    if (!isDatabaseAvailable()) return;

    const actor = {
      tenantId: fixture.tenantAId,
      orgId: fixture.orgAId,
      userId: fixture.staffAId,
    };
    const room = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => createStaffConversation(tx, fixture, "STAFF_ROOM"),
    );
    const service = new MessagingCommandService();
    const results = await Promise.all(
      ["First room update", "Second room update"].map((body) =>
        service.sendStaffMessage(actor, room.conversationId, {
          clientRequestId: randomUUID(),
          body,
        }),
      ),
    );
    expect(results.map((item) => item.sequence).sort()).toEqual([1, 2]);
    expect(results.every((item) => !item.reused)).toBe(true);
    const roomState = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => ({
        deliveries: await tx.messageDelivery.count({
          where: { messageId: { in: results.map((item) => item.id) } },
        }),
        conversation: await tx.messageConversation.findUnique({
          where: { id: room.conversationId },
          select: { lastMessageSequence: true, updatedAt: true },
        }),
      }),
    );
    expect(roomState.deliveries).toBe(2);
    expect(roomState.conversation?.lastMessageSequence).toBe(2);
    expect(roomState.conversation?.updatedAt.getTime()).toBeGreaterThanOrEqual(
      Math.max(...results.map((item) => new Date(item.createdAt).getTime())),
    );
    const latest = results.find((item) => item.sequence === 2);
    const list = await new MessagingService().listStaffConversations(actor, {});
    expect(
      list.items.find((item) => item.id === room.conversationId)?.latestMessage
        ?.preview,
    ).toBe(latest?.body);
  });

  it("counts only received messages after the caller's read cursor", async () => {
    if (!isDatabaseAvailable()) return;

    const staffA = {
      tenantId: fixture.tenantAId,
      orgId: fixture.orgAId,
      userId: fixture.staffAId,
    };
    const staffB = { ...staffA, userId: fixture.staffBId };
    const opened = await new MessagingConversationService().openStaffDirect(
      staffA,
      { kind: "STAFF_DIRECT", recipientUserId: fixture.staffBId },
    );
    const command = new MessagingCommandService();
    const own = await command.sendStaffMessage(staffA, opened.id, {
      clientRequestId: randomUUID(),
      body: "Own message",
    });
    const received = await command.sendStaffMessage(staffB, opened.id, {
      clientRequestId: randomUUID(),
      body: "Reply",
    });
    const service = new MessagingService();
    const unread = async (actor: typeof staffA) =>
      (await service.listStaffConversations(actor, {})).items.find(
        (item) => item.id === opened.id,
      )?.unreadCount;

    expect(await unread(staffA)).toBe(1);
    expect(await unread(staffB)).toBe(1);
    await service.advanceStaffReadCursor(staffA, opened.id, {
      sequence: received.sequence,
    });
    expect(await unread(staffA)).toBe(0);
    expect(await unread(staffB)).toBe(1);

    await command.sendStaffMessage(staffB, opened.id, {
      clientRequestId: randomUUID(),
      body: "Another reply",
    });
    expect(await unread(staffA)).toBe(1);
    expect(own.sequence).toBeLessThan(received.sequence);
    expect(
      (
        await service.listStaffConversations(
          { ...staffA, userId: fixture.staffCId },
          {},
        )
      ).items.find((item) => item.id === opened.id),
    ).toBeUndefined();
  });

  it("reveals direct read state only to a current participant for their own messages", async () => {
    if (!isDatabaseAvailable()) return;

    const staffA = {
      tenantId: fixture.tenantAId,
      orgId: fixture.orgAId,
      userId: fixture.staffAId,
    };
    const staffB = { ...staffA, userId: fixture.staffBId };
    const opened = await new MessagingConversationService().openStaffDirect(
      staffA,
      { kind: "STAFF_DIRECT", recipientUserId: fixture.staffBId },
    );
    const command = new MessagingCommandService();
    const first = await command.sendStaffMessage(staffA, opened.id, {
      clientRequestId: randomUUID(),
      body: "Please review this",
    });
    const service = new MessagingService();

    expect(
      (await service.listStaffMessages(staffA, opened.id, {})).items[0],
    ).toMatchObject({ id: first.id, recipientRead: false });
    expect(
      (await service.listStaffMessages(staffB, opened.id, {})).items[0],
    ).toMatchObject({ id: first.id, recipientRead: null });

    await service.advanceStaffReadCursor(staffB, opened.id, {
      sequence: first.sequence,
    });
    expect(
      (await service.listStaffMessages(staffA, opened.id, {})).items[0],
    ).toMatchObject({ id: first.id, recipientRead: true });

    const second = await command.sendStaffMessage(staffA, opened.id, {
      clientRequestId: randomUUID(),
      body: "A later update",
    });
    expect(
      (await service.listStaffMessages(staffA, opened.id, {})).items.map(
        (message) => [message.id, message.recipientRead],
      ),
    ).toEqual([
      [second.id, false],
      [first.id, true],
    ]);
    await expect(
      service.listStaffMessages(
        { ...staffA, userId: fixture.staffCId },
        opened.id,
        {},
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    const room = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => createStaffConversation(tx, fixture, "STAFF_ROOM"),
    );
    await command.sendStaffMessage(staffA, room.conversationId, {
      clientRequestId: randomUUID(),
      body: "Room update",
    });
    expect(
      (await service.listStaffMessages(staffA, room.conversationId, {}))
        .items[0].recipientRead,
    ).toBeNull();
  });

  it("advances only an active staff participant's read cursor without regression", async () => {
    if (!isDatabaseAvailable()) return;

    const created = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        const conversation = await createStaffConversation(
          tx,
          fixture,
          "STAFF_DIRECT",
        );
        const messages = [];
        for (const body of ["First", "Second"]) {
          messages.push(
            await tx.message.create({
              data: {
                tenantId: fixture.tenantAId,
                conversationId: conversation.conversationId,
                senderParticipantId: conversation.staffParticipantIds[0],
                clientRequestId: randomUUID(),
                bodyEncrypted: body,
              },
            }),
          );
        }
        return { ...conversation, messages };
      },
    );
    const service = new MessagingService();
    const actor = {
      tenantId: fixture.tenantAId,
      orgId: fixture.orgAId,
      userId: fixture.staffAId,
    };
    const [first, second] = created.messages;

    await expect(
      service.advanceStaffReadCursor(actor, created.conversationId, {
        sequence: second.sequence,
      }),
    ).resolves.toEqual({ lastReadSequence: second.sequence });
    await expect(
      service.advanceStaffReadCursor(actor, created.conversationId, {
        sequence: first.sequence,
      }),
    ).resolves.toEqual({ lastReadSequence: second.sequence });
    await expect(
      service.advanceStaffReadCursor(actor, created.conversationId, {
        sequence: second.sequence + 1,
      }),
    ).rejects.toThrow("Message sequence not found");
    await expect(
      service.advanceStaffReadCursor(
        { ...actor, userId: fixture.staffCId },
        created.conversationId,
        { sequence: first.sequence },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    const cursors = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        tx.messageParticipantReadCursor.findMany({
          where: { conversationId: created.conversationId },
          select: { participantId: true, lastReadSequence: true },
        }),
    );
    expect(cursors).toEqual([
      {
        participantId: created.staffParticipantIds[0],
        lastReadSequence: second.sequence,
      },
    ]);
  });

  it("permits one general parent conversation per guardian and valid staff conversation kinds", async () => {
    if (!isDatabaseAvailable()) return;

    const parentConversation = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        const parent = await createParentStaffConversation(tx, fixture);
        await tx.message.create({
          data: {
            tenantId: fixture.tenantAId,
            conversationId: parent.conversationId,
            senderParticipantId: parent.staffParticipantIds[0],
            clientRequestId: randomUUID(),
            bodyEncrypted: "School team update",
          },
        });
        await createStaffConversation(tx, fixture, "STAFF_DIRECT");
        const staffRoom = await createStaffConversation(
          tx,
          fixture,
          "STAFF_ROOM",
        );
        return { ...parent, staffRoomId: staffRoom.conversationId };
      },
    );
    const service = new ParentMessagingService();
    const parentList = await service.list(
      fixture.tenantAId,
      fixture.guardianAUserId,
    );
    expect(parentList).toMatchObject({
      items: [
        {
          id: parentConversation.conversationId,
          kind: "PARENT_STAFF",
          title: "School team",
          latestMessage: { preview: "School team update" },
          unreadCount: 1,
        },
      ],
      nextCursor: null,
    });
    const history = new ParentMessagingHistoryService();
    await expect(
      history.list(
        fixture.tenantAId,
        fixture.guardianAUserId,
        parentConversation.conversationId,
        { limit: 1 },
      ),
    ).resolves.toMatchObject({
      items: [
        {
          body: "School team update",
          sender: { id: fixture.staffAId },
        },
      ],
      nextBefore: null,
    });
    await expect(
      history.list(
        fixture.tenantAId,
        fixture.guardianAUserId,
        parentConversation.staffRoomId,
        {},
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    const guardianParticipantId = parentConversation.guardianParticipantId;
    if (!guardianParticipantId) throw new Error("Missing guardian participant");
    const guardianCursor = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        tx.messageParticipantReadCursor.findUnique({
          where: {
            tenantId_conversationId_participantId: {
              tenantId: fixture.tenantAId,
              conversationId: parentConversation.conversationId,
              participantId: guardianParticipantId,
            },
          },
        }),
    );
    expect(guardianCursor).toBeNull();
    const linkedGuardianB = await prisma.guardianChildRelationship.create({
      data: {
        tenantId: fixture.tenantAId,
        guardianIdentityId: fixture.guardianBIdentityId,
        childId: fixture.childAId,
        legalAccess: "FULL",
      },
    });
    try {
      expect(
        (await service.list(fixture.tenantAId, fixture.guardianBUserId)).items,
      ).toEqual([]);
      await prisma.guardianChildRelationship.update({
        where: { id: linkedGuardianB.id },
        data: { endedAt: new Date() },
      });
      await expect(
        service.list(fixture.tenantAId, fixture.guardianBUserId),
      ).rejects.toBeInstanceOf(NotFoundException);
    } finally {
      await prisma.guardianChildRelationship.delete({
        where: { id: linkedGuardianB.id },
      });
    }
    for (const userId of [fixture.staffAId, fixture.studentUserId]) {
      await expect(
        service.list(fixture.tenantAId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        history.list(
          fixture.tenantAId,
          userId,
          parentConversation.conversationId,
          {},
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    }
    await expect(
      service.list(fixture.tenantBId, fixture.guardianAUserId),
    ).rejects.toBeInstanceOf(NotFoundException);
    await prisma.org.update({
      where: { id: fixture.orgAId },
      data: { parentPortalEnabled: false },
    });
    try {
      await expect(
        service.list(fixture.tenantAId, fixture.guardianAUserId),
      ).rejects.toBeInstanceOf(NotFoundException);
    } finally {
      await prisma.org.update({
        where: { id: fixture.orgAId },
        data: { parentPortalEnabled: true },
      });
    }
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

  it("advances only a current parent's own school-team cursor to an existing sequence", async () => {
    if (!isDatabaseAvailable()) return;

    const created = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        const conversation = await createParentStaffConversation(tx, fixture);
        const messages = [];
        for (const body of ["First update", "Second update"]) {
          messages.push(
            await tx.message.create({
              data: {
                tenantId: fixture.tenantAId,
                conversationId: conversation.conversationId,
                senderParticipantId: conversation.staffParticipantIds[0],
                clientRequestId: randomUUID(),
                bodyEncrypted: body,
              },
            }),
          );
        }
        return { ...conversation, messages };
      },
    );
    const [first, second] = created.messages;
    const cursor = new ParentMessagingReadCursorService();
    const list = new ParentMessagingService();
    const advance = (
      userId: string,
      conversationId: string,
      sequence: number,
    ) =>
      cursor.advance(fixture.tenantAId, userId, conversationId, { sequence });

    expect(
      (await list.list(fixture.tenantAId, fixture.guardianAUserId)).items[0]
        .unreadCount,
    ).toBe(2);
    await expect(
      advance(fixture.guardianAUserId, created.conversationId, second.sequence),
    ).resolves.toEqual({ lastReadSequence: second.sequence });
    await expect(
      advance(fixture.guardianAUserId, created.conversationId, first.sequence),
    ).resolves.toEqual({ lastReadSequence: second.sequence });
    expect(
      (await list.list(fixture.tenantAId, fixture.guardianAUserId)).items[0]
        .unreadCount,
    ).toBe(0);
    await expect(
      advance(
        fixture.guardianAUserId,
        created.conversationId,
        second.sequence + 1,
      ),
    ).rejects.toThrow("Message sequence not found");
    for (const userId of [
      fixture.guardianBUserId,
      fixture.staffAId,
      fixture.studentUserId,
    ]) {
      await expect(
        advance(userId, created.conversationId, first.sequence),
      ).rejects.toBeInstanceOf(NotFoundException);
    }
    await expect(
      cursor.advance(
        fixture.tenantBId,
        fixture.guardianAUserId,
        created.conversationId,
        { sequence: first.sequence },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    const guardianParticipantId = created.guardianParticipantId;
    if (!guardianParticipantId) throw new Error("Missing guardian participant");
    const cursors = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        tx.messageParticipantReadCursor.findMany({
          where: { conversationId: created.conversationId },
          select: { participantId: true, lastReadSequence: true },
        }),
    );
    expect(cursors).toEqual([
      {
        participantId: guardianParticipantId,
        lastReadSequence: second.sequence,
      },
    ]);
  });

  it("opens one parent school-team thread only with a current tagged site responder", async () => {
    if (!isDatabaseAvailable()) return;

    const expiredGrant = await withTenantRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        tx.accessTagGrant.create({
          data: {
            orgId: fixture.orgAId,
            tenantId: fixture.tenantAId,
            userId: fixture.staffAId,
            tagKey: "PARENT_MESSAGE_RESPONDER",
            grantedById: fixture.staffAId,
            startsAt: new Date(Date.now() - 120_000),
            expiresAt: new Date(Date.now() - 60_000),
          },
        }),
    );
    let activeGrantId: string | null = null;
    const service = new ParentMessagingConversationService();
    const listRecipients = () =>
      service.recipients(fixture.tenantAId, fixture.guardianAUserId, {});
    const open = (recipientUserId: string) =>
      service.open(fixture.tenantAId, fixture.guardianAUserId, {
        recipientUserId,
      });
    try {
      expect(
        (await listRecipients()).items.some(
          (item) => item.id === fixture.staffAId,
        ),
      ).toBe(false);
      await expect(open(fixture.staffAId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await withTenantRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
        tx.accessTagGrant.update({
          where: { id: expiredGrant.id },
          data: { revokedAt: new Date(), revokedById: fixture.staffAId },
        }),
      );
      const activeGrant = await withTenantRlsContext(
        fixture.tenantAId,
        fixture.orgAId,
        (tx) =>
          tx.accessTagGrant.create({
            data: {
              orgId: fixture.orgAId,
              tenantId: fixture.tenantAId,
              userId: fixture.staffAId,
              tagKey: "PARENT_MESSAGE_RESPONDER",
              grantedById: fixture.staffAId,
            },
          }),
      );
      activeGrantId = activeGrant.id;
      expect((await listRecipients()).items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: fixture.staffAId }),
        ]),
      );
      const first = await open(fixture.staffAId);
      expect(first).toMatchObject({ kind: "PARENT_STAFF", created: true });
      await expect(open(fixture.staffAId)).resolves.toEqual({
        id: first.id,
        kind: "PARENT_STAFF",
        created: false,
      });
      await expect(
        service.open(fixture.tenantAId, fixture.guardianBUserId, {
          recipientUserId: fixture.staffAId,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      const participants = await withMessagingRlsContext(
        fixture.tenantAId,
        fixture.orgAId,
        (tx) =>
          tx.messageParticipant.findMany({
            where: { conversationId: first.id, removedAt: null },
            select: { userId: true, kind: true },
          }),
      );
      expect(participants).toEqual(
        expect.arrayContaining([
          { userId: fixture.guardianAUserId, kind: "GUARDIAN" },
          { userId: fixture.staffAId, kind: "STAFF" },
        ]),
      );
      expect(participants).toHaveLength(2);
      await withTenantRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
        tx.accessTagGrant.update({
          where: { id: activeGrant.id },
          data: { revokedAt: new Date(), revokedById: fixture.staffAId },
        }),
      );
      expect(
        (await listRecipients()).items.some(
          (item) => item.id === fixture.staffAId,
        ),
      ).toBe(false);
      await expect(
        service.open(fixture.tenantBId, fixture.guardianAUserId, {
          recipientUserId: fixture.staffAId,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    } finally {
      await prisma.accessTagGrant.deleteMany({
        where: {
          id: {
            in: [expiredGrant.id, ...(activeGrantId ? [activeGrantId] : [])],
          },
        },
      });
    }
  });

  it("lists a parent thread only for its current approved staff responder", async () => {
    if (!isDatabaseAvailable()) return;

    const grant = await withTenantRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        tx.accessTagGrant.create({
          data: {
            orgId: fixture.orgAId,
            tenantId: fixture.tenantAId,
            userId: fixture.staffAId,
            tagKey: "PARENT_MESSAGE_RESPONDER",
            grantedById: fixture.staffAId,
          },
        }),
    );
    const actor = {
      tenantId: fixture.tenantAId,
      orgId: fixture.orgAId,
      userId: fixture.staffAId,
    };
    const service = new StaffSchoolTeamService();
    const history = new StaffSchoolTeamHistoryService();
    const cursor = new StaffSchoolTeamReadCursorService();
    const replies = new StaffSchoolTeamCommandService();
    try {
      const created = await withMessagingRlsContext(
        fixture.tenantAId,
        fixture.orgAId,
        async (tx) => {
          const conversation = await createParentStaffConversation(tx, fixture);
          if (!conversation.guardianParticipantId) {
            throw new Error("Parent conversation fixture lacks a guardian");
          }
          await insertMessage(tx, fixture, {
            conversationId: conversation.conversationId,
            senderParticipantId: conversation.guardianParticipantId,
            clientRequestId: randomUUID(),
            bodyEncrypted: "Please call the family",
          });
          return conversation;
        },
      );

      const listed = await service.list(actor, {});
      expect(listed.items).toEqual([
        expect.objectContaining({
          id: created.conversationId,
          kind: "PARENT_STAFF",
          title: "Parent",
          latestMessage: expect.objectContaining({
            preview: "Please call the family",
          }),
          unreadCount: 1,
        }),
      ]);
      expect(
        (await history.list(actor, created.conversationId, {})).items,
      ).toEqual([
        expect.objectContaining({
          body: "Please call the family",
          sender: expect.objectContaining({ displayName: "Parent" }),
        }),
      ]);
      await expect(
        cursor.advance(actor, created.conversationId, { sequence: 1 }),
      ).resolves.toEqual({ lastReadSequence: 1 });
      expect((await service.list(actor, {})).items[0]?.unreadCount).toBe(0);
      await expect(
        cursor.advance(actor, created.conversationId, { sequence: 2 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      const replyInput = {
        clientRequestId: randomUUID(),
        body: "We will call you today",
      };
      const reply = await replies.send(
        actor,
        created.conversationId,
        replyInput,
      );
      expect(reply).toMatchObject({ sequence: 2, reused: false });
      await expect(
        replies.send(actor, created.conversationId, replyInput),
      ).resolves.toMatchObject({ id: reply.id, reused: true });
      await expect(
        replies.send(actor, created.conversationId, {
          ...replyInput,
          body: "Changed reply",
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(
        (
          await new ParentMessagingService().list(
            fixture.tenantAId,
            fixture.guardianAUserId,
          )
        ).items[0]?.unreadCount,
      ).toBe(1);
      const deliveries = await withMessagingRlsContext(
        fixture.tenantAId,
        fixture.orgAId,
        (tx) =>
          tx.messageDelivery.findMany({
            where: { messageId: reply.id },
            select: { recipientParticipantId: true },
          }),
      );
      expect(deliveries).toEqual([
        { recipientParticipantId: created.guardianParticipantId },
      ]);
      expect(
        (await new MessagingService().listStaffConversations(actor, {})).items,
      ).toEqual([]);
      await expect(
        service.list({ ...actor, userId: fixture.staffBId }, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        history.list(
          { ...actor, userId: fixture.staffBId },
          created.conversationId,
          {},
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        cursor.advance(
          { ...actor, userId: fixture.staffBId },
          created.conversationId,
          { sequence: 1 },
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        replies.send(
          { ...actor, userId: fixture.staffBId },
          created.conversationId,
          { ...replyInput, clientRequestId: randomUUID() },
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.list(
          { ...actor, tenantId: fixture.tenantBId, orgId: fixture.orgBId },
          {},
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        history.list(
          { ...actor, tenantId: fixture.tenantBId, orgId: fixture.orgBId },
          created.conversationId,
          {},
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        cursor.advance(
          { ...actor, tenantId: fixture.tenantBId, orgId: fixture.orgBId },
          created.conversationId,
          { sequence: 1 },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        replies.send(
          { ...actor, tenantId: fixture.tenantBId, orgId: fixture.orgBId },
          created.conversationId,
          { ...replyInput, clientRequestId: randomUUID() },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      await prisma.guardianChildRelationship.update({
        where: { id: fixture.guardianARelationshipId },
        data: { endedAt: new Date() },
      });
      expect((await service.list(actor, {})).items).toEqual([]);
      await expect(
        history.list(actor, created.conversationId, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        cursor.advance(actor, created.conversationId, { sequence: 1 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        replies.send(actor, created.conversationId, {
          ...replyInput,
          clientRequestId: randomUUID(),
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await prisma.guardianChildRelationship.update({
        where: { id: fixture.guardianARelationshipId },
        data: { endedAt: null },
      });

      await prisma.org.update({
        where: { id: fixture.orgAId },
        data: { parentPortalEnabled: false },
      });
      await expect(service.list(actor, {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(
        history.list(actor, created.conversationId, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        cursor.advance(actor, created.conversationId, { sequence: 1 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        replies.send(actor, created.conversationId, {
          ...replyInput,
          clientRequestId: randomUUID(),
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await prisma.org.update({
        where: { id: fixture.orgAId },
        data: { parentPortalEnabled: true },
      });

      await withTenantRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
        tx.accessTagGrant.update({
          where: { id: grant.id },
          data: { revokedAt: new Date(), revokedById: fixture.staffAId },
        }),
      );
      await expect(service.list(actor, {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(
        history.list(actor, created.conversationId, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        cursor.advance(actor, created.conversationId, { sequence: 1 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        replies.send(actor, created.conversationId, {
          ...replyInput,
          clientRequestId: randomUUID(),
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    } finally {
      await prisma.org.update({
        where: { id: fixture.orgAId },
        data: { parentPortalEnabled: true },
      });
      await prisma.accessTagGrant.delete({ where: { id: grant.id } });
    }
  });

  it("sends a linked parent's message only to a current school responder", async () => {
    if (!isDatabaseAvailable()) return;

    const conversation = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => createParentStaffConversation(tx, fixture),
    );
    const grant = await withTenantRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        tx.accessTagGrant.create({
          data: {
            orgId: fixture.orgAId,
            tenantId: fixture.tenantAId,
            userId: fixture.staffAId,
            tagKey: "PARENT_MESSAGE_RESPONDER",
            grantedById: fixture.staffAId,
          },
        }),
    );
    const service = new ParentMessagingCommandService();
    const input = {
      clientRequestId: randomUUID(),
      body: "Could we discuss the trip arrangements?",
    };
    const send = (userId: string, siteId = fixture.tenantAId) =>
      service.send(siteId, userId, conversation.conversationId, input);
    try {
      const sent = await send(fixture.guardianAUserId);
      expect(sent).toMatchObject({ body: input.body, reused: false });
      await expect(send(fixture.guardianAUserId)).resolves.toMatchObject({
        id: sent.id,
        reused: true,
      });
      await expect(send(fixture.guardianBUserId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(
        send(fixture.guardianAUserId, fixture.tenantBId),
      ).rejects.toBeInstanceOf(NotFoundException);

      const rows = await withMessagingRlsContext(
        fixture.tenantAId,
        fixture.orgAId,
        async (tx) => ({
          messages: await tx.message.findMany({
            where: {
              conversationId: conversation.conversationId,
              clientRequestId: input.clientRequestId,
            },
            select: { id: true, sequence: true },
          }),
          deliveries: await tx.messageDelivery.findMany({
            where: { messageId: sent.id },
            select: { recipientParticipantId: true },
          }),
        }),
      );
      expect(rows.messages).toEqual([{ id: sent.id, sequence: sent.sequence }]);
      expect(rows.deliveries).toEqual([
        { recipientParticipantId: conversation.staffParticipantIds[0] },
      ]);

      await withTenantRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
        tx.accessTagGrant.update({
          where: { id: grant.id },
          data: { revokedAt: new Date(), revokedById: fixture.staffAId },
        }),
      );
      await expect(send(fixture.guardianAUserId)).resolves.toMatchObject({
        id: sent.id,
        reused: true,
      });
      await expect(
        service.send(
          fixture.tenantAId,
          fixture.guardianAUserId,
          conversation.conversationId,
          {
            ...input,
            clientRequestId: randomUUID(),
          },
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    } finally {
      await prisma.accessTagGrant.delete({ where: { id: grant.id } });
    }
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

  it("rejects guardian participants that also hold a student identity", async () => {
    if (!isDatabaseAvailable()) return;

    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          async (tx) => {
            const conversationId = await insertConversation(tx, fixture, {
              kind: "PARENT_STAFF",
              guardianIdentityId: fixture.dualGuardianIdentityId,
            });
            await insertParticipant(tx, fixture, {
              conversationId,
              userId: fixture.dualIdentityUserId,
              kind: "GUARDIAN",
              guardianIdentityId: fixture.dualGuardianIdentityId,
            });
            await insertParticipant(tx, fixture, {
              conversationId,
              userId: fixture.staffAId,
              kind: "STAFF",
            });
          },
        ),
      "23514",
    );
  });

  it("keeps message participant authorship bound after messages exist", async () => {
    if (!isDatabaseAvailable()) return;

    const seeded = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        const source = await createParentStaffConversation(tx, fixture);
        await insertParticipant(tx, fixture, {
          conversationId: source.conversationId,
          userId: fixture.staffBId,
          kind: "STAFF",
        });
        const message = await insertMessage(tx, fixture, {
          conversationId: source.conversationId,
          senderParticipantId: source.staffParticipantIds[0],
          clientRequestId: randomUUID(),
        });
        const destinationConversationId = await insertConversation(
          tx,
          fixture,
          {
            kind: "STAFF_ROOM",
          },
        );
        await insertParticipant(tx, fixture, {
          conversationId: destinationConversationId,
          userId: fixture.staffBId,
          kind: "STAFF",
        });
        await insertParticipant(tx, fixture, {
          conversationId: destinationConversationId,
          userId: fixture.staffCId,
          kind: "STAFF",
        });
        return {
          destinationConversationId,
          messageId: message.id,
          sourceConversationId: source.conversationId,
          staffParticipantId: source.staffParticipantIds[0],
        };
      },
    );

    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) =>
            tx.$executeRaw`
            UPDATE "MessageParticipant"
            SET "userId" = ${fixture.staffCId}
            WHERE "id" = ${seeded.staffParticipantId}
          `,
        ),
      "55000",
    );
    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) =>
            tx.$executeRaw`
            UPDATE "MessageParticipant"
            SET "conversationId" = ${seeded.destinationConversationId}
            WHERE "id" = ${seeded.staffParticipantId}
          `,
        ),
      "55000",
    );

    const [author] = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        tx.$queryRaw<
          Array<{
            messageConversationId: string;
            participantConversationId: string;
            participantUserId: string;
            senderParticipantId: string;
          }>
        >`
          SELECT
            message."conversationId" AS "messageConversationId",
            message."senderParticipantId",
            participant."conversationId" AS "participantConversationId",
            participant."userId" AS "participantUserId"
          FROM "Message" message
          INNER JOIN "MessageParticipant" participant
            ON participant."id" = message."senderParticipantId"
          WHERE message."id" = ${seeded.messageId}
        `,
    );
    expect(author).toEqual({
      messageConversationId: seeded.sourceConversationId,
      participantConversationId: seeded.sourceConversationId,
      participantUserId: fixture.staffAId,
      senderParticipantId: seeded.staffParticipantId,
    });
  });

  it("rejects historic conversation reclassification and reassignment", async () => {
    if (!isDatabaseAvailable()) return;

    const seeded = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        const conversation = await createParentStaffConversation(tx, fixture);
        const message = await insertMessage(tx, fixture, {
          conversationId: conversation.conversationId,
          senderParticipantId: conversation.staffParticipantIds[0],
          clientRequestId: randomUUID(),
        });
        return { conversation, message };
      },
    );

    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          async (tx) => {
            await tx.$executeRaw`
              UPDATE "MessageParticipant"
              SET "removedAt" = CURRENT_TIMESTAMP
              WHERE "id" = ${seeded.conversation.guardianParticipantId!}
            `;
            await tx.$executeRaw`
              UPDATE "MessageConversation"
              SET
                "kind" = 'STAFF_ROOM'::"MessageConversationKind",
                "guardianIdentityId" = NULL,
                "createdByUserId" = ${fixture.staffBId}
              WHERE "id" = ${seeded.conversation.conversationId}
            `;
            await insertParticipant(tx, fixture, {
              conversationId: seeded.conversation.conversationId,
              userId: fixture.staffBId,
              kind: "STAFF",
            });
          },
        ),
      "55000",
    );
    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) =>
            tx.$executeRaw`
            UPDATE "MessageConversation"
            SET "tenantId" = ${fixture.tenantBId}
            WHERE "id" = ${seeded.conversation.conversationId}
          `,
        ),
      "55000",
    );

    const [state] = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        tx.$queryRaw<
          Array<{
            createdByUserId: string;
            guardianIdentityId: string | null;
            kind: "PARENT_STAFF" | "STAFF_DIRECT" | "STAFF_ROOM";
            messageConversationId: string;
            senderParticipantId: string;
            tenantId: string;
          }>
        >`
          SELECT
            conversation."tenantId",
            conversation."kind",
            conversation."guardianIdentityId",
            conversation."createdByUserId",
            message."conversationId" AS "messageConversationId",
            message."senderParticipantId"
          FROM "MessageConversation" conversation
          INNER JOIN "Message" message
            ON message."conversationId" = conversation."id"
          WHERE conversation."id" = ${seeded.conversation.conversationId}
            AND message."id" = ${seeded.message.id}
        `,
    );
    expect(state).toEqual({
      createdByUserId: fixture.staffAId,
      guardianIdentityId: fixture.guardianAIdentityId,
      kind: "PARENT_STAFF",
      messageConversationId: seeded.conversation.conversationId,
      senderParticipantId: seeded.conversation.staffParticipantIds[0],
      tenantId: fixture.tenantAId,
    });
  });

  it("requires a tenant-local creator for a conversation", async () => {
    if (!isDatabaseAvailable()) return;

    const conversationId = randomUUID();
    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          async (tx) => {
            await tx.$executeRaw`
              INSERT INTO "MessageConversation" (
                "id", "tenantId", "kind", "guardianIdentityId", "createdByUserId"
              ) VALUES (
                ${conversationId}, ${fixture.tenantAId},
                'STAFF_DIRECT'::"MessageConversationKind", NULL,
                ${fixture.tenantBOnlyUserId}
              )
            `;
            await insertParticipant(tx, fixture, {
              conversationId,
              userId: fixture.staffAId,
              kind: "STAFF",
            });
            await insertParticipant(tx, fixture, {
              conversationId,
              userId: fixture.staffBId,
              kind: "STAFF",
            });
          },
        ),
      "23514",
    );
    const [row] = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        tx.$queryRaw<Array<{ count: number }>>`
          SELECT count(*)::int AS "count"
          FROM "MessageConversation"
          WHERE "id" = ${conversationId}
        `,
    );
    expect(row?.count).toBe(0);
  });

  it("rejects student identities as conversation creators despite site membership", async () => {
    if (!isDatabaseAvailable()) return;

    const conversationId = randomUUID();
    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          async (tx) => {
            await tx.$executeRaw`
              INSERT INTO "MessageConversation" (
                "id", "tenantId", "kind", "guardianIdentityId", "createdByUserId"
              ) VALUES (
                ${conversationId}, ${fixture.tenantAId},
                'STAFF_DIRECT'::"MessageConversationKind", NULL,
                ${fixture.studentUserId}
              )
            `;
            await insertParticipant(tx, fixture, {
              conversationId,
              userId: fixture.staffAId,
              kind: "STAFF",
            });
            await insertParticipant(tx, fixture, {
              conversationId,
              userId: fixture.staffBId,
              kind: "STAFF",
            });
          },
        ),
      "23514",
    );
  });

  it("permits current guardian and staff conversation creators", async () => {
    if (!isDatabaseAvailable()) return;

    await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        const guardianConversationId = await insertConversation(tx, fixture, {
          kind: "PARENT_STAFF",
          guardianIdentityId: fixture.guardianAIdentityId,
          createdByUserId: fixture.guardianAUserId,
        });
        await insertParticipant(tx, fixture, {
          conversationId: guardianConversationId,
          userId: fixture.guardianAUserId,
          kind: "GUARDIAN",
          guardianIdentityId: fixture.guardianAIdentityId,
        });
        await insertParticipant(tx, fixture, {
          conversationId: guardianConversationId,
          userId: fixture.staffAId,
          kind: "STAFF",
        });
        await createStaffConversation(tx, fixture, "STAFF_DIRECT");
      },
    );
  });

  it("rejects direct conversation sequence updates without changing read state", async () => {
    if (!isDatabaseAvailable()) return;

    const seeded = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        const conversation = await createParentStaffConversation(tx, fixture);
        const message = await insertMessage(tx, fixture, {
          conversationId: conversation.conversationId,
          senderParticipantId: conversation.guardianParticipantId!,
          clientRequestId: randomUUID(),
        });
        const cursorId = await insertReadCursor(
          tx,
          fixture,
          conversation.conversationId,
          conversation.guardianParticipantId!,
        );
        await setReadCursor(tx, cursorId, message.sequence);
        return {
          conversationId: conversation.conversationId,
          cursorId,
          messageSequence: message.sequence,
        };
      },
    );

    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) =>
            tx.$executeRaw`
            UPDATE "MessageConversation"
            SET "lastMessageSequence" = ${seeded.messageSequence + 100}
            WHERE "id" = ${seeded.conversationId}
          `,
        ),
      "55000",
    );

    const [state] = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        tx.$queryRaw<
          Array<{ lastMessageSequence: number; lastReadSequence: number }>
        >`
          SELECT
            conversation."lastMessageSequence",
            cursor."lastReadSequence"
          FROM "MessageConversation" conversation
          INNER JOIN "MessageParticipantReadCursor" cursor
            ON cursor."conversationId" = conversation."id"
          WHERE conversation."id" = ${seeded.conversationId}
            AND cursor."id" = ${seeded.cursorId}
        `,
    );
    expect(state).toEqual({
      lastMessageSequence: seeded.messageSequence,
      lastReadSequence: seeded.messageSequence,
    });
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
        withMessagingRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) =>
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

  it("prevents deleting delivery, cursor, and receipt records to reset forward state", async () => {
    if (!isDatabaseAvailable()) return;

    const seeded = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        const conversation = await createParentStaffConversation(tx, fixture);
        const message = await insertMessage(tx, fixture, {
          conversationId: conversation.conversationId,
          senderParticipantId: conversation.guardianParticipantId!,
          clientRequestId: randomUUID(),
        });
        const cursorId = await insertReadCursor(
          tx,
          fixture,
          conversation.conversationId,
          conversation.guardianParticipantId!,
        );
        await setReadCursor(tx, cursorId, message.sequence);
        const deliveryId = await insertDelivery(
          tx,
          fixture,
          message.id,
          conversation.staffParticipantIds[0],
        );
        await setDeliveryStatus(tx, deliveryId, "DELIVERED");
        await setDeliveryStatus(tx, deliveryId, "READ");

        const noticeId = await insertNotice(tx, fixture);
        const audienceMemberId = await insertNoticeAudienceMember(tx, fixture, {
          noticeId,
          recipientUserId: fixture.guardianAUserId,
          recipientKind: "GUARDIAN",
          guardianIdentityId: fixture.guardianAIdentityId,
        });
        await publishNotice(tx, noticeId);
        const receiptId = await insertNoticeReceipt(
          tx,
          fixture,
          audienceMemberId,
        );
        const deliveredAt = new Date("2026-08-03T09:00:00.000Z");
        const readAt = new Date("2026-08-03T09:01:00.000Z");
        await setNoticeReceiptState(tx, receiptId, deliveredAt, readAt);
        return {
          cursorId,
          deliveryId,
          messageSequence: message.sequence,
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
            tx.$executeRaw`
            DELETE FROM "MessageDelivery"
            WHERE "id" = ${seeded.deliveryId}
          `,
        ),
      "55000",
    );
    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) =>
            tx.$executeRaw`
            DELETE FROM "MessageParticipantReadCursor"
            WHERE "id" = ${seeded.cursorId}
          `,
        ),
      "55000",
    );
    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) =>
            tx.$executeRaw`
            DELETE FROM "AceNoticeReceipt"
            WHERE "id" = ${seeded.receiptId}
          `,
        ),
      "55000",
    );

    const state = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        const [delivery] = await tx.$queryRaw<
          Array<{
            deliveredAt: Date | null;
            readAt: Date | null;
            status: "PENDING" | "DELIVERED" | "READ";
          }>
        >`
          SELECT "status", "deliveredAt", "readAt"
          FROM "MessageDelivery"
          WHERE "id" = ${seeded.deliveryId}
        `;
        const [cursor] = await tx.$queryRaw<
          Array<{ lastReadSequence: number }>
        >`
          SELECT "lastReadSequence"
          FROM "MessageParticipantReadCursor"
          WHERE "id" = ${seeded.cursorId}
        `;
        const [receipt] = await tx.$queryRaw<
          Array<{ deliveredAt: Date | null; readAt: Date | null }>
        >`
          SELECT "deliveredAt", "readAt"
          FROM "AceNoticeReceipt"
          WHERE "id" = ${seeded.receiptId}
        `;
        return { cursor, delivery, receipt };
      },
    );
    expect(state.delivery.status).toBe("READ");
    expect(state.delivery.deliveredAt).not.toBeNull();
    expect(state.delivery.readAt).not.toBeNull();
    expect(state.cursor).toEqual({
      lastReadSequence: seeded.messageSequence,
    });
    expect(state.receipt.deliveredAt).not.toBeNull();
    expect(state.receipt.readAt).not.toBeNull();
  });

  it("retains unreferenced messages and their client idempotency history", async () => {
    if (!isDatabaseAvailable()) return;

    const seeded = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        const conversation = await createParentStaffConversation(tx, fixture);
        const clientRequestId = randomUUID();
        const message = await insertMessage(tx, fixture, {
          conversationId: conversation.conversationId,
          senderParticipantId: conversation.staffParticipantIds[0],
          clientRequestId,
        });
        return {
          clientRequestId,
          conversationId: conversation.conversationId,
          messageId: message.id,
          senderParticipantId: conversation.staffParticipantIds[0],
        };
      },
    );

    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) =>
            tx.$executeRaw`
              DELETE FROM "Message"
              WHERE "id" = ${seeded.messageId}
            `,
        ),
      "55000",
    );

    const [message] = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        tx.$queryRaw<
          Array<{
            attachmentCount: number;
            clientRequestId: string;
            deliveryCount: number;
            id: string;
          }>
        >`
          SELECT
            message."id",
            message."clientRequestId",
            count(DISTINCT attachment."id")::int AS "attachmentCount",
            count(DISTINCT delivery."id")::int AS "deliveryCount"
          FROM "Message" message
          LEFT JOIN "MessageAttachment" attachment
            ON attachment."messageId" = message."id"
          LEFT JOIN "MessageDelivery" delivery
            ON delivery."messageId" = message."id"
          WHERE message."id" = ${seeded.messageId}
          GROUP BY message."id", message."clientRequestId"
        `,
    );
    expect(message).toEqual({
      attachmentCount: 0,
      clientRequestId: seeded.clientRequestId,
      deliveryCount: 0,
      id: seeded.messageId,
    });

    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertMessage(tx, fixture, {
            conversationId: seeded.conversationId,
            senderParticipantId: seeded.senderParticipantId,
            clientRequestId: seeded.clientRequestId,
          }),
        ),
      "23505",
    );
  });

  it("retains unreferenced participants without changing the explicit removal lifecycle", async () => {
    if (!isDatabaseAvailable()) return;

    const seeded = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        const conversation = await createParentStaffConversation(tx, fixture);
        const unreferencedParticipantId = await insertParticipant(tx, fixture, {
          conversationId: conversation.conversationId,
          userId: fixture.staffBId,
          kind: "STAFF",
        });
        return { unreferencedParticipantId };
      },
    );

    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) =>
            tx.$executeRaw`
              DELETE FROM "MessageParticipant"
              WHERE "id" = ${seeded.unreferencedParticipantId}
            `,
        ),
      "55000",
    );

    const [participant] = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        tx.$queryRaw<Array<{ id: string; removedAt: Date | null }>>`
          SELECT "id", "removedAt"
          FROM "MessageParticipant"
          WHERE "id" = ${seeded.unreferencedParticipantId}
        `,
    );
    expect(participant).toEqual({
      id: seeded.unreferencedParticipantId,
      removedAt: null,
    });
  });

  it("rechecks later student identity assignment for message, delivery, and cursor writes", async () => {
    if (!isDatabaseAvailable()) return;

    const studentIdentityId = randomUUID();
    const studentIdentityLinkId = randomUUID();
    const studentChildId = randomUUID();
    const seeded = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        const conversation = await createParentStaffConversation(tx, fixture);
        const participantId = await insertParticipant(tx, fixture, {
          conversationId: conversation.conversationId,
          userId: fixture.staffCId,
          kind: "STAFF",
        });
        const message = await insertMessage(tx, fixture, {
          conversationId: conversation.conversationId,
          senderParticipantId: conversation.staffParticipantIds[0],
          clientRequestId: randomUUID(),
        });
        const existingCursorId = await insertReadCursor(
          tx,
          fixture,
          conversation.conversationId,
          participantId,
        );
        const cursorCreationConversation = await createStaffConversation(
          tx,
          fixture,
          "STAFF_ROOM",
        );
        const cursorCreationParticipantId = await insertParticipant(
          tx,
          fixture,
          {
            conversationId: cursorCreationConversation.conversationId,
            userId: fixture.staffCId,
            kind: "STAFF",
          },
        );

        return {
          conversationId: conversation.conversationId,
          cursorCreationConversationId:
            cursorCreationConversation.conversationId,
          cursorCreationParticipantId,
          existingCursorId,
          messageId: message.id,
          messageSequence: message.sequence,
          participantId,
        };
      },
    );

    try {
      await withMessagingRlsContext(
        fixture.tenantAId,
        fixture.orgAId,
        async (tx) => {
          await tx.child.create({
            data: {
              id: studentChildId,
              firstName: "Messaging",
              lastName: "Post-participant student",
              tenantId: fixture.tenantAId,
            },
          });
          await tx.$executeRaw`
            INSERT INTO "StudentIdentity" ("id", "tenantId", "userId")
            VALUES (${studentIdentityId}, ${fixture.tenantAId}, ${fixture.staffCId})
          `;
          await tx.$executeRaw`
            INSERT INTO "StudentIdentityLink" (
              "id", "tenantId", "studentIdentityId", "childId"
            ) VALUES (
              ${studentIdentityLinkId}, ${fixture.tenantAId},
              ${studentIdentityId}, ${studentChildId}
            )
          `;
        },
      );

      const postIdentityWrites = await Promise.allSettled([
        expectDatabaseRejection(
          () =>
            withMessagingRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
              insertMessage(tx, fixture, {
                conversationId: seeded.conversationId,
                senderParticipantId: seeded.participantId,
                clientRequestId: randomUUID(),
              }),
            ),
          "23514",
        ),
        expectDatabaseRejection(
          () =>
            withMessagingRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
              insertDelivery(
                tx,
                fixture,
                seeded.messageId,
                seeded.participantId,
              ),
            ),
          "23514",
        ),
        expectDatabaseRejection(
          () =>
            withMessagingRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
              insertReadCursor(
                tx,
                fixture,
                seeded.cursorCreationConversationId,
                seeded.cursorCreationParticipantId,
              ),
            ),
          "23514",
        ),
        expectDatabaseRejection(
          () =>
            withMessagingRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
              setReadCursor(
                tx,
                seeded.existingCursorId,
                seeded.messageSequence,
              ),
            ),
          "23514",
        ),
      ]);
      expect(postIdentityWrites).toEqual([
        { status: "fulfilled", value: undefined },
        { status: "fulfilled", value: undefined },
        { status: "fulfilled", value: undefined },
        { status: "fulfilled", value: undefined },
      ]);
    } finally {
      await prisma.studentIdentityLink.delete({
        where: { id: studentIdentityLinkId },
      });
      await prisma.studentIdentity.delete({ where: { id: studentIdentityId } });
      await prisma.child.delete({ where: { id: studentChildId } });
    }
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

  it("rejects dual identities from guardian notice audiences", async () => {
    if (!isDatabaseAvailable()) return;

    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          async (tx) => {
            const noticeId = await insertNotice(tx, fixture);
            await insertNoticeAudienceMember(tx, fixture, {
              noticeId,
              recipientUserId: fixture.dualIdentityUserId,
              recipientKind: "GUARDIAN",
              guardianIdentityId: fixture.dualGuardianIdentityId,
            });
          },
        ),
      "23514",
    );
  });

  it("rejects student identities as notice authors despite site membership", async () => {
    if (!isDatabaseAvailable()) return;

    const noticeId = randomUUID();
    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) =>
            tx.$executeRaw`
            INSERT INTO "AceNotice" (
              "id", "tenantId", "createdByUserId", "title", "body", "audience", "publishedAt"
            ) VALUES (
              ${noticeId}, ${fixture.tenantAId}, ${fixture.studentUserId},
              'Student author', 'Students cannot author ACE notices.',
              'STAFF'::"AceNoticeAudience", NULL
            )
          `,
        ),
      "23514",
    );
    const [row] = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        tx.$queryRaw<Array<{ count: number }>>`
          SELECT count(*)::int AS "count"
          FROM "AceNotice"
          WHERE "id" = ${noticeId}
        `,
    );
    expect(row?.count).toBe(0);
  });

  it("keeps draft notice ownership tenant-local and immutable", async () => {
    if (!isDatabaseAvailable()) return;

    const noticeId = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => insertNotice(tx, fixture),
    );

    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) =>
            tx.$executeRaw`
            UPDATE "AceNotice"
            SET
              "tenantId" = ${fixture.tenantBId},
              "createdByUserId" = ${fixture.staffCId}
            WHERE "id" = ${noticeId}
          `,
        ),
      "55000",
    );
    const [notice] = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        tx.$queryRaw<Array<{ createdByUserId: string; tenantId: string }>>`
          SELECT "tenantId", "createdByUserId"
          FROM "AceNotice"
          WHERE "id" = ${noticeId}
        `,
    );
    expect(notice).toEqual({
      createdByUserId: fixture.staffAId,
      tenantId: fixture.tenantAId,
    });
  });

  it("keeps a published notice's original author immutable", async () => {
    if (!isDatabaseAvailable()) return;

    const noticeId = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        const id = await insertNotice(tx, fixture);
        await insertNoticeAudienceMember(tx, fixture, {
          noticeId: id,
          recipientUserId: fixture.guardianAUserId,
          recipientKind: "GUARDIAN",
          guardianIdentityId: fixture.guardianAIdentityId,
        });
        await publishNotice(tx, id);
        return id;
      },
    );

    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) =>
            tx.$executeRaw`
            UPDATE "AceNotice"
            SET "createdByUserId" = ${fixture.staffBId}
            WHERE "id" = ${noticeId}
          `,
        ),
      "55000",
    );
    const [notice] = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        tx.$queryRaw<
          Array<{ createdByUserId: string; publishedAt: Date | null }>
        >`
          SELECT "createdByUserId", "publishedAt"
          FROM "AceNotice"
          WHERE "id" = ${noticeId}
        `,
    );
    expect(notice?.createdByUserId).toBe(fixture.staffAId);
    expect(notice?.publishedAt).not.toBeNull();
  });

  it("allows draft edits but rejects an expired notice at publication", async () => {
    if (!isDatabaseAvailable()) return;

    const noticeId = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        const id = await insertNotice(tx, fixture);
        await tx.$executeRaw`
          UPDATE "AceNotice"
          SET "title" = 'Edited draft', "expiresAt" = CURRENT_TIMESTAMP - interval '1 hour'
          WHERE "id" = ${id}
        `;
        await insertNoticeAudienceMember(tx, fixture, {
          noticeId: id,
          recipientUserId: fixture.staffCId,
          recipientKind: "STAFF",
        });
        return id;
      },
    );

    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          publishNotice(tx, noticeId),
        ),
      "23514",
    );
    const [notice] = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        tx.$queryRaw<Array<{ title: string; publishedAt: Date | null }>>`
          SELECT "title", "publishedAt" FROM "AceNotice" WHERE "id" = ${noticeId}
        `,
    );
    expect(notice).toEqual({ title: "Edited draft", publishedAt: null });
  });

  it("freezes published content and attachments while allowing final withdrawal", async () => {
    if (!isDatabaseAvailable()) return;

    const { noticeId, attachmentId } = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        const id = await insertNotice(tx, fixture);
        await tx.$executeRaw`
          UPDATE "AceNotice"
          SET "expiresAt" = CURRENT_TIMESTAMP + interval '1 day'
          WHERE "id" = ${id}
        `;
        const attachmentId = await insertNoticeAttachment(tx, fixture, id);
        await insertNoticeAudienceMember(tx, fixture, {
          noticeId: id,
          recipientUserId: fixture.staffCId,
          recipientKind: "STAFF",
        });
        await publishNotice(tx, id);
        return { noticeId: id, attachmentId };
      },
    );

    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) =>
            tx.$executeRaw`
            UPDATE "AceNotice"
            SET "title" = 'Changed', "body" = 'Changed',
                "expiresAt" = CURRENT_TIMESTAMP + interval '2 days'
            WHERE "id" = ${noticeId}
          `,
        ),
      "55000",
    );
    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) =>
            tx.$executeRaw`
            DELETE FROM "AceNoticeAttachment" WHERE "id" = ${attachmentId}
          `,
        ),
      "55000",
    );
    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertNoticeAttachment(tx, fixture, noticeId),
        ),
      "55000",
    );

    await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        tx.$executeRaw`
        UPDATE "AceNotice" SET "withdrawnAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${noticeId}
      `,
    );
    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) =>
            tx.$executeRaw`
            UPDATE "AceNotice" SET "withdrawnAt" = NULL
            WHERE "id" = ${noticeId}
          `,
        ),
      "55000",
    );
  });

  it("makes read times write-once and denies new reads after withdrawal", async () => {
    if (!isDatabaseAvailable()) return;

    const { noticeId, firstReceiptId, secondReceiptId } =
      await withMessagingRlsContext(
        fixture.tenantAId,
        fixture.orgAId,
        async (tx) => {
          const noticeId = await insertNotice(tx, fixture);
          const firstMemberId = await insertNoticeAudienceMember(tx, fixture, {
            noticeId,
            recipientUserId: fixture.staffBId,
            recipientKind: "STAFF",
          });
          const secondMemberId = await insertNoticeAudienceMember(tx, fixture, {
            noticeId,
            recipientUserId: fixture.staffCId,
            recipientKind: "STAFF",
          });
          await publishNotice(tx, noticeId);
          const firstReceiptId = await insertNoticeReceipt(
            tx,
            fixture,
            firstMemberId,
          );
          const secondReceiptId = await insertNoticeReceipt(
            tx,
            fixture,
            secondMemberId,
          );
          await tx.$executeRaw`
            UPDATE "AceNoticeReceipt" SET "deliveredAt" = CURRENT_TIMESTAMP
            WHERE "id" IN (${firstReceiptId}, ${secondReceiptId})
          `;
          return { noticeId, firstReceiptId, secondReceiptId };
        },
      );

    await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        tx.$executeRaw`
        UPDATE "AceNoticeReceipt" SET "readAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${firstReceiptId}
      `,
    );
    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) =>
            tx.$executeRaw`
            UPDATE "AceNoticeReceipt"
            SET "readAt" = CURRENT_TIMESTAMP + interval '1 minute'
            WHERE "id" = ${firstReceiptId}
          `,
        ),
      "55000",
    );
    await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        tx.$executeRaw`
        UPDATE "AceNotice" SET "withdrawnAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${noticeId}
      `,
    );
    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) =>
            tx.$executeRaw`
            UPDATE "AceNoticeReceipt" SET "readAt" = CURRENT_TIMESTAMP
            WHERE "id" = ${secondReceiptId}
          `,
        ),
      "23514",
    );
  });

  it("rejects receipts for a draft notice audience", async () => {
    if (!isDatabaseAvailable()) return;

    const seeded = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        const noticeId = await insertNotice(tx, fixture);
        const audienceMemberId = await insertNoticeAudienceMember(tx, fixture, {
          noticeId,
          recipientUserId: fixture.guardianAUserId,
          recipientKind: "GUARDIAN",
          guardianIdentityId: fixture.guardianAIdentityId,
        });
        return { audienceMemberId, receiptId: randomUUID() };
      },
    );

    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) =>
            tx.$executeRaw`
            INSERT INTO "AceNoticeReceipt" ("id", "tenantId", "audienceMemberId")
            VALUES (
              ${seeded.receiptId}, ${fixture.tenantAId}, ${seeded.audienceMemberId}
            )
          `,
        ),
      "23514",
    );
    const [row] = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        tx.$queryRaw<Array<{ count: number }>>`
          SELECT count(*)::int AS "count"
          FROM "AceNoticeReceipt"
          WHERE "id" = ${seeded.receiptId}
        `,
    );
    expect(row?.count).toBe(0);
  });

  it("requires a persisted audience before notice publication", async () => {
    if (!isDatabaseAvailable()) return;

    const emptyNoticeId = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => insertNotice(tx, fixture),
    );

    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          publishNotice(tx, emptyNoticeId),
        ),
      "23514",
    );
    const [emptyNotice] = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        tx.$queryRaw<Array<{ publishedAt: Date | null }>>`
          SELECT "publishedAt"
          FROM "AceNotice"
          WHERE "id" = ${emptyNoticeId}
        `,
    );
    expect(emptyNotice?.publishedAt).toBeNull();

    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(fixture.tenantAId, fixture.orgAId, (tx) => {
          const id = randomUUID();
          return tx.$executeRaw`
              INSERT INTO "AceNotice" (
                "id", "tenantId", "createdByUserId", "title", "body", "audience", "publishedAt"
              ) VALUES (
                ${id}, ${fixture.tenantAId}, ${fixture.staffAId}, 'Initial publication',
                'This notice bypasses the audience snapshot.',
                'PARENTS'::"AceNoticeAudience", CURRENT_TIMESTAMP
              )
            `;
        }),
      "23514",
    );

    const publishedNotice = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        const noticeId = await insertNotice(tx, fixture);
        await insertNoticeAudienceMember(tx, fixture, {
          noticeId,
          recipientUserId: fixture.guardianAUserId,
          recipientKind: "GUARDIAN",
          guardianIdentityId: fixture.guardianAIdentityId,
        });
        await publishNotice(tx, noticeId);
        const [notice] = await tx.$queryRaw<
          Array<{ audienceMemberCount: number; publishedAt: Date | null }>
        >`
          SELECT
            notice."publishedAt",
            count(audience_member."id")::int AS "audienceMemberCount"
          FROM "AceNotice" notice
          LEFT JOIN "AceNoticeAudienceMember" audience_member
            ON audience_member."noticeId" = notice."id"
          WHERE notice."id" = ${noticeId}
          GROUP BY notice."id", notice."publishedAt"
        `;
        return notice;
      },
    );
    expect(publishedNotice?.audienceMemberCount).toBe(1);
    expect(publishedNotice?.publishedAt).not.toBeNull();
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
        await insertNoticeAttachment(tx, fixture, noticeId);
        await publishNotice(tx, noticeId);
        const receiptId = await insertNoticeReceipt(
          tx,
          fixture,
          guardianAudienceMemberId,
        );
        await insertNoticeReceipt(tx, fixture, staffAudienceMemberId);
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
        withMessagingRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
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

    await withTenantRlsContext(
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
      },
    );
    const audienceCount = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        const [audienceCount] = await tx.$queryRaw<Array<{ count: number }>>`
        SELECT count(*)::int AS "count" FROM "AceNoticeAudienceMember"
        WHERE "noticeId" = ${seeded.noticeId}
      `;
        await setNoticeReceiptState(tx, seeded.receiptId, new Date(), null);
        await setNoticeReceiptState(
          tx,
          seeded.receiptId,
          new Date(),
          new Date(),
        );
        return audienceCount.count;
      },
    );

    expect(audienceCount).toBe(2);
    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          setNoticeReceiptState(tx, seeded.receiptId, new Date(), null),
        ),
      "55000",
    );
  });

  it("keeps draft audience members attached to their originating notice", async () => {
    if (!isDatabaseAvailable()) return;

    const seeded = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        const sourceNoticeId = await insertNotice(tx, fixture);
        const destinationNoticeId = await insertNotice(tx, fixture);
        const audienceMemberId = await insertNoticeAudienceMember(tx, fixture, {
          noticeId: sourceNoticeId,
          recipientUserId: fixture.staffAId,
          recipientKind: "STAFF",
        });
        return { audienceMemberId, destinationNoticeId, sourceNoticeId };
      },
    );

    await expectDatabaseRejection(
      () =>
        withMessagingRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) => tx.$executeRaw`
            UPDATE "AceNoticeAudienceMember"
            SET "noticeId" = ${seeded.destinationNoticeId}
            WHERE "id" = ${seeded.audienceMemberId}
          `,
        ),
      "55000",
    );

    const [audienceMember] = await withMessagingRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        tx.$queryRaw<Array<{ noticeId: string; recipientUserId: string }>>`
          SELECT "noticeId", "recipientUserId"
          FROM "AceNoticeAudienceMember"
          WHERE "id" = ${seeded.audienceMemberId}
        `,
    );
    expect(audienceMember).toEqual({
      noticeId: seeded.sourceNoticeId,
      recipientUserId: fixture.staffAId,
    });
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

      expect(notice?.audienceMemberCount).toBe(1);
      expect(notice?.publishedAt).not.toBeNull();
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
    // PostgreSQL runs BEFORE triggers before RLS WITH CHECK policies. A
    // prohibited write can therefore fail as an authorization or invariant
    // error; both outcomes must reject it without exposing tenant A rows.
    const prohibitedWriteCodes = ["42501", "23514", "55000"] as const;
    for (const table of f21Tables) {
      await expect(
        countRowsAsTenant(table, fixture.tenantBId, fixture),
      ).resolves.toBe(0);
      await expectDatabaseRejection(
        () =>
          withMessagingRlsContext(fixture.tenantBId, fixture.orgBId, (tx) =>
            insertTenantAWriteProbe(tx, fixture, tenantARows, table),
          ),
        prohibitedWriteCodes,
      );
    }
    for (const table of f21Tables) {
      await expect(countRowsWithoutTenant(table)).resolves.toBe(0);
      await expectDatabaseRejection(
        () =>
          withNoTenantRlsContext((tx) =>
            insertTenantAWriteProbe(tx, fixture, tenantARows, table),
          ),
        prohibitedWriteCodes,
      );
    }
  });
});
