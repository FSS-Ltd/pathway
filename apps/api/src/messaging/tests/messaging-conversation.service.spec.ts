import "reflect-metadata";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { REQUIRED_PERMISSION } from "../../access-control/require-permission.decorator";
import { recordAuditEventInTransaction } from "../../audit/audit.service";
import {
  createStaffConversationSchema,
  createStaffDirectConversationSchema,
} from "../dto/messaging-command.dto";
import { staffRecipientQuerySchema } from "../dto/messaging-query.dto";
import { MessagingConversationService } from "../messaging-conversation.service";
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
const input = { kind: "STAFF_DIRECT" as const, recipientUserId };

function setup() {
  const tx = {
    tenant: { findFirst: jest.fn().mockResolvedValue({ id: actor.tenantId }) },
    siteMembership: {
      findUnique: jest.fn().mockImplementation(({ where }) =>
        Promise.resolve({
          id: where.tenantId_userId.userId,
          user: { isActive: true },
        }),
      ),
      findMany: jest.fn().mockResolvedValue([]),
    },
    studentIdentity: { findUnique: jest.fn().mockResolvedValue(null) },
    user: { findFirst: jest.fn().mockResolvedValue({ id: actor.userId }) },
    messageConversation: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: "conversation-a" }),
    },
    messageParticipant: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_tenant, _org, fn) => fn(tx as never));
  return { tx, service: new MessagingConversationService() };
}

describe("staff direct conversations", () => {
  beforeEach(() => jest.clearAllMocks());

  it("requires the typed create permission and direct-only input", () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        MessagingController.prototype.create,
      ),
    ).toBe("messaging.conversations.create");
    expect(createStaffDirectConversationSchema.safeParse(input).success).toBe(
      true,
    );
    expect(
      createStaffDirectConversationSchema.safeParse({
        ...input,
        kind: "PARENT_STAFF",
      }).success,
    ).toBe(false);
  });

  it("accepts a site staff list and bounded search terms", () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        MessagingController.prototype.recipients,
      ),
    ).toBe("messaging.conversations.create");
    expect(
      staffRecipientQuerySchema.parse({ search: "  Sam  ", limit: "2" }),
    ).toEqual({ search: "Sam", limit: 2 });
    expect(staffRecipientQuerySchema.parse({ limit: "20" })).toEqual({
      limit: 20,
    });
    expect(staffRecipientQuerySchema.parse({ search: "S" })).toEqual({
      search: "S",
    });
    for (const query of [
      { search: "" },
      { search: "Sam", limit: "21" },
      { search: "Sam", limit: "0" },
      { search: "Sam", unexpected: "value" },
    ]) {
      expect(staffRecipientQuerySchema.safeParse(query).success).toBe(false);
    }
  });

  it("lists colleagues at the current site before a search is entered", async () => {
    const { tx, service } = setup();
    tx.siteMembership.findMany.mockResolvedValue([
      { userId: recipientUserId, user: { displayName: "Sam", name: null } },
    ]);

    await expect(service.listStaffRecipients(actor, {})).resolves.toEqual({
      items: [{ id: recipientUserId, displayName: "Sam" }],
      hasMore: false,
    });
    expect(tx.siteMembership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: actor.tenantId,
          userId: { not: actor.userId },
          role: { in: ["SITE_ADMIN", "STAFF"] },
          user: {
            isActive: true,
            studentIdentities: { none: { tenantId: actor.tenantId } },
          },
        },
      }),
    );
  });

  it("finds active staff in the selected site without exposing other profile fields", async () => {
    const { tx, service } = setup();
    tx.siteMembership.findMany.mockResolvedValue([
      { userId: recipientUserId, user: { displayName: "Sam", name: null } },
      {
        userId: "22fafef3-b1d6-4ca5-b46c-2ddabf79759d",
        user: { displayName: "Sarah", name: null },
      },
    ]);

    await expect(
      service.listStaffRecipients(actor, { search: "Sa", limit: 1 }),
    ).resolves.toEqual({
      items: [{ id: recipientUserId, displayName: "Sam" }],
      hasMore: true,
    });
    expect(tx.siteMembership.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: actor.tenantId,
        userId: { not: actor.userId },
        role: { in: ["SITE_ADMIN", "STAFF"] },
        user: {
          isActive: true,
          studentIdentities: { none: { tenantId: actor.tenantId } },
          OR: [
            { displayName: { contains: "Sa", mode: "insensitive" } },
            { name: { contains: "Sa", mode: "insensitive" } },
          ],
        },
      },
      select: {
        userId: true,
        user: { select: { displayName: true, name: true } },
      },
      orderBy: [{ user: { displayName: "asc" } }, { userId: "asc" }],
      take: 2,
    });
  });

  it("rejects recipient discovery when current staff membership has ended", async () => {
    const { tx, service } = setup();
    tx.siteMembership.findUnique.mockResolvedValue(null);

    await expect(service.listStaffRecipients(actor, {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(tx.siteMembership.findMany).not.toHaveBeenCalled();
  });

  it("rejects self, ended actor membership, and an unavailable recipient", async () => {
    const { tx, service } = setup();
    await expect(
      service.openStaffDirect(actor, {
        ...input,
        recipientUserId: actor.userId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(withTenantRlsContext).not.toHaveBeenCalled();

    tx.siteMembership.findUnique.mockResolvedValue(null);
    await expect(service.openStaffDirect(actor, input)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(tx.messageConversation.create).not.toHaveBeenCalled();

    tx.siteMembership.findUnique.mockImplementation(({ where }) =>
      Promise.resolve(
        where.tenantId_userId.userId === actor.userId
          ? { id: actor.userId, user: { isActive: true } }
          : null,
      ),
    );
    await expect(service.openStaffDirect(actor, input)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.messageConversation.create).not.toHaveBeenCalled();
  });

  it("reuses an existing pair under the pair lock", async () => {
    const { tx, service } = setup();
    tx.messageConversation.findFirst.mockResolvedValue({ id: "existing" });

    await expect(service.openStaffDirect(actor, input)).resolves.toEqual({
      id: "existing",
      kind: "STAFF_DIRECT",
      created: false,
    });
    expect(Prisma.sql).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).toHaveBeenCalledWith("advisory-lock");
    expect(tx.messageConversation.create).not.toHaveBeenCalled();
    expect(recordAuditEventInTransaction).not.toHaveBeenCalled();
  });

  it("creates exactly two site staff participants and audits the new conversation", async () => {
    const { tx, service } = setup();

    await expect(service.openStaffDirect(actor, input)).resolves.toEqual({
      id: "conversation-a",
      kind: "STAFF_DIRECT",
      created: true,
    });
    expect(tx.messageConversation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: "STAFF_DIRECT",
          tenant: { connect: { id: actor.tenantId } },
          createdBy: { connect: { id: actor.userId } },
          participants: {
            create: expect.arrayContaining([
              {
                kind: "STAFF",
                tenant: { connect: { id: actor.tenantId } },
                user: { connect: { id: actor.userId } },
              },
              {
                kind: "STAFF",
                tenant: { connect: { id: actor.tenantId } },
                user: { connect: { id: recipientUserId } },
              },
            ]),
          },
        }),
      }),
    );
    expect(recordAuditEventInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actorUserId: actor.userId,
        entityId: "conversation-a",
        metadata: { kind: "STAFF_DIRECT", recipientUserId },
      }),
    );
  });
});

describe("site staff room", () => {
  beforeEach(() => jest.clearAllMocks());

  it("accepts only the room kind and uses the existing create permission", () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        MessagingController.prototype.create,
      ),
    ).toBe("messaging.conversations.create");
    expect(
      createStaffConversationSchema.safeParse({ kind: "STAFF_ROOM" }).success,
    ).toBe(true);
    expect(
      createStaffConversationSchema.safeParse({
        kind: "STAFF_ROOM",
        recipientUserId,
      }).success,
    ).toBe(false);
    expect(createStaffConversationSchema.safeParse(input).success).toBe(true);
  });

  it("creates one audited room with current site staff", async () => {
    const { tx, service } = setup();
    tx.siteMembership.findMany.mockResolvedValue([
      { userId: actor.userId },
      { userId: recipientUserId },
    ]);

    await expect(service.openStaffRoom(actor)).resolves.toEqual({
      id: "conversation-a",
      kind: "STAFF_ROOM",
      created: true,
    });
    expect(tx.siteMembership.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: actor.tenantId,
        role: { in: ["SITE_ADMIN", "STAFF"] },
        user: {
          isActive: true,
          studentIdentities: { none: { tenantId: actor.tenantId } },
        },
      },
      select: { userId: true },
    });
    expect(tx.messageConversation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: "STAFF_ROOM",
          participants: {
            create: expect.arrayContaining([
              expect.objectContaining({
                user: { connect: { id: actor.userId } },
              }),
              expect.objectContaining({
                user: { connect: { id: recipientUserId } },
              }),
            ]),
          },
        }),
      }),
    );
    expect(recordAuditEventInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: "CREATED",
        metadata: {
          kind: "STAFF_ROOM",
          participantUserIds: [actor.userId, recipientUserId].sort(),
        },
      }),
    );
  });

  it("reconciles ended and rejoined members without creating a second room", async () => {
    const { tx, service } = setup();
    const formerUserId = "c89fb6a1-cbd7-4270-9d41-c2061add9238";
    const newUserId = "9fb7597c-f387-4c9f-9212-c67b53cfeb11";
    tx.siteMembership.findMany.mockResolvedValue([
      { userId: actor.userId },
      { userId: recipientUserId },
      { userId: newUserId },
    ]);
    tx.messageConversation.findMany.mockResolvedValue([{ id: "room-a" }]);
    tx.messageParticipant.findMany.mockResolvedValue([
      { userId: actor.userId, removedAt: null },
      { userId: recipientUserId, removedAt: new Date() },
      { userId: formerUserId, removedAt: null },
    ]);

    await expect(service.openStaffRoom(actor)).resolves.toEqual({
      id: "room-a",
      kind: "STAFF_ROOM",
      created: false,
    });
    expect(tx.messageParticipant.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.messageParticipant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: { in: [formerUserId] } }),
      }),
    );
    expect(tx.messageParticipant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: { in: [recipientUserId] } }),
        data: { removedAt: null },
      }),
    );
    expect(tx.messageConversation.create).not.toHaveBeenCalled();
    expect(tx.messageParticipant.createMany).toHaveBeenCalledWith({
      data: [
        {
          tenantId: actor.tenantId,
          conversationId: "room-a",
          userId: newUserId,
          kind: "STAFF",
        },
      ],
    });
    expect(recordAuditEventInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: "UPDATED",
        metadata: {
          kind: "STAFF_ROOM",
          addedUserIds: [newUserId],
          rejoinedUserIds: [recipientUserId],
          removedUserIds: [formerUserId],
        },
      }),
    );
  });

  it("rejects an ineligible actor, a one-person site, and duplicate rooms", async () => {
    const { tx, service } = setup();
    tx.siteMembership.findUnique.mockResolvedValue(null);
    await expect(service.openStaffRoom(actor)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    tx.siteMembership.findUnique.mockResolvedValue({ id: actor.userId });
    tx.siteMembership.findMany.mockResolvedValue([{ userId: actor.userId }]);
    await expect(service.openStaffRoom(actor)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    tx.siteMembership.findMany.mockResolvedValue([
      { userId: actor.userId },
      { userId: recipientUserId },
    ]);
    tx.messageConversation.findMany.mockResolvedValue([
      { id: "room-a" },
      { id: "room-b" },
    ]);
    await expect(service.openStaffRoom(actor)).rejects.toHaveProperty(
      "status",
      409,
    );
    expect(tx.messageConversation.create).not.toHaveBeenCalled();
  });
});
