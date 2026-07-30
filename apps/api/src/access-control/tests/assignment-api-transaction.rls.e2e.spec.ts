import { randomUUID } from "node:crypto";
import { prisma, runTransaction } from "@pathway/db";
import { AccessCacheService } from "../access-cache.service";
import { RoleSafetyService } from "../role-safety.service";
import { AssignmentsService } from "../assignments.service";
import {
  createRolesTransactionBoundary,
  type RoleActorContext,
} from "../roles.service";
import { OutboxService } from "../../common/outbox/outbox.service";
import {
  isDatabaseAvailable,
  requireDatabase,
} from "../../../test-helpers.e2e";

const ORG_ID = process.env.E2E_ORG_ID as string;
const SITE_ID = process.env.E2E_TENANT_ID as string;
const SECOND_SITE_ID = process.env.E2E_TENANT2_ID as string;
const RLS_ROLE = "pathway_e2e_rls";
const OUTBOX_DENIED_ROLE = "pathway_e2e_outbox_denied";

function transactionBoundary(roleName = RLS_ROLE) {
  return createRolesTransactionBoundary(async (operation) =>
    runTransaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE "${roleName}"`);
      return operation(tx);
    }),
  );
}

async function expectDatabaseRejection(
  operation: () => Promise<unknown>,
  postgresCode: string,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2010"
    ) {
      expect(error).toMatchObject({ meta: { code: postgresCode } });
    } else {
      expect(error).toMatchObject({
        message: expect.stringContaining(
          `PostgresError { code: "${postgresCode}"`,
        ),
      });
    }
    return;
  }
  throw new Error("Expected the database operation to be rejected");
}

describe("assignment API transaction and forced-RLS integration", () => {
  const actorUserId = randomUUID();
  const assigneeUserId = randomUUID();
  const roleDefinitionId = randomUUID();
  const secondSiteRoleDefinitionId = randomUUID();
  const secondSiteAssignmentId = randomUUID();
  const originalOrgVerticalNotCaptured = Symbol(
    "originalOrgVerticalNotCaptured",
  );
  let originalOrgVertical:
    | Awaited<ReturnType<typeof prisma.orgVertical.findUnique>>
    | typeof originalOrgVerticalNotCaptured = originalOrgVerticalNotCaptured;
  const actor: RoleActorContext = {
    orgId: ORG_ID,
    tenantId: SITE_ID,
    userId: actorUserId,
    legacyOrgRoles: ["org:admin"],
    requestId: `assignment-api-${randomUUID()}`,
  };
  const outbox = new OutboxService();
  const service = new AssignmentsService(
    transactionBoundary(),
    outbox,
    new AccessCacheService(),
    new RoleSafetyService(),
  );

  beforeAll(async () => {
    if (!requireDatabase()) return;
    originalOrgVertical = await prisma.orgVertical.findUnique({
      where: { orgId: ORG_ID },
    });
    await prisma.user.createMany({
      data: [
        {
          id: actorUserId,
          email: `${actorUserId}@assignment-api.test`,
        },
        {
          id: assigneeUserId,
          email: `${assigneeUserId}@assignment-api.test`,
        },
      ],
    });
    await prisma.orgMembership.createMany({
      data: [
        { orgId: ORG_ID, userId: actorUserId, role: "ORG_ADMIN" },
        { orgId: ORG_ID, userId: assigneeUserId, role: "ORG_MEMBER" },
      ],
    });
    await prisma.orgVertical.upsert({
      where: { orgId: ORG_ID },
      update: { vertical: "ACE_SCHOOL" },
      create: { orgId: ORG_ID, vertical: "ACE_SCHOOL" },
    });
    await prisma.orgRoleDefinition.create({
      data: {
        id: roleDefinitionId,
        orgId: ORG_ID,
        tenantId: SITE_ID,
        name: `Assignment API role ${roleDefinitionId}`,
        scope: "site",
        createdById: actorUserId,
        updatedById: actorUserId,
      },
    });
    await prisma.orgRoleDefinition.create({
      data: {
        id: secondSiteRoleDefinitionId,
        orgId: ORG_ID,
        tenantId: SECOND_SITE_ID,
        name: `Assignment API second-site role ${secondSiteRoleDefinitionId}`,
        scope: "site",
        createdById: actorUserId,
        updatedById: actorUserId,
      },
    });
    await prisma.userRoleAssignment.create({
      data: {
        id: secondSiteAssignmentId,
        orgId: ORG_ID,
        tenantId: SECOND_SITE_ID,
        userId: assigneeUserId,
        roleDefinitionId: secondSiteRoleDefinitionId,
        assignedById: actorUserId,
        startsAt: new Date("2026-07-01T00:00:00.000Z"),
      },
    });
  });

  afterAll(async () => {
    if (!isDatabaseAvailable()) return;
    try {
      await prisma.outboxEvent.deleteMany({
        where: { aggregateId: assigneeUserId },
      });
      await prisma.auditEvent.deleteMany({
        where: { actorUserId, entityType: "ROLE_ASSIGNMENT" },
      });
      await prisma.userRoleAssignment.deleteMany({
        where: {
          roleDefinitionId: {
            in: [roleDefinitionId, secondSiteRoleDefinitionId],
          },
        },
      });
      await prisma.orgRoleDefinition.deleteMany({
        where: { id: { in: [roleDefinitionId, secondSiteRoleDefinitionId] } },
      });
      await prisma.orgMembership.deleteMany({
        where: { userId: { in: [actorUserId, assigneeUserId] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [actorUserId, assigneeUserId] } },
      });
    } finally {
      if (originalOrgVertical !== originalOrgVerticalNotCaptured) {
        if (originalOrgVertical) {
          await prisma.orgVertical.update({
            where: { id: originalOrgVertical.id },
            data: { vertical: originalOrgVertical.vertical },
          });
        } else {
          await prisma.orgVertical.deleteMany({ where: { orgId: ORG_ID } });
        }
      }
    }
  });

  it("commits assignment, correlated audit, and one idempotent outbox event together", async () => {
    if (!isDatabaseAvailable()) return;

    const [assignment] = await service.assign(
      [
        {
          userId: assigneeUserId,
          roleDefinitionId,
          orgId: ORG_ID,
          tenantId: SITE_ID,
          startsAt: new Date("2026-07-29T09:00:00.000Z"),
          expiresAt: new Date("2026-07-29T10:00:00.000Z"),
        },
      ],
      actor,
    );

    await transactionBoundary().run(actor, async (tx) => {
      const [persisted, audits, events] = await Promise.all([
        tx.userRoleAssignment.findMany({ where: { id: assignment.id } }),
        tx.auditEvent.findMany({ where: { entityId: assignment.id } }),
        tx.outboxEvent.findMany({
          where: {
            aggregateId: assigneeUserId,
            idempotencyKey: {
              contains: assignment.id,
            },
          },
        }),
      ]);
      expect(persisted).toHaveLength(1);
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        action: "ASSIGNMENT_CREATED",
        metadata: expect.objectContaining({ requestId: actor.requestId }),
      });
      expect(events).toHaveLength(1);

      const duplicate = await outbox.enqueue(tx, {
        aggregateType: events[0].aggregateType,
        aggregateId: events[0].aggregateId,
        eventType: events[0].eventType,
        payload: { duplicate: true },
        idempotencyKey: events[0].idempotencyKey,
      });
      expect(duplicate.id).toBe(events[0].id);
      await expect(
        tx.outboxEvent.count({
          where: { idempotencyKey: events[0].idempotencyKey },
        }),
      ).resolves.toBe(1);
    });
  });

  it("lists assignments across the organisation only after R09 bootstrap succeeds", async () => {
    if (!isDatabaseAvailable()) return;

    const firstPage = await service.list(actor, { limit: 1 });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    expect(firstPage.items[0]).not.toHaveProperty("createdAt");

    const secondPage = await service.list(actor, {
      limit: 1,
      cursor: firstPage.nextCursor ?? undefined,
    });
    expect(
      [...firstPage.items, ...secondPage.items].map(({ id }) => id),
    ).toContain(secondSiteAssignmentId);

    await transactionBoundary().run(actor, async (tx) => {
      await expect(
        tx.userRoleAssignment.findMany({
          where: { id: secondSiteAssignmentId },
        }),
      ).resolves.toHaveLength(0);
    });

    await expect(
      service.list({ ...actor, legacyOrgRoles: [] }),
    ).rejects.toMatchObject({
      response: { code: "ASSIGNMENT_API_ACCESS_DENIED" },
    });
  });

  it("preserves immutable assignment creation timestamps", async () => {
    if (!isDatabaseAvailable()) return;

    const assignment = await transactionBoundary().run(actor, (tx) =>
      tx.userRoleAssignment.create({
        data: {
          id: randomUUID(),
          orgId: ORG_ID,
          tenantId: SITE_ID,
          userId: assigneeUserId,
          roleDefinitionId,
          assignedById: actorUserId,
          startsAt: new Date("2090-01-01T09:00:00.000Z"),
          expiresAt: new Date("2090-01-01T10:00:00.000Z"),
        },
      }),
    );

    await expectDatabaseRejection(
      () =>
        transactionBoundary().run(actor, (tx) =>
          tx.$executeRawUnsafe(
            'UPDATE "UserRoleAssignment" SET "createdAt" = $1 WHERE "id" = $2',
            new Date("2091-01-01T09:00:00.000Z"),
            assignment.id,
          ),
        ),
      "23514",
    );
  });

  it("rolls back assignment and audit when outbox insertion is denied", async () => {
    if (!isDatabaseAvailable()) return;

    const rollbackUserId = randomUUID();
    await prisma.user.create({
      data: {
        id: rollbackUserId,
        email: `${rollbackUserId}@assignment-api.test`,
      },
    });
    await prisma.orgMembership.create({
      data: { orgId: ORG_ID, userId: rollbackUserId, role: "ORG_MEMBER" },
    });
    const beforeAuditCount = await transactionBoundary().run(actor, (tx) =>
      tx.auditEvent.count({
        where: { actorUserId, entityType: "ROLE_ASSIGNMENT" },
      }),
    );
    const deniedService = new AssignmentsService(
      transactionBoundary(OUTBOX_DENIED_ROLE),
      outbox,
      new AccessCacheService(),
      new RoleSafetyService(),
    );
    await expectDatabaseRejection(
      () =>
        deniedService.assign(
          [
            {
              userId: rollbackUserId,
              roleDefinitionId,
              orgId: ORG_ID,
              tenantId: SITE_ID,
              startsAt: new Date("2026-07-29T09:00:00.000Z"),
            },
          ],
          { ...actor, requestId: `rollback-${rollbackUserId}` },
        ),
      "42501",
    );

    await transactionBoundary().run(actor, async (tx) => {
      await expect(
        Promise.all([
          tx.userRoleAssignment.count({ where: { userId: rollbackUserId } }),
          tx.auditEvent.count({
            where: { actorUserId, entityType: "ROLE_ASSIGNMENT" },
          }),
          tx.outboxEvent.count({ where: { aggregateId: rollbackUserId } }),
        ]),
      ).resolves.toEqual([0, beforeAuditCount, 0]);
    });
    await prisma.orgMembership.deleteMany({
      where: { orgId: ORG_ID, userId: rollbackUserId },
    });
    await prisma.user.delete({ where: { id: rollbackUserId } });
  });
});
