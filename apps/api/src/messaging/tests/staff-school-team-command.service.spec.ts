import "reflect-metadata";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { recordAuditEventInTransaction } from "../../audit/audit.service";
import { REQUIRED_PERMISSION } from "../../access-control/require-permission.decorator";
import { MessagingController } from "../messaging.controller";
import { StaffSchoolTeamCommandService } from "../staff-school-team-command.service";

jest.mock("@pathway/db", () => ({
  Prisma: { sql: jest.fn().mockReturnValue("message-sql") },
  withTenantRlsContext: jest.fn(),
}));
jest.mock("../../audit/audit.service", () => ({
  recordAuditEventInTransaction: jest.fn(),
}));

const actor = {
  tenantId: "a5a3fdf3-203a-456c-9966-8e012da355bc",
  orgId: "b7ad95ce-95b4-4ba8-a49f-bbb95c41077d",
  userId: "cbb92675-2d6d-4f86-9399-28bf4e842723",
};
const conversationId = "6a4f2c46-4b90-40bb-9ad9-a75b31ca7c51";
const input = {
  clientRequestId: "8949113e-3ad0-4171-bdbc-bdc8c99ea8df",
  body: "Thank you. We will call you today.",
};
const createdAt = new Date("2026-10-08T11:00:00.000Z");

function setup() {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    tenant: { findFirst: jest.fn().mockResolvedValue({ id: actor.tenantId }) },
    siteMembership: {
      findUnique: jest.fn().mockResolvedValue({ id: "member" }),
      findFirst: jest.fn().mockResolvedValue({ id: "responder" }),
    },
    studentIdentity: { findUnique: jest.fn().mockResolvedValue(null) },
    user: { findFirst: jest.fn().mockResolvedValue({ id: actor.userId }) },
    messageConversation: {
      findFirst: jest.fn().mockResolvedValue({
        guardianIdentityId: "guardian-identity",
        guardianIdentity: { userId: "guardian-user" },
        participants: [
          {
            id: "staff-participant",
            userId: actor.userId,
            kind: "STAFF",
            guardianIdentityId: null,
          },
          {
            id: "guardian-participant",
            userId: "guardian-user",
            kind: "GUARDIAN",
            guardianIdentityId: "guardian-identity",
          },
        ],
      }),
    },
    message: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: "message-id",
        sequence: 2,
        bodyEncrypted: input.body,
        createdAt,
      }),
    },
  };
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_tenant, _org, operation) =>
      operation(tx as never),
    );
  return { tx, service: new StaffSchoolTeamCommandService() };
}

describe("staff school-team reply", () => {
  beforeEach(() => jest.clearAllMocks());

  it("requires the typed message send permission", () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        MessagingController.prototype.schoolTeamSend,
      ),
    ).toBe("messaging.messages.send");
  });

  it("sends once to the conversation's current guardian and audits the message", async () => {
    const { tx, service } = setup();
    await expect(service.send(actor, conversationId, input)).resolves.toEqual({
      id: "message-id",
      conversationId,
      clientRequestId: input.clientRequestId,
      sequence: 2,
      body: input.body,
      createdAt: createdAt.toISOString(),
      reused: false,
    });
    expect(tx.messageConversation.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: actor.tenantId,
        id: conversationId,
        kind: "PARENT_STAFF",
        guardianIdentity: expect.objectContaining({ is: expect.any(Object) }),
      }),
      select: expect.any(Object),
    });
    expect(tx.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientRequestId: input.clientRequestId,
        bodyEncrypted: input.body,
        sender: { connect: { id: "staff-participant" } },
        deliveries: {
          create: [
            {
              tenant: { connect: { id: actor.tenantId } },
              recipientParticipant: {
                connect: { id: "guardian-participant" },
              },
            },
          ],
        },
      }),
      select: expect.any(Object),
    });
    expect(recordAuditEventInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actorUserId: actor.userId,
        metadata: { conversationId, sequence: 2 },
      }),
    );
  });

  it("reuses an identical request ID without writing again and rejects changed text", async () => {
    const { tx, service } = setup();
    tx.message.findFirst.mockResolvedValue({
      id: "message-id",
      sequence: 2,
      bodyEncrypted: input.body,
      createdAt,
    });
    await expect(
      service.send(actor, conversationId, input),
    ).resolves.toMatchObject({
      id: "message-id",
      reused: true,
    });
    await expect(
      service.send(actor, conversationId, { ...input, body: "Changed" }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.message.create).not.toHaveBeenCalled();
    expect(recordAuditEventInTransaction).not.toHaveBeenCalled();
  });

  it("denies a former responder or a missing current guardian participant", async () => {
    const { tx, service } = setup();
    tx.siteMembership.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.send(actor, conversationId, input),
    ).rejects.toBeInstanceOf(NotFoundException);
    tx.messageConversation.findFirst.mockResolvedValueOnce({
      guardianIdentityId: "guardian-identity",
      guardianIdentity: { userId: "guardian-user" },
      participants: [
        {
          id: "staff-participant",
          userId: actor.userId,
          kind: "STAFF",
          guardianIdentityId: null,
        },
        {
          id: "wrong-guardian",
          userId: "other-user",
          kind: "GUARDIAN",
          guardianIdentityId: "other-identity",
        },
      ],
    });
    await expect(
      service.send(actor, conversationId, input),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.message.create).not.toHaveBeenCalled();
  });
});
