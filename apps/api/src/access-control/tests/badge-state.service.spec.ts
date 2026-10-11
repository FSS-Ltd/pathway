import { AccessTagKey, type Prisma } from "@prisma/client";
import { BadgeStateService } from "../badge-state.service";
import { OutboxService } from "../../common/outbox/outbox.service";
import type { RolesTransactionBoundary } from "../roles.service";

const actor = {
  orgId: "org-1",
  tenantId: "site-1",
  userId: "head-1",
  legacyOrgRoles: [],
  requestId: "request-1",
};

function fixture() {
  const exclusion = {
    id: "exclusion-1",
    orgId: actor.orgId,
    tenantId: actor.tenantId,
    userId: "staff-1",
    tagKey: AccessTagKey.ATTENDANCE_RECORDER,
    excludedById: actor.userId,
    createdAt: new Date(),
    revokedAt: null,
    revokedById: null,
  };
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    userRoleAssignment: {
      findFirst: jest.fn().mockResolvedValue({ id: "head-role" }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    orgMembership: {
      findUnique: jest.fn().mockResolvedValue({ id: "membership" }),
    },
    siteMembership: {
      findUnique: jest.fn().mockResolvedValue({ id: "site-member" }),
    },
    accessTagGrant: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({ id: "grant-new" }),
    },
    accessTagExclusion: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue(exclusion),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    auditEvent: { create: jest.fn().mockResolvedValue({ id: "audit-1" }) },
    outboxEvent: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue(null),
      findFirstOrThrow: jest.fn().mockResolvedValue({ id: "outbox-1" }),
    },
  };
  const transaction: RolesTransactionBoundary = {
    run: async (_actor, operation) =>
      operation(tx as unknown as Prisma.TransactionClient),
  };
  return {
    tx,
    exclusion,
    service: new BadgeStateService(transaction, new OutboxService()),
  };
}

describe("BadgeStateService", () => {
  it("creates a scoped exclusion and records an audited access change", async () => {
    const { tx, service } = fixture();
    const result = await service.set(actor, {
      userId: "staff-1",
      tagKey: "attendance-recorder",
      scope: "site",
      state: "excluded",
      expectedRevision: "",
    });

    expect(result.state).toBe("excluded");
    expect(tx.accessTagExclusion.create).toHaveBeenCalledTimes(1);
    expect(tx.auditEvent.create).toHaveBeenCalledTimes(1);
    expect(tx.outboxEvent.createMany).toHaveBeenCalledTimes(1);
  });

  it("rejects a stale revision without writing", async () => {
    const { tx, service } = fixture();
    await expect(
      service.set(actor, {
        userId: "staff-1",
        tagKey: "attendance-recorder",
        scope: "site",
        state: "excluded",
        expectedRevision: "old-revision",
      }),
    ).rejects.toThrow();
    expect(tx.accessTagExclusion.create).not.toHaveBeenCalled();
  });

  it("rejects badge changes for an active platform superuser", async () => {
    const { tx, service } = fixture();
    tx.orgMembership.findUnique
      .mockResolvedValueOnce({ id: "head-membership" })
      .mockResolvedValueOnce({
        id: "membership",
        user: { superUser: true, isActive: true },
      });
    await expect(
      service.set(actor, {
        userId: "staff-1",
        tagKey: "attendance-recorder",
        scope: "site",
        state: "excluded",
        expectedRevision: "",
      }),
    ).rejects.toThrow();
    expect(tx.accessTagExclusion.create).not.toHaveBeenCalled();
  });

  it("treats a repeated exclusion as an idempotent success", async () => {
    const { tx, exclusion, service } = fixture();
    tx.accessTagExclusion.findMany.mockResolvedValue([exclusion]);
    tx.outboxEvent.findFirst.mockResolvedValue({
      payload: { revision: "e:exclusion-1" },
    });
    const result = await service.set(actor, {
      userId: "staff-1",
      tagKey: "attendance-recorder",
      scope: "site",
      state: "excluded",
      expectedRevision: "",
    });
    expect(result.state).toBe("excluded");
    expect(tx.accessTagExclusion.create).not.toHaveBeenCalled();
  });

  it("replaces an expired grant when enabling the badge", async () => {
    const { tx, service } = fixture();
    tx.accessTagGrant.findMany.mockResolvedValueOnce([
      {
        id: "expired-grant",
        startsAt: new Date("2020-01-01"),
        expiresAt: new Date("2020-02-01"),
      },
    ]);
    tx.userRoleAssignment.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          roleDefinition: {
            permissions: [{ permissionKey: "attendance.manage" }],
          },
        },
      ]);
    Object.assign(tx, {
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
        findUnique: jest.fn().mockResolvedValue({ vertical: "ACE_SCHOOL" }),
      },
      orgModule: { findMany: jest.fn().mockResolvedValue([]) },
    });
    const result = await service.set(actor, {
      userId: "staff-1",
      tagKey: "attendance-recorder",
      scope: "site",
      state: "enabled",
      expectedRevision: "",
    });
    expect(result.state).toBe("enabled");
    expect(tx.accessTagGrant.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.accessTagGrant.create).toHaveBeenCalledTimes(1);
  });

  it("does not duplicate an organisation grant in site scope", async () => {
    const { tx, service } = fixture();
    tx.accessTagGrant.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: "org-grant",
        tenantId: null,
        startsAt: new Date("2020-01-01"),
        expiresAt: null,
      },
    ]);
    const result = await service.set(actor, {
      userId: "staff-1",
      tagKey: "attendance-recorder",
      scope: "site",
      state: "enabled",
      expectedRevision: "",
    });
    expect(result.revision).toBe("");
    expect(tx.accessTagGrant.create).not.toHaveBeenCalled();
  });
});
