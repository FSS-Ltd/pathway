import "reflect-metadata";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { REQUIRED_PERMISSION } from "../../access-control/require-permission.decorator";
import { MessagingController } from "../messaging.controller";
import {
  conversationQuerySchema,
  messageQuerySchema,
  readCursorSchema,
} from "../dto/messaging-query.dto";
import { encodeConversationCursor } from "../messaging-cursor";
import { MessagingService } from "../messaging.service";

jest.mock("@pathway/db", () => ({
  withTenantRlsContext: jest.fn(),
  Prisma: {
    sql: jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings: [...strings],
      values,
    })),
    join: jest.fn((values: unknown[]) => values),
  },
}));

const actor = { tenantId: "tenant-a", orgId: "org-a", userId: "staff-a" };
const time = new Date("2026-10-07T09:00:00.000Z");

function setup() {
  const tx = {
    tenant: { findFirst: jest.fn().mockResolvedValue({ id: actor.tenantId }) },
    siteMembership: {
      findUnique: jest.fn().mockResolvedValue({ id: "membership" }),
    },
    studentIdentity: { findUnique: jest.fn().mockResolvedValue(null) },
    user: { findFirst: jest.fn().mockResolvedValue({ id: actor.userId }) },
    messageConversation: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({ id: "conversation" }),
    },
    message: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({ id: "message-2" }),
    },
    messageParticipant: {
      findFirst: jest.fn().mockResolvedValue({ id: "participant-a" }),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ lastReadSequence: 2 }]),
  };
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_tenant, _org, operation) =>
      operation(tx as never),
    );
  return { tx, service: new MessagingService() };
}

describe("staff messaging service", () => {
  beforeEach(() => jest.clearAllMocks());

  it("guards each route with its typed messaging permission", () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        MessagingController.prototype.list,
      ),
    ).toBe("messaging.conversations.read");
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        MessagingController.prototype.messages,
      ),
    ).toBe("messaging.messages.read");
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        MessagingController.prototype.readCursor,
      ),
    ).toBe("messaging.messages.read");
  });

  it("requires bounded query inputs", () => {
    expect(conversationQuerySchema.safeParse({ limit: "51" }).success).toBe(
      false,
    );
    expect(messageQuerySchema.safeParse({ before: "0" }).success).toBe(false);
    expect(messageQuerySchema.safeParse({ before: "2147483648" }).success).toBe(
      false,
    );
    expect(
      messageQuerySchema.safeParse({ limit: "2", before: "10" }).data,
    ).toEqual({ limit: 2, before: 10 });
    expect(readCursorSchema.safeParse({ sequence: 0 }).success).toBe(false);
    expect(readCursorSchema.safeParse({ sequence: 2.5 }).success).toBe(false);
    expect(readCursorSchema.safeParse({ sequence: 2 }).success).toBe(true);
  });

  it("lists only the selected site's active staff conversations", async () => {
    const { tx, service } = setup();
    tx.$queryRaw.mockResolvedValue([
      { conversationId: "conversation-a", unreadCount: 2n },
    ]);
    tx.messageConversation.findMany.mockResolvedValue([
      {
        id: "conversation-a",
        kind: "STAFF_DIRECT",
        updatedAt: time,
        participants: [
          { userId: "staff-a", user: { displayName: "Alice", name: null } },
          { userId: "staff-b", user: { displayName: "Bob", name: null } },
        ],
        messages: [{ bodyEncrypted: "Meeting at noon", createdAt: time }],
      },
      { id: "conversation-next", updatedAt: time },
    ]);

    const result = await service.listStaffConversations(actor, { limit: 1 });

    expect(result.items).toEqual([
      {
        id: "conversation-a",
        kind: "STAFF_DIRECT",
        title: "Bob",
        latestMessage: {
          preview: "Meeting at noon",
          createdAt: time.toISOString(),
        },
        updatedAt: time.toISOString(),
        unreadCount: 2,
      },
    ]);
    expect(result.nextCursor).toEqual(expect.any(String));
    expect(tx.messageConversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: actor.tenantId,
          kind: { in: ["STAFF_DIRECT", "STAFF_ROOM"] },
          participants: {
            some: {
              tenantId: actor.tenantId,
              userId: actor.userId,
              kind: "STAFF",
              removedAt: null,
            },
          },
        }),
        take: 2,
      }),
    );
    expect(withTenantRlsContext).toHaveBeenCalledWith(
      actor.tenantId,
      actor.orgId,
      expect.any(Function),
    );
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(Prisma.join).toHaveBeenCalledWith(["conversation-a"]);
  });

  it("does not query unread messages when the page is empty", async () => {
    const { tx, service } = setup();

    await expect(service.listStaffConversations(actor, {})).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it("denies staff reads after membership ends or for a student identity", async () => {
    const { tx, service } = setup();
    tx.siteMembership.findUnique.mockResolvedValue(null);
    await expect(
      service.listStaffConversations(actor, {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.messageConversation.findMany).not.toHaveBeenCalled();

    tx.siteMembership.findUnique.mockResolvedValue({ id: "membership" });
    tx.studentIdentity.findUnique.mockResolvedValue({ id: "student" });
    await expect(
      service.listStaffConversations(actor, {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.messageConversation.findMany).not.toHaveBeenCalled();

    tx.studentIdentity.findUnique.mockResolvedValue(null);
    tx.user.findFirst.mockResolvedValue(null);
    await expect(
      service.listStaffConversations(actor, {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.messageConversation.findMany).not.toHaveBeenCalled();
    expect(tx.siteMembership.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: { in: ["SITE_ADMIN", "STAFF"] },
        }),
      }),
    );
  });

  it("rejects a cursor reused after a site switch before querying data", async () => {
    const { tx, service } = setup();
    const cursor = encodeConversationCursor(
      { updatedAt: time, id: "a5a3fdf3-203a-456c-9966-8e012da355bc" },
      actor.tenantId,
      actor.userId,
    );
    await expect(
      service.listStaffConversations(
        { ...actor, tenantId: "tenant-b" },
        { cursor },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.messageConversation.findMany).not.toHaveBeenCalled();
  });

  it("rejects a malformed UUID in a scoped cursor", async () => {
    const { tx, service } = setup();
    const cursor = encodeConversationCursor(
      { updatedAt: time, id: "------------------------------------" },
      actor.tenantId,
      actor.userId,
    );
    await expect(
      service.listStaffConversations(actor, { cursor }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.messageConversation.findMany).not.toHaveBeenCalled();
  });

  it("hides foreign or unjoined conversations and their message data", async () => {
    const { tx, service } = setup();
    tx.messageConversation.findFirst.mockResolvedValue(null);
    await expect(
      service.listStaffMessages(
        actor,
        "a5a3fdf3-203a-456c-9966-8e012da355bc",
        {},
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.message.findMany).not.toHaveBeenCalled();
    expect(tx.messageConversation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: actor.tenantId,
          participants: {
            some: {
              tenantId: actor.tenantId,
              userId: actor.userId,
              kind: "STAFF",
              removedAt: null,
            },
          },
        }),
      }),
    );
  });

  it("returns a bounded message page after participant access succeeds", async () => {
    const { tx, service } = setup();
    tx.message.findMany.mockResolvedValue([
      {
        id: "message-2",
        sequence: 2,
        bodyEncrypted: "Reply",
        createdAt: time,
        sender: { userId: "staff-b", user: { displayName: "Bob", name: null } },
      },
      { id: "message-1", sequence: 1 },
    ]);

    const result = await service.listStaffMessages(actor, "conversation-a", {
      limit: 1,
      before: 3,
    });

    expect(result.items).toEqual([
      {
        id: "message-2",
        sequence: 2,
        body: "Reply",
        createdAt: time.toISOString(),
        sender: { id: "staff-b", displayName: "Bob" },
      },
    ]);
    expect(result.nextBefore).toBe(2);
    expect(tx.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: actor.tenantId,
          conversationId: "conversation-a",
          sequence: { lt: 3 },
        },
        take: 2,
      }),
    );
  });

  it("rejects a missing participant or sequence before writing a read cursor", async () => {
    const { tx, service } = setup();
    tx.messageParticipant.findFirst.mockResolvedValue(null);
    await expect(
      service.advanceStaffReadCursor(actor, "conversation-a", { sequence: 1 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.$queryRaw).not.toHaveBeenCalled();

    tx.messageParticipant.findFirst.mockResolvedValue({ id: "participant-a" });
    tx.message.findFirst.mockResolvedValue(null);
    await expect(
      service.advanceStaffReadCursor(actor, "conversation-a", { sequence: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it("advances only the active staff participant's cursor", async () => {
    const { tx, service } = setup();

    await expect(
      service.advanceStaffReadCursor(actor, "conversation-a", { sequence: 2 }),
    ).resolves.toEqual({ lastReadSequence: 2 });
    expect(tx.messageParticipant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: actor.tenantId,
          conversationId: "conversation-a",
          userId: actor.userId,
          removedAt: null,
          conversation: { kind: { in: ["STAFF_DIRECT", "STAFF_ROOM"] } },
        }),
      }),
    );
    expect(tx.message.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: actor.tenantId,
          conversationId: "conversation-a",
          sequence: 2,
        },
      }),
    );
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
