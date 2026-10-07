import "reflect-metadata";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { REQUIRED_PERMISSION } from "../../access-control/require-permission.decorator";
import { recordAuditEventInTransaction } from "../../audit/audit.service";
import { createStaffDirectConversationSchema } from "../dto/messaging-command.dto";
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
      create: jest.fn().mockResolvedValue({ id: "conversation-a" }),
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

  it("limits recipient discovery to valid, bounded search terms", () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        MessagingController.prototype.recipients,
      ),
    ).toBe("messaging.conversations.create");
    expect(
      staffRecipientQuerySchema.parse({ search: "  Sam  ", limit: "2" }),
    ).toEqual({ search: "Sam", limit: 2 });
    for (const query of [
      { search: "S" },
      { search: "Sam", limit: "21" },
      { search: "Sam", limit: "0" },
      { search: "Sam", unexpected: "value" },
    ]) {
      expect(staffRecipientQuerySchema.safeParse(query).success).toBe(false);
    }
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

    await expect(
      service.listStaffRecipients(actor, { search: "Sam" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
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
