import { HttpException } from "@nestjs/common";
import { AccessTagKey, Vertical, type Prisma } from "@prisma/client";
import { OutboxService } from "../../common/outbox/outbox.service";
import { AccessTagsService } from "../access-tags.service";
import type {
  RoleActorContext,
  RolesTransactionBoundary,
} from "../roles.service";

const actor: RoleActorContext = {
  orgId: "org-1",
  tenantId: "site-1",
  userId: "head-1",
  legacyOrgRoles: [],
  requestId: "grant-request-1",
};
const recipientId = "staff-1";
const tagKey = AccessTagKey.ATTENDANCE_RECORDER;

function createHarness() {
  const grant = {
    id: "grant-1",
    orgId: actor.orgId,
    tenantId: actor.tenantId,
    userId: recipientId,
    tagKey,
    grantedById: actor.userId,
    startsAt: new Date("2026-10-06T09:00:00Z"),
    expiresAt: null,
    revokedAt: null,
    revokedById: null,
    createdAt: new Date("2026-10-06T09:00:00Z"),
  };
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    orgMembership: {
      findUnique: jest.fn().mockResolvedValue({ id: "membership" }),
    },
    siteMembership: {
      findUnique: jest.fn().mockResolvedValue({ id: "site-membership" }),
    },
    userRoleAssignment: {
      findFirst: jest.fn().mockResolvedValue({ id: "head-assignment" }),
      findMany: jest.fn().mockResolvedValue([
        {
          roleDefinition: {
            permissions: [{ permissionKey: "attendance.manage" }],
          },
        },
      ]),
    },
    accessTagGrant: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue(grant),
      update: jest.fn().mockResolvedValue(grant),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    permissionDefinition: {
      findMany: jest.fn().mockResolvedValue([
        {
          key: "attendance.manage",
          scope: "site",
          delegable: true,
          isActive: true,
        },
      ]),
    },
    orgVertical: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ vertical: Vertical.ACE_SCHOOL }),
    },
    orgModule: { findMany: jest.fn().mockResolvedValue([]) },
    auditEvent: { create: jest.fn().mockResolvedValue({ id: "audit-1" }) },
    outboxEvent: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirstOrThrow: jest.fn().mockResolvedValue({ id: "outbox-1" }),
    },
  };
  const transaction: RolesTransactionBoundary = {
    run: async (_actor, operation) =>
      operation(tx as unknown as Prisma.TransactionClient),
  };
  return {
    grant,
    tx,
    service: new AccessTagsService(transaction, new OutboxService()),
  };
}

async function deniedCode(operation: Promise<unknown>): Promise<string> {
  try {
    await operation;
  } catch (error) {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (
        typeof response === "object" &&
        response !== null &&
        "code" in response
      ) {
        return String(response.code);
      }
    }
    throw error;
  }
  throw new Error("Expected access-tag operation to be denied");
}

describe("AccessTagsService", () => {
  it("records grant and revocation with audit and outbox intent", async () => {
    const { service, tx, grant } = createHarness();
    tx.accessTagGrant.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(grant);

    await expect(
      service.grant(
        {
          userId: recipientId,
          tagKey: "attendance-recorder",
          scope: "site",
        },
        actor,
      ),
    ).resolves.toMatchObject({ id: grant.id, tagKey: "attendance-recorder" });
    await expect(service.revoke(grant.id, actor)).resolves.toMatchObject({
      id: grant.id,
      revokedById: actor.userId,
    });

    expect(tx.accessTagGrant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: actor.orgId,
        tenantId: actor.tenantId,
        userId: recipientId,
        tagKey,
        grantedById: actor.userId,
      }),
    });
    expect(tx.auditEvent.create).toHaveBeenCalledTimes(2);
    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: "ACCESS_TAG_GRANT",
        entityId: grant.id,
        action: "CREATED",
        orgId: actor.orgId,
        tenantId: actor.tenantId,
      }),
    });
    expect(tx.outboxEvent.createMany).toHaveBeenCalledTimes(2);
    expect(tx.outboxEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          aggregateId: recipientId,
          eventType: "access.tag.changed",
          payload: expect.objectContaining({
            action: "revoked",
            grantId: grant.id,
          }),
        }),
      ],
      skipDuplicates: true,
    });
  });

  it("rejects duplicate active grants without writing audit or outbox", async () => {
    const { service, tx, grant } = createHarness();
    tx.accessTagGrant.findFirst.mockResolvedValue(grant);
    await expect(
      deniedCode(
        service.grant(
          {
            userId: recipientId,
            tagKey: "attendance-recorder",
            scope: "site",
          },
          actor,
        ),
      ),
    ).resolves.toBe("ACCESS_TAG_ALREADY_GRANTED");
    expect(tx.accessTagGrant.create).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it("regrants after an expired row has been revoked for history", async () => {
    const { service, tx, grant } = createHarness();
    tx.accessTagGrant.findFirst.mockResolvedValue({
      ...grant,
      expiresAt: new Date("2020-01-01T00:00:00Z"),
    });
    await expect(
      service.grant(
        {
          userId: recipientId,
          tagKey: "attendance-recorder",
          scope: "site",
        },
        actor,
      ),
    ).resolves.toMatchObject({ id: grant.id });
    expect(tx.accessTagGrant.update).toHaveBeenCalledWith({
      where: { id: grant.id },
      data: { revokedAt: expect.any(Date), revokedById: actor.userId },
    });
    expect(tx.auditEvent.create).toHaveBeenCalledTimes(2);
  });

  it("bounds pagination even when called without the controller", async () => {
    const { service, tx } = createHarness();
    await expect(deniedCode(service.list(actor, { limit: 51 }))).resolves.toBe(
      "INVALID_ACCESS_TAG_REQUEST",
    );
    expect(tx.accessTagGrant.findMany).not.toHaveBeenCalled();
  });
});
