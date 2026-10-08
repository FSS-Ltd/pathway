import { ConflictException, NotFoundException } from "@nestjs/common";
import { prisma, withTenantRlsContext } from "@pathway/db";
import { recordAuditEventInTransaction } from "../../audit/audit.service";
import { sendMessageSchema } from "../dto/messaging-command.dto";
import { ParentMessagingCommandService } from "../parent-messaging-command.service";

jest.mock("@pathway/auth", () => ({
  SYSTEM_ROLE_TEMPLATES: {
    organisationHead: { name: "Organisation Head" },
    siteLead: { name: "Site Lead" },
    parent: { permissions: ["messaging.messages.send"] },
  },
}));
jest.mock("@pathway/db", () => ({
  Prisma: { sql: jest.fn().mockReturnValue("message-sql") },
  prisma: { tenant: { findUnique: jest.fn() } },
  withTenantRlsContext: jest.fn(),
}));
jest.mock("../../audit/audit.service", () => ({
  recordAuditEventInTransaction: jest.fn(),
}));

const siteId = "site-a";
const parentId = "parent-a";
const conversationId = "conversation-a";
const input = {
  clientRequestId: "6cf656fc-bab6-4892-9cb0-d0e69967c39f",
  body: "Please call me about the trip.",
};
const createdAt = new Date("2026-10-08T11:00:00.000Z");

function setup() {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    user: { findFirst: jest.fn().mockResolvedValue({ id: parentId }) },
    guardianIdentity: {
      findFirst: jest.fn().mockResolvedValue({ id: "guardian-a" }),
    },
    studentIdentity: { findUnique: jest.fn().mockResolvedValue(null) },
    permissionDefinition: {
      findUnique: jest.fn().mockResolvedValue({ isActive: true }),
    },
    messageConversation: {
      findFirst: jest.fn().mockResolvedValue({
        participants: [
          { id: "guardian-participant", userId: parentId, kind: "GUARDIAN" },
          { id: "staff-participant", userId: "staff-a", kind: "STAFF" },
        ],
      }),
    },
    siteMembership: {
      findMany: jest.fn().mockResolvedValue([{ userId: "staff-a" }]),
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
  };
  jest.mocked(prisma.tenant.findUnique).mockResolvedValue({
    orgId: "org-a",
    org: { parentPortalEnabled: true },
  } as never);
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_siteId, _orgId, operation) =>
      operation(tx as never),
    );
  return { tx, service: new ParentMessagingCommandService() };
}

describe("parent school-team message send", () => {
  beforeEach(() => jest.clearAllMocks());

  it("validates a bounded message and stable retry ID", () => {
    expect(sendMessageSchema.parse(input)).toEqual(input);
    for (const body of [" ", "x".repeat(4001)]) {
      expect(sendMessageSchema.safeParse({ ...input, body }).success).toBe(
        false,
      );
    }
    expect(
      sendMessageSchema.safeParse({ ...input, clientRequestId: "bad" }).success,
    ).toBe(false);
  });

  it("writes one encrypted message and delivery to the current approved responder", async () => {
    const { tx, service } = setup();
    await expect(
      service.send(siteId, parentId, conversationId, input),
    ).resolves.toEqual({
      id: "message-a",
      conversationId,
      clientRequestId: input.clientRequestId,
      sequence: 1,
      body: input.body,
      createdAt: createdAt.toISOString(),
      reused: false,
    });
    expect(tx.messageConversation.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: conversationId,
        tenantId: siteId,
        guardianIdentityId: "guardian-a",
        kind: "PARENT_STAFF",
      }),
      select: expect.any(Object),
    });
    expect(tx.siteMembership.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: siteId,
        userId: { in: ["staff-a"] },
        role: { in: ["SITE_ADMIN", "STAFF"] },
      }),
      select: { userId: true },
    });
    expect(tx.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientRequestId: input.clientRequestId,
        bodyEncrypted: input.body,
        deliveries: {
          create: [
            expect.objectContaining({
              recipientParticipant: { connect: { id: "staff-participant" } },
            }),
          ],
        },
      }),
      select: expect.any(Object),
    });
    expect(recordAuditEventInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actorUserId: parentId,
        metadata: { conversationId, sequence: 1 },
      }),
    );
  });

  it("returns an identical retry without a second write and rejects changed text", async () => {
    const { tx, service } = setup();
    tx.message.findFirst.mockResolvedValue({
      id: "message-a",
      sequence: 1,
      bodyEncrypted: input.body,
      createdAt,
    });
    tx.siteMembership.findMany.mockResolvedValue([]);
    await expect(
      service.send(siteId, parentId, conversationId, input),
    ).resolves.toMatchObject({ id: "message-a", reused: true });
    await expect(
      service.send(siteId, parentId, conversationId, {
        ...input,
        body: "Changed message",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.message.create).not.toHaveBeenCalled();
    expect(tx.siteMembership.findMany).not.toHaveBeenCalled();
    expect(recordAuditEventInTransaction).not.toHaveBeenCalled();
  });

  it("omits a former responder when another approved staff participant remains", async () => {
    const { tx, service } = setup();
    tx.messageConversation.findFirst.mockResolvedValue({
      participants: [
        { id: "guardian-participant", userId: parentId, kind: "GUARDIAN" },
        { id: "staff-participant", userId: "staff-a", kind: "STAFF" },
        { id: "former-participant", userId: "staff-b", kind: "STAFF" },
      ],
    });
    await service.send(siteId, parentId, conversationId, input);
    expect(tx.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        deliveries: {
          create: [
            expect.objectContaining({
              recipientParticipant: { connect: { id: "staff-participant" } },
            }),
          ],
        },
      }),
      select: expect.any(Object),
    });
  });

  it("denies an ended guardian relationship, removed participant, or revoked responder", async () => {
    const { tx, service } = setup();
    tx.guardianIdentity.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.send(siteId, parentId, conversationId, input),
    ).rejects.toBeInstanceOf(NotFoundException);
    tx.messageConversation.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.send(siteId, parentId, conversationId, input),
    ).rejects.toBeInstanceOf(NotFoundException);
    tx.siteMembership.findMany.mockResolvedValueOnce([]);
    await expect(
      service.send(siteId, parentId, conversationId, input),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.message.create).not.toHaveBeenCalled();
  });
});
