import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import { prisma } from "@pathway/db";
import { AuditEntityType } from "../../audit/audit.types";
import { AccessControlModule } from "../access-control.module";
import { AccessAuditService } from "../access-audit.service";
import type { RoleActorContext } from "../roles.service";
import { isDatabaseAvailable, requireDatabase } from "../../../test-helpers.e2e";

describe("access-audit endpoint", () => {
  const orgA = randomUUID();
  const orgB = randomUUID();
  const orgAdminA = randomUUID();
  const nonAdminA = randomUUID();
  const orgIds = [orgA, orgB];
  const userIds = [orgAdminA, nonAdminA];
  const eventIds = {
    roleA: randomUUID(),
    assignmentA: randomUUID(),
    concernA: randomUUID(),
    roleB: randomUUID(),
  };

  const actorAdminA: RoleActorContext = {
    orgId: orgA,
    userId: orgAdminA,
    legacyOrgRoles: ["org:admin"],
    requestId: "access-audit-request-1",
  };
  const actorNonAdminA: RoleActorContext = {
    orgId: orgA,
    userId: nonAdminA,
    legacyOrgRoles: [],
    requestId: "access-audit-request-2",
  };

  let moduleRef: TestingModule | undefined;
  let service: AccessAuditService;

  beforeAll(async () => {
    if (!requireDatabase()) return;

    await prisma.user.createMany({
      data: userIds.map((id) => ({ id, email: `${id}@example.test` })),
    });
    await prisma.org.createMany({
      data: orgIds.map((id) => ({
        id,
        name: `Access audit org ${id}`,
        slug: `access-audit-${id}`,
        planCode: "trial",
      })),
    });
    await prisma.orgMembership.createMany({
      data: [
        { orgId: orgA, userId: orgAdminA, role: "ORG_ADMIN" },
        { orgId: orgA, userId: nonAdminA, role: "ORG_MEMBER" },
      ],
    });
    await prisma.orgVertical.createMany({
      data: orgIds.map((id) => ({ orgId: id, vertical: "ACE_SCHOOL" })),
    });
    await prisma.auditEvent.createMany({
      data: [
        {
          id: eventIds.roleA,
          orgId: orgA,
          actorUserId: orgAdminA,
          entityType: AuditEntityType.ORG_ROLE,
          action: "ROLE_CREATED",
          createdAt: new Date("2026-07-30T10:00:00.000Z"),
        },
        {
          id: eventIds.assignmentA,
          orgId: orgA,
          actorUserId: orgAdminA,
          entityType: AuditEntityType.ROLE_ASSIGNMENT,
          action: "ASSIGNMENT_CREATED",
          createdAt: new Date("2026-07-30T11:00:00.000Z"),
        },
        {
          id: eventIds.concernA,
          orgId: orgA,
          actorUserId: orgAdminA,
          entityType: AuditEntityType.CONCERN,
          action: "CREATED",
          createdAt: new Date("2026-07-30T12:00:00.000Z"),
        },
        {
          id: eventIds.roleB,
          orgId: orgB,
          actorUserId: orgAdminA,
          entityType: AuditEntityType.ORG_ROLE,
          action: "ROLE_CREATED",
          createdAt: new Date("2026-07-30T13:00:00.000Z"),
        },
      ],
    });

    moduleRef = await Test.createTestingModule({
      imports: [AccessControlModule],
    }).compile();
    service = moduleRef.get(AccessAuditService);
  });

  afterAll(async () => {
    if (!isDatabaseAvailable()) return;
    await prisma.auditEvent.deleteMany({ where: { id: { in: Object.values(eventIds) } } });
    await prisma.orgMembership.deleteMany({ where: { orgId: { in: orgIds } } });
    await prisma.orgVertical.deleteMany({ where: { orgId: { in: orgIds } } });
    await prisma.org.deleteMany({ where: { id: { in: orgIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await moduleRef?.close();
  });

  it("denies an actor without organisation-admin authority", async () => {
    if (!isDatabaseAvailable()) return;

    await expect(service.list(actorNonAdminA)).rejects.toMatchObject({
      response: { statusCode: 403, code: "AUDIT_API_ACCESS_DENIED" },
    });
  });

  it("returns only role and assignment events for the actor's own organisation, never CONCERN or another org's rows", async () => {
    if (!isDatabaseAvailable()) return;

    const result = await service.list(actorAdminA);

    expect(result.items.map((item) => item.id)).toEqual([
      eventIds.assignmentA,
      eventIds.roleA,
    ]);
    expect(result.items.every((item) => item.entityType !== "CONCERN")).toBe(true);
  });

  it("filters to a single caller-selected entity type", async () => {
    if (!isDatabaseAvailable()) return;

    const result = await service.list(actorAdminA, { entityType: "ORG_ROLE" });

    expect(result.items.map((item) => item.id)).toEqual([eventIds.roleA]);
  });
});
