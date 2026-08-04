import type { Prisma } from "@pathway/db";
import { getSystemRoleId } from "@pathway/db";
import { grantSystemRoleAssignment } from "../system-role-grant";
import { OutboxService } from "../../common/outbox/outbox.service";

function buildTx(options: {
  role?: { isActive: boolean; isSystem: boolean } | null;
  existingAssignment?: { id: string } | null;
} = {}) {
  const role =
    options.role === undefined
      ? { isActive: true, isSystem: true }
      : options.role;
  const existingAssignment =
    options.existingAssignment === undefined ? null : options.existingAssignment;

  return {
    $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
    orgRoleDefinition: {
      findUnique: jest.fn().mockResolvedValue(role),
    },
    userRoleAssignment: {
      findFirst: jest.fn().mockResolvedValue(existingAssignment),
      create: jest.fn().mockResolvedValue({ id: "assignment-1" }),
    },
    auditEvent: {
      create: jest.fn().mockResolvedValue({ id: "audit-1" }),
    },
    outboxEvent: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirstOrThrow: jest.fn().mockResolvedValue({ id: "outbox-1" }),
    },
  };
}

describe("grantSystemRoleAssignment", () => {
  it("returns no-template and writes nothing when the org's system role isn't seeded", async () => {
    const tx = buildTx({ role: null });
    const outbox = new OutboxService();

    const result = await grantSystemRoleAssignment(
      tx as unknown as Prisma.TransactionClient,
      outbox,
      {
        orgId: "org-1",
        tenantId: null,
        userId: "user-1",
        templateKey: "organisationHead",
        source: "test",
      },
    );

    expect(result).toBe("no-template");
    expect(tx.userRoleAssignment.create).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
    expect(tx.outboxEvent.createMany).not.toHaveBeenCalled();
  });

  it("returns no-template when the role exists but isn't active/system", async () => {
    const tx = buildTx({ role: { isActive: false, isSystem: true } });
    const result = await grantSystemRoleAssignment(
      tx as unknown as Prisma.TransactionClient,
      new OutboxService(),
      {
        orgId: "org-1",
        tenantId: null,
        userId: "user-1",
        templateKey: "organisationHead",
        source: "test",
      },
    );
    expect(result).toBe("no-template");
    expect(tx.userRoleAssignment.create).not.toHaveBeenCalled();
  });

  it("returns already-granted and writes nothing when an active assignment exists", async () => {
    const tx = buildTx({ existingAssignment: { id: "assignment-existing" } });
    const result = await grantSystemRoleAssignment(
      tx as unknown as Prisma.TransactionClient,
      new OutboxService(),
      {
        orgId: "org-1",
        tenantId: null,
        userId: "user-1",
        templateKey: "organisationHead",
        source: "test",
      },
    );
    expect(result).toBe("already-granted");
    expect(tx.userRoleAssignment.create).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
    expect(tx.outboxEvent.createMany).not.toHaveBeenCalled();
  });

  it("grants an org-scope Organisation Head assignment idempotently, with audit and outbox", async () => {
    const tx = buildTx();
    const outbox = new OutboxService();

    const result = await grantSystemRoleAssignment(
      tx as unknown as Prisma.TransactionClient,
      outbox,
      {
        orgId: "org-1",
        tenantId: null,
        userId: "user-1",
        templateKey: "organisationHead",
        source: "invite-accept",
      },
    );

    expect(result).toBe("granted");
    expect(tx.orgRoleDefinition.findUnique).toHaveBeenCalledWith({
      where: { id: getSystemRoleId("org-1", null, "organisationHead") },
      select: { isActive: true, isSystem: true },
    });
    // Org-scope grants set the RLS tenant context to empty string, matching
    // apps/api/scripts/backfill-org-head-assignments.ts.
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("app.tenant_id"),
      "",
    );
    expect(tx.userRoleAssignment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: "org-1",
        tenantId: null,
        userId: "user-1",
        roleDefinitionId: getSystemRoleId("org-1", null, "organisationHead"),
        assignedById: expect.any(String),
      }),
    });
    expect(tx.auditEvent.create).toHaveBeenCalledTimes(1);
    expect(tx.outboxEvent.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            aggregateType: "user-access",
            aggregateId: "user-1",
            eventType: "access.assignment.changed",
            idempotencyKey: "access-assignment:invite-accept:org-1:user-1",
          }),
        ],
      }),
    );
  });

  it("grants a site-scope Site Lead assignment against that site's tenantId", async () => {
    const tx = buildTx();
    const result = await grantSystemRoleAssignment(
      tx as unknown as Prisma.TransactionClient,
      new OutboxService(),
      {
        orgId: "org-1",
        tenantId: "site-1",
        userId: "user-1",
        templateKey: "siteLead",
        source: "invite-accept",
      },
    );

    expect(result).toBe("granted");
    expect(tx.orgRoleDefinition.findUnique).toHaveBeenCalledWith({
      where: { id: getSystemRoleId("org-1", "site-1", "siteLead") },
      select: { isActive: true, isSystem: true },
    });
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("app.tenant_id"),
      "site-1",
    );
    expect(tx.userRoleAssignment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: "org-1",
        tenantId: "site-1",
        roleDefinitionId: getSystemRoleId("org-1", "site-1", "siteLead"),
      }),
    });
  });
});
