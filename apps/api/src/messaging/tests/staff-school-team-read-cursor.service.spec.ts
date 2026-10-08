import "reflect-metadata";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { REQUIRED_PERMISSION } from "../../access-control/require-permission.decorator";
import { MessagingController } from "../messaging.controller";
import { advanceMessageReadCursor } from "../messaging-read-cursor";
import { StaffSchoolTeamReadCursorService } from "../staff-school-team-read-cursor.service";

jest.mock("@pathway/db", () => ({ withTenantRlsContext: jest.fn() }));
jest.mock("../messaging-read-cursor", () => ({
  advanceMessageReadCursor: jest.fn(),
}));

const actor = {
  tenantId: "a5a3fdf3-203a-456c-9966-8e012da355bc",
  orgId: "b7ad95ce-95b4-4ba8-a49f-bbb95c41077d",
  userId: "cbb92675-2d6d-4f86-9399-28bf4e842723",
};
const conversationId = "6a4f2c46-4b90-40bb-9ad9-a75b31ca7c51";

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
      findFirst: jest.fn().mockResolvedValue({
        participants: [{ id: "staff-participant" }],
      }),
    },
    message: { findFirst: jest.fn().mockResolvedValue({ id: "message" }) },
  };
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_tenant, _org, operation) =>
      operation(tx as never),
    );
  jest
    .mocked(advanceMessageReadCursor)
    .mockResolvedValue({ lastReadSequence: 3 });
  return { tx, service: new StaffSchoolTeamReadCursorService() };
}

describe("staff school-team read cursor", () => {
  beforeEach(() => jest.clearAllMocks());

  it("requires the typed message read permission", () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        MessagingController.prototype.schoolTeamReadCursor,
      ),
    ).toBe("messaging.messages.read");
  });

  it("advances only the caller's current participant after scoped conversation and sequence checks", async () => {
    const { tx, service } = setup();

    await expect(
      service.advance(actor, conversationId, { sequence: 3 }),
    ).resolves.toEqual({ lastReadSequence: 3 });

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
      select: {
        participants: {
          where: {
            tenantId: actor.tenantId,
            userId: actor.userId,
            kind: "STAFF",
            removedAt: null,
          },
          select: { id: true },
          take: 1,
        },
      },
    });
    expect(tx.message.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: actor.tenantId,
        conversationId,
        sequence: 3,
      },
      select: { id: true },
    });
    expect(advanceMessageReadCursor).toHaveBeenCalledWith(
      tx,
      actor.tenantId,
      conversationId,
      "staff-participant",
      3,
    );
  });

  it("does not inspect messages after responder access ends", async () => {
    const { tx, service } = setup();
    tx.siteMembership.findFirst.mockResolvedValue(null);
    await expect(
      service.advance(actor, conversationId, { sequence: 3 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.messageConversation.findFirst).not.toHaveBeenCalled();
    expect(advanceMessageReadCursor).not.toHaveBeenCalled();
  });

  it("hides an out-of-scope conversation or removed staff participant", async () => {
    const { tx, service } = setup();
    tx.messageConversation.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.advance(actor, conversationId, { sequence: 3 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    tx.messageConversation.findFirst.mockResolvedValueOnce({
      participants: [],
    });
    await expect(
      service.advance(actor, conversationId, { sequence: 3 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.message.findFirst).not.toHaveBeenCalled();
    expect(advanceMessageReadCursor).not.toHaveBeenCalled();
  });

  it("rejects a sequence absent from the scoped conversation", async () => {
    const { tx, service } = setup();
    tx.message.findFirst.mockResolvedValue(null);
    await expect(
      service.advance(actor, conversationId, { sequence: 3 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(advanceMessageReadCursor).not.toHaveBeenCalled();
  });
});
