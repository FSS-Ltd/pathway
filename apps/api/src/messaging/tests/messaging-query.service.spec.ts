import "reflect-metadata";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { REQUIRED_PERMISSION } from "../../access-control/require-permission.decorator";
import { MessagingController } from "../messaging.controller";
import {
  conversationQuerySchema,
  messageQuerySchema,
} from "../dto/messaging-query.dto";
import { encodeConversationCursor } from "../messaging-cursor";
import { MessagingQueryService } from "../messaging-query.service";

jest.mock("@pathway/db", () => ({ withTenantRlsContext: jest.fn() }));

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
    message: { findMany: jest.fn().mockResolvedValue([]) },
  };
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_tenant, _org, operation) =>
      operation(tx as never),
    );
  return { tx, service: new MessagingQueryService() };
}

describe("staff messaging reads", () => {
  beforeEach(() => jest.clearAllMocks());

  it("guards the list route with its typed messaging permission", () => {
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
  });

  it("lists only the selected site's active staff conversations", async () => {
    const { tx, service } = setup();
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
});
