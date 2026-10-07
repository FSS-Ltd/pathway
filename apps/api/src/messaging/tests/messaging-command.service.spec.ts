import "reflect-metadata";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { REQUIRED_PERMISSION } from "../../access-control/require-permission.decorator";
import { recordAuditEventInTransaction } from "../../audit/audit.service";
import { sendStaffMessageSchema } from "../dto/messaging-command.dto";
import { MessagingCommandService } from "../messaging-command.service";
import { MessagingController } from "../messaging.controller";

jest.mock("@pathway/db", () => ({
  Prisma: { sql: jest.fn().mockReturnValue("advisory-lock") },
  withTenantRlsContext: jest.fn(),
}));
jest.mock("../../audit/audit.service", () => ({
  recordAuditEventInTransaction: jest.fn(),
}));

const actor = {
  tenantId: "tenant-a",
  orgId: "org-a",
  userId: "a5a3fdf3-203a-456c-9966-8e012da355bc",
};
const recipientUserId = "bd3ac71d-653f-4b68-9cb6-d869395a1b43";
const conversationId = "1ee5f2ec-3482-4516-ae7a-2265657b5249";
const input = {
  clientRequestId: "79e10aa7-d45d-4c78-a4e6-78956863e55c",
  body: "Staff update",
};
const createdAt = new Date("2026-10-07T10:00:00.000Z");
const participants = [
  {
    id: "participant-a",
    userId: actor.userId,
    kind: "STAFF",
    user: { isActive: true },
  },
  {
    id: "participant-b",
    userId: recipientUserId,
    kind: "STAFF",
    user: { isActive: true },
  },
];

function setup() {
  const tx = {
    tenant: { findFirst: jest.fn().mockResolvedValue({ id: actor.tenantId }) },
    siteMembership: {
      findUnique: jest.fn().mockResolvedValue({ id: "member-a" }),
      findMany: jest
        .fn()
        .mockResolvedValue(
          participants.map((participant) => ({ userId: participant.userId })),
        ),
    },
    studentIdentity: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    user: { findFirst: jest.fn().mockResolvedValue({ id: actor.userId }) },
    messageConversation: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: conversationId, participants }),
    },
    message: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: "message-a",
        sequence: 1,
        bodyEncrypted: input.body,
        createdAt,
      }),
    },
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_tenant, _org, fn) => fn(tx as never));
  return { tx, service: new MessagingCommandService() };
}

describe("staff message send", () => {
  beforeEach(() => jest.clearAllMocks());

  it("requires the send permission and a bounded, nonblank request", () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        MessagingController.prototype.send,
      ),
    ).toBe("messaging.messages.send");
    expect(sendStaffMessageSchema.safeParse(input).success).toBe(true);
    expect(
      sendStaffMessageSchema.safeParse({ ...input, body: "  " }).success,
    ).toBe(false);
    expect(
      sendStaffMessageSchema.safeParse({ ...input, body: "x".repeat(4001) })
        .success,
    ).toBe(false);
    expect(
      sendStaffMessageSchema.safeParse({ ...input, extra: true }).success,
    ).toBe(false);
  });

  it("rejects an unjoined conversation and an ineligible recipient", async () => {
    const { tx, service } = setup();
    tx.messageConversation.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.sendStaffMessage(actor, conversationId, input),
    ).rejects.toBeInstanceOf(NotFoundException);
    tx.siteMembership.findMany.mockResolvedValueOnce([
      { userId: actor.userId },
    ]);
    await expect(
      service.sendStaffMessage(actor, conversationId, input),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.message.create).not.toHaveBeenCalled();
  });

  it("reuses the same request without a second write and rejects a changed body", async () => {
    const { tx, service } = setup();
    tx.message.findFirst.mockResolvedValue({
      id: "message-a",
      sequence: 1,
      bodyEncrypted: input.body,
      createdAt,
    });
    await expect(
      service.sendStaffMessage(actor, conversationId, input),
    ).resolves.toEqual({
      id: "message-a",
      conversationId,
      clientRequestId: input.clientRequestId,
      sequence: 1,
      body: input.body,
      createdAt: createdAt.toISOString(),
      reused: true,
    });
    await expect(
      service.sendStaffMessage(actor, conversationId, {
        ...input,
        body: "Changed",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.message.create).not.toHaveBeenCalled();
    expect(recordAuditEventInTransaction).not.toHaveBeenCalled();
  });

  it("creates recipient deliveries, updates activity, and audits the message", async () => {
    const { tx, service } = setup();
    await expect(
      service.sendStaffMessage(actor, conversationId, input),
    ).resolves.toMatchObject({
      id: "message-a",
      sequence: 1,
      body: input.body,
      reused: false,
    });
    expect(Prisma.sql).toHaveBeenCalledTimes(2);
    expect(tx.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientRequestId: input.clientRequestId,
          bodyEncrypted: input.body,
          deliveries: {
            create: [
              {
                tenant: { connect: { id: actor.tenantId } },
                recipientParticipant: { connect: { id: "participant-b" } },
              },
            ],
          },
        }),
      }),
    );
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(recordAuditEventInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        entityId: "message-a",
        metadata: { conversationId, sequence: 1 },
      }),
    );
  });
});
