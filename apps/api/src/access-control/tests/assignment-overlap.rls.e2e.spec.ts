import { randomUUID } from "node:crypto";
import { prisma, runTransaction } from "@pathway/db";
import { AccessCacheService } from "../access-cache.service";
import { AssignmentsService } from "../assignments.service";
import {
  createRolesTransactionBoundary,
  type RoleActorContext,
} from "../roles.service";
import { OutboxService } from "../../common/outbox/outbox.service";
import {
  RoleSafetyService,
  type RoleMutationCommand,
} from "../role-safety.service";
import {
  isDatabaseAvailable,
  requireDatabase,
} from "../../../test-helpers.e2e";

const ORG_ID = process.env.E2E_ORG_ID as string;
const SITE_ID = process.env.E2E_TENANT_ID as string;
const RLS_ROLE = "pathway_e2e_rls";
const passThroughRoleSafety = {
  async assertHeadAndSelfLockoutSafe(
    command: RoleMutationCommand,
  ): Promise<void> {
    await command.mutate();
  },
} as RoleSafetyService;
const UPGRADE_PREFLIGHT_SQL = `
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM app."UserRoleAssignment" AS candidate
    JOIN app."UserRoleAssignment" AS existing
      ON existing.id < candidate.id
      AND existing."orgId" = candidate."orgId"
      AND existing."tenantId" IS NOT DISTINCT FROM candidate."tenantId"
      AND existing."userId" = candidate."userId"
      AND existing."roleDefinitionId" = candidate."roleDefinitionId"
      AND existing."revokedAt" IS NULL
      AND candidate."revokedAt" IS NULL
      AND existing."startsAt" < COALESCE(candidate."expiresAt", 'infinity'::timestamp)
      AND candidate."startsAt" < COALESCE(existing."expiresAt", 'infinity'::timestamp)
  ) THEN
    RAISE EXCEPTION 'Existing unrevoked role assignments overlap'
      USING
        ERRCODE = 'PRA02',
        HINT = 'Resolve the overlapping assignment history, then rerun this migration.';
  END IF;
END;
$$;
`;

function transactionBoundary() {
  return createRolesTransactionBoundary(async (operation) =>
    runTransaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE "${RLS_ROLE}"`);
      return operation(tx);
    }),
  );
}

describe("assignment overlap integration", () => {
  const actorUserId = randomUUID();
  const assigneeUserId = randomUUID();
  const siteRoleDefinitionId = randomUUID();
  const organisationRoleDefinitionId = randomUUID();
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
    requestId: `assignment-overlap-${randomUUID()}`,
  };
  const service = new AssignmentsService(
    transactionBoundary(),
    new OutboxService(),
    new AccessCacheService(),
    passThroughRoleSafety,
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
          email: `${actorUserId}@assignment-overlap.test`,
        },
        {
          id: assigneeUserId,
          email: `${assigneeUserId}@assignment-overlap.test`,
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
    await prisma.orgRoleDefinition.createMany({
      data: [
        {
          id: siteRoleDefinitionId,
          orgId: ORG_ID,
          tenantId: SITE_ID,
          name: `Overlap site role ${siteRoleDefinitionId}`,
          scope: "site",
          createdById: actorUserId,
          updatedById: actorUserId,
        },
        {
          id: organisationRoleDefinitionId,
          orgId: ORG_ID,
          tenantId: null,
          name: `Overlap org role ${organisationRoleDefinitionId}`,
          scope: "organisation",
          createdById: actorUserId,
          updatedById: actorUserId,
        },
      ],
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
            in: [siteRoleDefinitionId, organisationRoleDefinitionId],
          },
        },
      });
      await prisma.orgRoleDefinition.deleteMany({
        where: {
          id: { in: [siteRoleDefinitionId, organisationRoleDefinitionId] },
        },
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

  it("allows adjacent half-open assignment windows", async () => {
    if (!isDatabaseAvailable()) return;

    const [first] = await service.assign(
      [
        {
          userId: assigneeUserId,
          roleDefinitionId: siteRoleDefinitionId,
          orgId: ORG_ID,
          tenantId: SITE_ID,
          startsAt: new Date("2030-01-01T09:00:00.000Z"),
          expiresAt: new Date("2030-01-01T10:00:00.000Z"),
        },
      ],
      { ...actor, requestId: `adjacent-first-${randomUUID()}` },
    );
    const [second] = await service.assign(
      [
        {
          userId: assigneeUserId,
          roleDefinitionId: siteRoleDefinitionId,
          orgId: ORG_ID,
          tenantId: SITE_ID,
          startsAt: new Date("2030-01-01T10:00:00.000Z"),
          expiresAt: new Date("2030-01-01T11:00:00.000Z"),
        },
      ],
      { ...actor, requestId: `adjacent-second-${randomUUID()}` },
    );

    expect(first.id).not.toBe(second.id);
  });

  it("passes a clean upgrade preflight and rejects seeded legacy overlap", async () => {
    if (!isDatabaseAvailable()) return;

    await expect(
      prisma.$executeRawUnsafe(UPGRADE_PREFLIGHT_SQL),
    ).resolves.toBeDefined();

    const firstId = randomUUID();
    const secondId = randomUUID();
    const rollbackSentinel = new Error("rollback seeded legacy overlap");
    let preflightError: unknown;
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          'DROP TRIGGER "UserRoleAssignment_prevent_overlap" ON app."UserRoleAssignment"',
        );
        await tx.userRoleAssignment.createMany({
          data: [
            {
              id: firstId,
              orgId: ORG_ID,
              tenantId: SITE_ID,
              userId: assigneeUserId,
              roleDefinitionId: siteRoleDefinitionId,
              assignedById: actorUserId,
              startsAt: new Date("2050-01-01T09:00:00.000Z"),
              expiresAt: new Date("2050-01-01T11:00:00.000Z"),
            },
            {
              id: secondId,
              orgId: ORG_ID,
              tenantId: SITE_ID,
              userId: assigneeUserId,
              roleDefinitionId: siteRoleDefinitionId,
              assignedById: actorUserId,
              startsAt: new Date("2050-01-01T10:00:00.000Z"),
              expiresAt: new Date("2050-01-01T12:00:00.000Z"),
            },
          ],
        });
        try {
          await tx.$executeRawUnsafe(UPGRADE_PREFLIGHT_SQL);
        } catch (error) {
          preflightError = error;
        }
        throw rollbackSentinel;
      }),
    ).rejects.toBe(rollbackSentinel);
    expect(preflightError).toMatchObject({
      code: "P2010",
      meta: { code: "PRA02" },
    });
  });

  it("uses the migration-owned partial index for the overlap identity probe", async () => {
    if (!isDatabaseAvailable()) return;

    const plan = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL enable_seqscan = off");
      return tx.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `EXPLAIN (FORMAT JSON)
         SELECT 1
         FROM app."UserRoleAssignment"
         WHERE "orgId" = $1
           AND "tenantId" = $2::text
           AND "userId" = $3
           AND "roleDefinitionId" = $4
           AND "revokedAt" IS NULL
           AND "startsAt" < $5::timestamp
           AND $6::timestamp < COALESCE("expiresAt", 'infinity'::timestamp)
         ORDER BY "orgId", "tenantId", "userId", "roleDefinitionId", "startsAt", "expiresAt"
         LIMIT 1`,
        ORG_ID,
        SITE_ID,
        assigneeUserId,
        siteRoleDefinitionId,
        new Date("2060-01-01T10:00:00.000Z"),
        new Date("2060-01-01T09:00:00.000Z"),
      );
    });

    expect(JSON.stringify(plan)).toContain(
      "UserRoleAssignment_unrevoked_overlap_idx",
    );
  });

  it("rejects overlapping and duplicate bulk assignment windows atomically", async () => {
    if (!isDatabaseAvailable()) return;

    const [existing] = await service.assign(
      [
        {
          userId: assigneeUserId,
          roleDefinitionId: siteRoleDefinitionId,
          orgId: ORG_ID,
          tenantId: SITE_ID,
          startsAt: new Date("2031-01-01T09:00:00.000Z"),
          expiresAt: new Date("2031-01-01T11:00:00.000Z"),
        },
      ],
      { ...actor, requestId: `overlap-existing-${randomUUID()}` },
    );
    await expect(
      service.assign(
        [
          {
            userId: assigneeUserId,
            roleDefinitionId: siteRoleDefinitionId,
            orgId: ORG_ID,
            tenantId: SITE_ID,
            startsAt: new Date("2031-01-01T10:00:00.000Z"),
            expiresAt: new Date("2031-01-01T12:00:00.000Z"),
          },
        ],
        { ...actor, requestId: `overlap-rejected-${randomUUID()}` },
      ),
    ).rejects.toMatchObject({
      response: { statusCode: 409, code: "ASSIGNMENT_OVERLAP" },
    });
    await service.revoke(existing.id, {
      ...actor,
      requestId: `overlap-revoke-${randomUUID()}`,
    });

    const duplicate = {
      userId: assigneeUserId,
      roleDefinitionId: siteRoleDefinitionId,
      orgId: ORG_ID,
      tenantId: SITE_ID,
      startsAt: new Date("2032-01-01T09:00:00.000Z"),
      expiresAt: new Date("2032-01-01T10:00:00.000Z"),
    };
    await expect(
      service.assign([duplicate, duplicate], {
        ...actor,
        requestId: `bulk-duplicate-${randomUUID()}`,
      }),
    ).rejects.toMatchObject({
      response: { statusCode: 409, code: "ASSIGNMENT_OVERLAP" },
    });
    await transactionBoundary().run(actor, (tx) =>
      expect(
        tx.userRoleAssignment.count({
          where: {
            userId: assigneeUserId,
            roleDefinitionId: siteRoleDefinitionId,
            startsAt: duplicate.startsAt,
          },
        }),
      ).resolves.toBe(0),
    );
  });

  it("rejects overlapping organisation-wide windows with null tenant scope", async () => {
    if (!isDatabaseAvailable()) return;

    const command = {
      userId: assigneeUserId,
      roleDefinitionId: organisationRoleDefinitionId,
      orgId: ORG_ID,
      tenantId: SITE_ID,
      startsAt: new Date("2032-02-01T09:00:00.000Z"),
      expiresAt: new Date("2032-02-01T11:00:00.000Z"),
    };
    const [existing] = await service.assign(
      [command],
      { ...actor, requestId: `org-overlap-existing-${randomUUID()}` },
    );

    await expect(
      service.assign(
        [
          {
            ...command,
            startsAt: new Date("2032-02-01T10:00:00.000Z"),
            expiresAt: new Date("2032-02-01T12:00:00.000Z"),
          },
        ],
        { ...actor, requestId: `org-overlap-rejected-${randomUUID()}` },
      ),
    ).rejects.toMatchObject({
      response: { statusCode: 409, code: "ASSIGNMENT_OVERLAP" },
    });
    expect(existing.tenantId).toBeNull();
    await service.revoke(existing.id, {
      ...actor,
      requestId: `org-overlap-revoke-${randomUUID()}`,
    });
  });

  it("serializes concurrent duplicate grants and permits reassignment after revocation", async () => {
    if (!isDatabaseAvailable()) return;

    const concurrentCommand = {
      userId: assigneeUserId,
      roleDefinitionId: siteRoleDefinitionId,
      orgId: ORG_ID,
      tenantId: SITE_ID,
      startsAt: new Date("2033-01-01T09:00:00.000Z"),
      expiresAt: new Date("2033-01-01T10:00:00.000Z"),
    };
    const results = await Promise.allSettled([
      service.assign([concurrentCommand], {
        ...actor,
        requestId: `concurrent-a-${randomUUID()}`,
      }),
      service.assign([concurrentCommand], {
        ...actor,
        requestId: `concurrent-b-${randomUUID()}`,
      }),
    ]);
    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<
        Awaited<ReturnType<AssignmentsService["assign"]>>
      > => result.status === "fulfilled",
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult =>
        result.status === "rejected",
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({
      response: { statusCode: 409, code: "ASSIGNMENT_OVERLAP" },
    });
    const assignmentId = fulfilled[0].value[0].id;
    await service.revoke(assignmentId, {
      ...actor,
      requestId: `concurrent-revoke-${randomUUID()}`,
    });

    const [reassigned] = await service.assign(
      [concurrentCommand],
      { ...actor, requestId: `reassigned-${randomUUID()}` },
    );
    expect(reassigned.id).not.toBe(assignmentId);
  });

  it("avoids deadlock for concurrent bulk grants submitted in opposite order", async () => {
    if (!isDatabaseAvailable()) return;

    const siteCommand = {
      userId: assigneeUserId,
      roleDefinitionId: siteRoleDefinitionId,
      orgId: ORG_ID,
      tenantId: SITE_ID,
      startsAt: new Date("2040-01-01T09:00:00.000Z"),
      expiresAt: new Date("2040-01-01T10:00:00.000Z"),
    };
    const organisationCommand = {
      ...siteCommand,
      roleDefinitionId: organisationRoleDefinitionId,
    };
    const results = await Promise.allSettled([
      service.assign([siteCommand, organisationCommand], {
        ...actor,
        requestId: `opposite-order-a-${randomUUID()}`,
      }),
      service.assign([organisationCommand, siteCommand], {
        ...actor,
        requestId: `opposite-order-b-${randomUUID()}`,
      }),
    ]);
    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<
        Awaited<ReturnType<AssignmentsService["assign"]>>
      > => result.status === "fulfilled",
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult =>
        result.status === "rejected",
    );

    expect(fulfilled).toHaveLength(1);
    expect(fulfilled[0].value.map((assignment) => assignment.roleDefinitionId))
      .toEqual(
        results[0].status === "fulfilled"
          ? [siteRoleDefinitionId, organisationRoleDefinitionId]
          : [organisationRoleDefinitionId, siteRoleDefinitionId],
      );
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({
      response: { statusCode: 409, code: "ASSIGNMENT_OVERLAP" },
    });
  });
});
