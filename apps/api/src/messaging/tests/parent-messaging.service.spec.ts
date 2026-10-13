import { BadRequestException, NotFoundException } from "@nestjs/common";
import { prisma, withTenantRlsContext } from "@pathway/db";
import { ParentMessagingHistoryService } from "../parent-messaging-history.service";
import { ParentMessagingReadCursorService } from "../parent-messaging-read-cursor.service";
import { ParentMessagingService } from "../parent-messaging.service";
import {
  decodeMessageHistoryCursor,
  encodeMessageHistoryCursor,
} from "../message-history-cursor";

jest.mock("@pathway/auth", () => ({
  SYSTEM_ROLE_TEMPLATES: {
    parent: {
      permissions: ["messaging.conversations.read", "messaging.messages.read"],
    },
  },
}));
jest.mock("@pathway/db", () => ({
  prisma: { tenant: { findUnique: jest.fn() } },
  withTenantRlsContext: jest.fn(),
}));

function setup() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ lastReadSequence: 6 }]),
    $executeRaw: jest.fn().mockResolvedValue(0),
    user: { findFirst: jest.fn().mockResolvedValue({ id: "parent-a" }) },
    guardianIdentity: {
      findFirst: jest.fn().mockResolvedValue({ id: "guardian-a" }),
    },
    studentIdentity: { findUnique: jest.fn().mockResolvedValue(null) },
    permissionDefinition: {
      findUnique: jest.fn().mockResolvedValue({ isActive: true }),
    },
    messageConversation: {
      findFirst: jest.fn().mockResolvedValue({
        id: "conversation-a",
        kind: "PARENT_STAFF",
        updatedAt: new Date("2026-10-08T10:00:00.000Z"),
        participants: [{ id: "participant-a" }],
        messages: [
          {
            bodyEncrypted: "  School   team update  ",
            createdAt: new Date("2026-10-08T09:00:00.000Z"),
          },
        ],
      }),
    },
    messageParticipantReadCursor: {
      findUnique: jest.fn().mockResolvedValue({ lastReadSequence: 2 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    messageDelivery: { findMany: jest.fn().mockResolvedValue([]) },
    message: {
      count: jest.fn().mockResolvedValue(3),
      findFirst: jest.fn().mockResolvedValue({ id: "message-six" }),
      findMany: jest.fn().mockResolvedValue([]),
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
  return {
    tx,
    service: new ParentMessagingService(),
    history: new ParentMessagingHistoryService(),
    readCursor: new ParentMessagingReadCursorService(),
  };
}

describe("parent messaging list", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns only the linked guardian's school-team summary", async () => {
    const { tx, service } = setup();
    const page = await service.list("site-a", "parent-a");

    expect(page).toEqual({
      items: [
        {
          id: "conversation-a",
          kind: "PARENT_STAFF",
          title: "School team",
          latestMessage: {
            preview: "School team update",
            createdAt: "2026-10-08T09:00:00.000Z",
          },
          updatedAt: "2026-10-08T10:00:00.000Z",
          unreadCount: 3,
        },
      ],
      nextCursor: null,
    });
    expect(withTenantRlsContext).toHaveBeenCalledWith(
      "site-a",
      "org-a",
      expect.any(Function),
    );
    expect(tx.guardianIdentity.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: "site-a",
        userId: "parent-a",
        relationships: {
          some: expect.objectContaining({
            legalAccess: "FULL",
            endedAt: null,
            revokedAt: null,
          }),
        },
      }),
      select: { id: true },
    });
    expect(tx.message.count).toHaveBeenCalledWith({
      where: {
        tenantId: "site-a",
        conversationId: "conversation-a",
        senderParticipantId: { not: "participant-a" },
        sequence: { gt: 2 },
      },
    });
  });

  it("denies missing relationships, student identity and inactive permission", async () => {
    const { tx, service } = setup();
    tx.guardianIdentity.findFirst.mockResolvedValueOnce(null);
    await expect(service.list("site-a", "parent-a")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    tx.studentIdentity.findUnique.mockResolvedValueOnce({ id: "student-a" });
    await expect(service.list("site-a", "parent-a")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    tx.permissionDefinition.findUnique.mockResolvedValueOnce({
      isActive: false,
    });
    await expect(service.list("site-a", "parent-a")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.messageConversation.findFirst).not.toHaveBeenCalled();
  });

  it("returns no thread for a removed participant and denies a closed portal", async () => {
    const { tx, service } = setup();
    tx.messageConversation.findFirst.mockResolvedValueOnce(null);
    await expect(service.list("site-a", "parent-a")).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    jest.mocked(prisma.tenant.findUnique).mockResolvedValueOnce({
      orgId: "org-a",
      org: { parentPortalEnabled: false },
    } as never);
    await expect(service.list("site-a", "parent-a")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(withTenantRlsContext).toHaveBeenCalledTimes(1);
  });
});

describe("parent messaging read cursor", () => {
  beforeEach(() => jest.clearAllMocks());

  it("advances only the linked guardian's school-team participant", async () => {
    const { tx, readCursor } = setup();
    await expect(
      readCursor.advance("site-a", "parent-a", "conversation-a", {
        sequence: 6,
      }),
    ).resolves.toEqual({ lastReadSequence: 6 });
    expect(tx.messageConversation.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "conversation-a",
        tenantId: "site-a",
        guardianIdentityId: "guardian-a",
      }),
      select: {
        participants: {
          where: {
            tenantId: "site-a",
            userId: "parent-a",
            kind: "GUARDIAN",
            guardianIdentityId: "guardian-a",
            removedAt: null,
          },
          select: { id: true },
          take: 1,
        },
      },
    });
    expect(tx.message.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: "site-a",
        conversationId: "conversation-a",
        sequence: 6,
      },
      select: { id: true },
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("rejects inaccessible threads and nonexistent sequences before writing", async () => {
    const { tx, readCursor } = setup();
    tx.messageConversation.findFirst.mockResolvedValueOnce(null);
    await expect(
      readCursor.advance("site-a", "parent-a", "other-conversation", {
        sequence: 6,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    tx.message.findFirst.mockResolvedValueOnce(null);
    await expect(
      readCursor.advance("site-a", "parent-a", "conversation-a", {
        sequence: 7,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it("denies ended guardian relationships before changing a cursor", async () => {
    const { tx, readCursor } = setup();
    tx.guardianIdentity.findFirst.mockResolvedValueOnce(null);
    await expect(
      readCursor.advance("site-a", "parent-a", "conversation-a", {
        sequence: 6,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.messageConversation.findFirst).not.toHaveBeenCalled();
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });
});

describe("parent messaging history", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns a bounded page without moving the read cursor", async () => {
    const { tx, history } = setup();
    tx.message.findMany.mockResolvedValueOnce([
      {
        id: "message-six",
        sequence: 6,
        bodyEncrypted: "A school update",
        createdAt: new Date("2026-10-08T10:05:00.000Z"),
        sender: {
          kind: "STAFF",
          userId: "staff-a",
          user: { displayName: " Ms Taylor ", name: null },
        },
      },
      { id: "message-five", sequence: 5 },
    ]);

    const page = await history.list("site-a", "parent-a", "conversation-a", {
      limit: 1,
    });
    expect(page).toEqual({
      items: [
        {
          id: "message-six",
          sequence: 6,
          body: "A school update",
          createdAt: "2026-10-08T10:05:00.000Z",
          sender: { id: "staff-a", displayName: "Ms Taylor" },
          deliveryState: null,
        },
      ],
      nextCursor: expect.any(String),
    });
    expect(
      decodeMessageHistoryCursor(
        page.nextCursor!,
        "site-a",
        "parent-a",
        "conversation-a",
      ),
    ).toBe(6);
    expect(tx.permissionDefinition.findUnique).toHaveBeenCalledWith({
      where: { key: "messaging.messages.read" },
      select: { isActive: true },
    });
    expect(tx.messageConversation.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "conversation-a",
        tenantId: "site-a",
        guardianIdentityId: "guardian-a",
      }),
      select: { id: true },
    });
    expect(tx.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "site-a", conversationId: "conversation-a" },
        take: 2,
      }),
    );
    expect(tx.messageParticipantReadCursor.findUnique).not.toHaveBeenCalled();
  });

  it("pages with a scoped cursor and hides unrelated conversations", async () => {
    const { tx, history } = setup();
    const cursor = encodeMessageHistoryCursor(
      5,
      "site-a",
      "parent-a",
      "conversation-a",
    );
    await history.list("site-a", "parent-a", "conversation-a", { cursor });
    expect(tx.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: "site-a",
          conversationId: "conversation-a",
          sequence: { lt: 5 },
        },
        take: 21,
      }),
    );

    tx.messageConversation.findFirst.mockResolvedValueOnce(null);
    await expect(
      history.list("site-a", "parent-a", "other-conversation", {}),
    ).rejects.toThrow("Messages not found");
    expect(tx.message.findMany).toHaveBeenCalledTimes(1);
  });

  it("keeps school-team reader state private in guardian history", async () => {
    const { tx, history } = setup();
    tx.message.findMany.mockResolvedValueOnce([
      {
        id: "message-six",
        sequence: 6,
        bodyEncrypted: "Could we talk?",
        createdAt: new Date("2026-10-08T10:05:00.000Z"),
        sender: {
          kind: "GUARDIAN",
          userId: "parent-a",
          user: { displayName: "Parent", name: null },
        },
      },
    ]);
    tx.messageDelivery.findMany.mockResolvedValueOnce([
      {
        messageId: "message-six",
        recipientParticipantId: "staff-participant",
        status: "READ",
      },
    ]);
    const page = await history.list("site-a", "parent-a", "conversation-a", {});
    expect(page.items[0].deliveryState).toBe("delivered");
  });

  it("denies an ended relationship before reading messages", async () => {
    const { tx, history } = setup();
    tx.guardianIdentity.findFirst.mockResolvedValueOnce(null);
    await expect(
      history.list("site-a", "parent-a", "conversation-a", {}),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.messageConversation.findFirst).not.toHaveBeenCalled();
    expect(tx.message.findMany).not.toHaveBeenCalled();
  });
});
