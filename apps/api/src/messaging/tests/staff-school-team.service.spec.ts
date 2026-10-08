import "reflect-metadata";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { REQUIRED_PERMISSION } from "../../access-control/require-permission.decorator";
import { MessagingController } from "../messaging.controller";
import { encodeConversationCursor } from "../messaging-cursor";
import { StaffSchoolTeamService } from "../staff-school-team.service";

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

const actor = {
  tenantId: "a5a3fdf3-203a-456c-9966-8e012da355bc",
  orgId: "b7ad95ce-95b4-4ba8-a49f-bbb95c41077d",
  userId: "cbb92675-2d6d-4f86-9399-28bf4e842723",
};
const conversationId = "6a4f2c46-4b90-40bb-9ad9-a75b31ca7c51";
const nextId = "dc38fce0-f705-4df0-ab5c-60f36f8f07fa";
const time = new Date("2026-10-08T10:00:00.000Z");

function setup() {
  const tx = {
    tenant: { findFirst: jest.fn().mockResolvedValue({ id: actor.tenantId }) },
    siteMembership: {
      findUnique: jest.fn().mockResolvedValue({ id: "member" }),
      findFirst: jest.fn().mockResolvedValue({ id: "responder" }),
    },
    studentIdentity: { findUnique: jest.fn().mockResolvedValue(null) },
    user: { findFirst: jest.fn().mockResolvedValue({ id: actor.userId }) },
    messageConversation: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_tenant, _org, operation) =>
      operation(tx as never),
    );
  return { tx, service: new StaffSchoolTeamService() };
}

describe("staff school-team inbox", () => {
  beforeEach(() => jest.clearAllMocks());

  it("requires the typed read permission", () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        MessagingController.prototype.schoolTeamConversations,
      ),
    ).toBe("messaging.conversations.read");
  });

  it("lists bounded active guardian threads for a current approved responder", async () => {
    const { tx, service } = setup();
    tx.messageConversation.findMany.mockResolvedValue([
      {
        id: conversationId,
        kind: "PARENT_STAFF",
        updatedAt: time,
        guardianIdentity: {
          user: { displayName: "Jordan Smith", name: null },
        },
        messages: [{ bodyEncrypted: "Please call me", createdAt: time }],
      },
      { id: nextId, updatedAt: time },
    ]);
    tx.$queryRaw.mockResolvedValue([{ conversationId, unreadCount: 2n }]);

    const result = await service.list(actor, { limit: 1 });

    expect(result.items).toEqual([
      {
        id: conversationId,
        kind: "PARENT_STAFF",
        title: "Jordan Smith",
        latestMessage: {
          preview: "Please call me",
          createdAt: time.toISOString(),
        },
        updatedAt: time.toISOString(),
        unreadCount: 2,
      },
    ]);
    expect(result.nextCursor).toEqual(expect.any(String));
    expect(tx.siteMembership.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: actor.tenantId,
        userId: actor.userId,
        user: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ accessTagGrants: expect.any(Object) }),
          ]),
        }),
      }),
      select: { id: true },
    });
    expect(tx.messageConversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: actor.tenantId,
          kind: "PARENT_STAFF",
          guardianIdentity: {
            is: expect.objectContaining({
              tenantId: actor.tenantId,
              relationships: {
                some: expect.objectContaining({
                  legalAccess: "FULL",
                  endedAt: null,
                  revokedAt: null,
                  child: { tenantId: actor.tenantId, isGuest: false },
                }),
              },
            }),
          },
          AND: expect.arrayContaining([
            {
              participants: {
                some: {
                  tenantId: actor.tenantId,
                  userId: actor.userId,
                  kind: "STAFF",
                  removedAt: null,
                },
              },
            },
          ]),
        }),
        take: 2,
      }),
    );
    expect(Prisma.join).toHaveBeenCalledWith([conversationId]);
  });

  it("hides the inbox when the portal or responder access ends", async () => {
    const { tx, service } = setup();
    tx.siteMembership.findFirst.mockResolvedValueOnce(null);
    await expect(service.list(actor, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.messageConversation.findMany).not.toHaveBeenCalled();

    tx.tenant.findFirst
      .mockResolvedValueOnce({ id: actor.tenantId })
      .mockResolvedValueOnce(null);
    await expect(service.list(actor, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.messageConversation.findMany).not.toHaveBeenCalled();
  });

  it("does not query unread messages for an empty page", async () => {
    const { tx, service } = setup();
    await expect(service.list(actor, {})).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it("rejects a staff-list cursor or one reused after a site switch", async () => {
    const { tx, service } = setup();
    const cursor = encodeConversationCursor(
      { updatedAt: time, id: conversationId },
      actor.tenantId,
      actor.userId,
    );
    await expect(service.list(actor, { cursor })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const schoolCursor = encodeConversationCursor(
      { updatedAt: time, id: conversationId },
      actor.tenantId,
      actor.userId,
      "school-team-conversations",
    );
    await expect(
      service.list({ ...actor, tenantId: nextId }, { cursor: schoolCursor }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.messageConversation.findMany).not.toHaveBeenCalled();
  });
});
