import { AuditEntityType } from "../../audit/audit.types";
import { AccessAuditService } from "../access-audit.service";
import { encodeCreatedAtIdCursor } from "../cursor";
import type { RoleActorContext, RolesTransactionBoundary } from "../roles.service";

const actor: RoleActorContext = {
  orgId: "org-1",
  tenantId: "site-1",
  userId: "actor-1",
  legacyOrgRoles: ["org:admin"],
  requestId: "access-audit-request-1",
};

const allowedTx = {
  orgMembership: { findUnique: jest.fn().mockResolvedValue({ role: "ORG_ADMIN" }) },
  permissionDefinition: { findUnique: jest.fn().mockResolvedValue({ isActive: true }) },
  orgVertical: { findUnique: jest.fn().mockResolvedValue({ vertical: "ACE_SCHOOL" }) },
  orgModule: { findMany: jest.fn().mockResolvedValue([]) },
};

function serviceWith(tx: object) {
  const transaction: RolesTransactionBoundary = {
    run: async (_actor, operation) => operation(tx as never),
  };
  return new AccessAuditService(transaction);
}

const events = [
  {
    id: "event-2",
    createdAt: new Date("2026-07-30T12:00:00.000Z"),
    tenantId: null,
    actorUserId: "actor-1",
    entityType: AuditEntityType.ROLE_ASSIGNMENT,
    entityId: "assignment-1",
    action: "ASSIGNMENT_CREATED",
    metadata: null,
  },
  {
    id: "event-1",
    createdAt: new Date("2026-07-30T11:00:00.000Z"),
    tenantId: null,
    actorUserId: "actor-1",
    entityType: AuditEntityType.ORG_ROLE,
    entityId: "role-1",
    action: "ROLE_CREATED",
    metadata: null,
  },
];

describe("AccessAuditService", () => {
  it("denies an actor who lacks audit-read authority", async () => {
    const service = serviceWith({
      orgMembership: { findUnique: jest.fn().mockResolvedValue({ role: "STAFF" }) },
    });

    await expect(service.list(actor)).rejects.toMatchObject({
      response: { statusCode: 403, code: "AUDIT_API_ACCESS_DENIED" },
    });
  });

  it("defaults to role and assignment entity types and returns a stable page", async () => {
    const findMany = jest.fn().mockResolvedValue(events);
    const service = serviceWith({ ...allowedTx, auditEvent: { findMany } });

    const result = await service.list(actor);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          orgId: "org-1",
          entityType: { in: [AuditEntityType.ORG_ROLE, AuditEntityType.ROLE_ASSIGNMENT] },
        },
      }),
    );
    expect(result).toEqual({
      items: events,
      nextCursor: null,
    });
  });

  it("restricts entityType to a single caller-selected allowed value", async () => {
    const findMany = jest.fn().mockResolvedValue([events[1]]);
    const service = serviceWith({ ...allowedTx, auditEvent: { findMany } });

    await service.list(actor, { entityType: "ORG_ROLE" });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          entityType: { in: ["ORG_ROLE"] },
        }),
      }),
    );
  });

  it("rejects a malformed cursor", async () => {
    const service = serviceWith(allowedTx);

    await expect(
      service.list(actor, { cursor: "not-a-valid-cursor!!" }),
    ).rejects.toMatchObject({
      response: { statusCode: 400, code: "INVALID_AUDIT_REQUEST" },
    });
  });

  it("emits a nextCursor when more rows remain beyond the page limit", async () => {
    const findMany = jest.fn().mockResolvedValue([events[0], events[1]]);
    const service = serviceWith({ ...allowedTx, auditEvent: { findMany } });

    const result = await service.list(actor, { limit: 1 });

    expect(result.items).toEqual([events[0]]);
    expect(result.nextCursor).toBe(
      encodeCreatedAtIdCursor({ createdAt: events[0].createdAt, id: events[0].id }),
    );
  });
});
