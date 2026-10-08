import "reflect-metadata";
import { NotFoundException } from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { REQUIRED_PERMISSION } from "../../access-control/require-permission.decorator";
import { MessagingController } from "../messaging.controller";
import { StaffSchoolTeamHistoryService } from "../staff-school-team-history.service";

jest.mock("@pathway/db", () => ({
  withTenantRlsContext: jest.fn(),
}));

const actor = {
  tenantId: "a5a3fdf3-203a-456c-9966-8e012da355bc",
  orgId: "b7ad95ce-95b4-4ba8-a49f-bbb95c41077d",
  userId: "cbb92675-2d6d-4f86-9399-28bf4e842723",
};
const conversationId = "6a4f2c46-4b90-40bb-9ad9-a75b31ca7c51";
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
    messageConversation: {
      findFirst: jest.fn().mockResolvedValue({ id: conversationId }),
    },
    message: { findMany: jest.fn().mockResolvedValue([]) },
  };
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_tenant, _org, operation) =>
      operation(tx as never),
    );
  return { tx, service: new StaffSchoolTeamHistoryService() };
}

describe("staff school-team message history", () => {
  beforeEach(() => jest.clearAllMocks());

  it("requires the typed message read permission", () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        MessagingController.prototype.schoolTeamMessages,
      ),
    ).toBe("messaging.messages.read");
  });

  it("reads a bounded page only after checking the current responder and guardian scope", async () => {
    const { tx, service } = setup();
    tx.message.findMany.mockResolvedValue([
      {
        id: "first",
        sequence: 4,
        bodyEncrypted: "A family message",
        createdAt: time,
        sender: {
          kind: "GUARDIAN",
          userId: "guardian",
          user: { displayName: null, name: null },
        },
      },
      { id: "next", sequence: 3 },
    ]);

    const result = await service.list(actor, conversationId, {
      limit: 1,
      before: 5,
    });

    expect(result).toEqual({
      items: [
        {
          id: "first",
          sequence: 4,
          body: "A family message",
          createdAt: time.toISOString(),
          sender: { id: "guardian", displayName: "Parent" },
        },
      ],
      nextBefore: 4,
    });
    expect(tx.messageConversation.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: conversationId,
        tenantId: actor.tenantId,
        kind: "PARENT_STAFF",
        guardianIdentity: {
          is: expect.objectContaining({
            relationships: {
              some: expect.objectContaining({
                legalAccess: "FULL",
                endedAt: null,
                revokedAt: null,
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
      select: { id: true },
    });
    expect(tx.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: actor.tenantId,
          conversationId,
          sequence: { lt: 5 },
        },
        take: 2,
      }),
    );
  });

  it("does not query messages without a current portal and responder", async () => {
    const { tx, service } = setup();
    tx.siteMembership.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.list(actor, conversationId, {}),
    ).rejects.toBeInstanceOf(NotFoundException);
    tx.tenant.findFirst
      .mockResolvedValueOnce({ id: actor.tenantId })
      .mockResolvedValueOnce(null);
    await expect(
      service.list(actor, conversationId, {}),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.messageConversation.findFirst).not.toHaveBeenCalled();
    expect(tx.message.findMany).not.toHaveBeenCalled();
  });

  it("hides a thread outside the scoped conversation query", async () => {
    const { tx, service } = setup();
    tx.messageConversation.findFirst.mockResolvedValue(null);
    await expect(
      service.list(actor, conversationId, {}),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.message.findMany).not.toHaveBeenCalled();
  });
});
