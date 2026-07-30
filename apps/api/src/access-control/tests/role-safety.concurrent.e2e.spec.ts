import { randomUUID } from "node:crypto";
import { SYSTEM_ROLE_TEMPLATES } from "@pathway/auth";
import { Prisma, PrismaClient, prisma, runTransaction } from "@pathway/db";
import { AccessCacheService } from "../access-cache.service";
import { AssignmentsService } from "../assignments.service";
import {
  createRolesTransactionBoundary,
  RolesService,
  type RoleActorContext,
} from "../roles.service";
import { OutboxService } from "../../common/outbox/outbox.service";
import { RoleSafetyService } from "../role-safety.service";
import {
  isDatabaseAvailable,
  requireDatabase,
} from "../../../test-helpers.e2e";

const RLS_ROLE = "pathway_e2e_rls";
const PAST = new Date("2026-07-01T00:00:00.000Z");
const FUTURE = new Date("2090-01-01T00:00:00.000Z");
const EXPIRED = new Date("2026-07-02T00:00:00.000Z");
const LOCK_WAIT_TIMEOUT_MS = 5_000;

interface HeldOrganisationSafetyLock {
  release: () => Promise<void>;
}

async function holdOrganisationSafetyLock(
  orgId: string,
): Promise<HeldOrganisationSafetyLock> {
  let releaseLock: (() => void) | undefined;
  let markAcquired: (() => void) | undefined;
  const releaseSignal = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  const acquired = new Promise<void>((resolve) => {
    markAcquired = resolve;
  });
  const completion = prisma.$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`ace-role-safety:${orgId}`}, 0)
        )
      `,
    );
    markAcquired?.();
    await releaseSignal;
  });

  await Promise.race([
    acquired,
    completion.then(() => {
      throw new Error("Organisation safety lock transaction ended early");
    }),
  ]);

  let released = false;
  return {
    release: async () => {
      if (!released) {
        released = true;
        releaseLock?.();
      }
      await completion;
    },
  };
}

async function countWaitingOrganisationSafetyLocks(
  observer: PrismaClient,
  orgId: string,
): Promise<number> {
  const [row] = await observer.$queryRaw<{ waitingCount: number }[]>(
    Prisma.sql`
      WITH lock_key AS (
        SELECT hashtextextended(${`ace-role-safety:${orgId}`}, 0) AS value
      )
      SELECT COUNT(*)::integer AS "waitingCount"
      FROM pg_catalog.pg_locks observed_lock
      CROSS JOIN lock_key
      WHERE observed_lock.locktype = 'advisory'
        AND observed_lock.granted = false
        AND observed_lock.classid::bigint =
          ((lock_key.value >> 32) & 4294967295)
        AND observed_lock.objid::bigint =
          (lock_key.value & 4294967295)
        AND observed_lock.objsubid = 1
    `,
  );

  return row?.waitingCount ?? 0;
}

async function waitForCondition(
  description: string,
  condition: () => Promise<boolean>,
): Promise<void> {
  const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function waitForWaitingOrganisationSafetyLocks(
  observer: PrismaClient,
  orgId: string,
  expectedCount: number,
): Promise<void> {
  await waitForCondition(
    `${expectedCount} organisation safety lock waiters`,
    async () =>
      (await countWaitingOrganisationSafetyLocks(observer, orgId)) ===
      expectedCount,
  );
}

async function databaseNow(): Promise<Date> {
  const [row] = await prisma.$queryRaw<{ now: Date }[]>(
    Prisma.sql`SELECT clock_timestamp() AS now`,
  );
  if (!row) throw new Error("Database did not return its current time");
  return row.now;
}

async function waitUntilDatabaseTimeAfter(instant: Date): Promise<void> {
  await waitForCondition(
    `database time to pass ${instant.toISOString()}`,
    async () => (await databaseNow()).getTime() > instant.getTime(),
  );
}

function transactionBoundary() {
  return createRolesTransactionBoundary(async (operation) =>
    runTransaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE "${RLS_ROLE}"`);
      return operation(tx);
    }),
  );
}

describe("role safety concurrency and transactional rollback", () => {
  const lockObserver = new PrismaClient();
  const orgId = randomUUID();
  const expiryOrgId = randomUUID();
  const crossOrgDecoyId = randomUUID();
  const siteTenantId = randomUUID();
  const operatorUserId = randomUUID();
  const selfRevokerUserId = randomUUID();
  const roleMutatorUserId = randomUUID();
  const preservingUserId = randomUUID();
  const headUserIds = [randomUUID(), randomUUID()];
  const inactiveHeadUserIds = [randomUUID(), randomUUID()];
  const expiryActorUserId = randomUUID();
  const expiryHeadUserId = randomUUID();
  const siteDecoyHeadUserId = randomUUID();
  const crossOrgHeadUserId = randomUUID();
  const userIds = [
    operatorUserId,
    selfRevokerUserId,
    roleMutatorUserId,
    preservingUserId,
    ...headUserIds,
    ...inactiveHeadUserIds,
    expiryActorUserId,
    expiryHeadUserId,
    siteDecoyHeadUserId,
    crossOrgHeadUserId,
  ];
  const headRoleId = randomUUID();
  const operatorRoleId = randomUUID();
  const selfAuthorityRoleId = randomUUID();
  const mutableAuthorityRoleId = randomUUID();
  const preservingAuthorityRoleId = randomUUID();
  const ordinaryRoleId = randomUUID();
  const expiryHeadRoleId = randomUUID();
  const expiryOperatorRoleId = randomUUID();
  const expiryOrdinaryRoleId = randomUUID();
  const siteDecoyHeadRoleId = randomUUID();
  const crossOrgHeadRoleId = randomUUID();
  const roleIds = [
    headRoleId,
    operatorRoleId,
    selfAuthorityRoleId,
    mutableAuthorityRoleId,
    preservingAuthorityRoleId,
    ordinaryRoleId,
    expiryHeadRoleId,
    expiryOperatorRoleId,
    expiryOrdinaryRoleId,
    siteDecoyHeadRoleId,
    crossOrgHeadRoleId,
  ];
  const headAssignmentIds = [randomUUID(), randomUUID()];
  const selfAssignmentId = randomUUID();
  const assignmentsOnlyTargetAssignmentId = randomUUID();
  const mutableAuthorityAssignmentId = randomUUID();
  const preservingAssignmentIds = [randomUUID(), randomUUID()];
  const preservingTargetAssignmentId = randomUUID();
  const expiryTargetAssignmentId = randomUUID();
  const siteDecoyAssignmentId = randomUUID();
  const crossOrgDecoyAssignmentId = randomUUID();

  const actor = (userId: string, requestId: string): RoleActorContext => ({
    orgId,
    userId,
    legacyOrgRoles: ["org:admin"],
    requestId,
  });
  const expiryActor = (requestId: string): RoleActorContext => ({
    orgId: expiryOrgId,
    userId: expiryActorUserId,
    legacyOrgRoles: ["org:admin"],
    requestId,
  });
  const assignmentService = new AssignmentsService(
    transactionBoundary(),
    new OutboxService(),
    new AccessCacheService(),
    new RoleSafetyService(),
  );
  const rolesService = new RolesService(
    transactionBoundary(),
    new AccessCacheService(),
    new RoleSafetyService(),
  );

  beforeAll(async () => {
    if (!requireDatabase()) return;

    await lockObserver.$connect();
    await prisma.org.createMany({
      data: [orgId, expiryOrgId, crossOrgDecoyId].map((id) => ({
        id,
        name: `Role safety org ${id}`,
        slug: `role-safety-${id}`,
        planCode: "trial",
      })),
    });
    await prisma.orgVertical.createMany({
      data: [orgId, expiryOrgId, crossOrgDecoyId].map((id) => ({
        orgId: id,
        vertical: "ACE_SCHOOL",
      })),
    });
    await prisma.tenant.create({
      data: {
        id: siteTenantId,
        orgId: expiryOrgId,
        name: `Role safety site ${siteTenantId}`,
        slug: `role-safety-site-${siteTenantId}`,
      },
    });
    await prisma.user.createMany({
      data: userIds.map((id) => ({
        id,
        email: `${id}@role-safety.test`,
      })),
    });
    await prisma.orgMembership.createMany({
      data: userIds.map((userId) => ({
        orgId: [
          expiryActorUserId,
          expiryHeadUserId,
          siteDecoyHeadUserId,
        ].includes(userId)
          ? expiryOrgId
          : userId === crossOrgHeadUserId
            ? crossOrgDecoyId
            : orgId,
        userId,
        role: [
          operatorUserId,
          selfRevokerUserId,
          roleMutatorUserId,
          preservingUserId,
          expiryActorUserId,
        ].includes(userId)
          ? "ORG_ADMIN"
          : "ORG_MEMBER",
      })),
    });

    await prisma.orgRoleDefinition.createMany({
      data: [
        {
          id: operatorRoleId,
          orgId,
          name: "Role Safety Operator",
          scope: "organisation",
          createdById: operatorUserId,
          updatedById: operatorUserId,
        },
        {
          id: selfAuthorityRoleId,
          orgId,
          name: "Assignment Safety Manager",
          scope: "organisation",
          createdById: operatorUserId,
          updatedById: operatorUserId,
        },
        {
          id: mutableAuthorityRoleId,
          orgId,
          name: "Mutable Role Manager",
          scope: "organisation",
          createdById: operatorUserId,
          updatedById: operatorUserId,
        },
        {
          id: preservingAuthorityRoleId,
          orgId,
          name: "Preserving Role Manager",
          scope: "organisation",
          createdById: operatorUserId,
          updatedById: operatorUserId,
        },
        {
          id: ordinaryRoleId,
          orgId,
          name: "Ordinary ACE Role",
          scope: "organisation",
          createdById: operatorUserId,
          updatedById: operatorUserId,
        },
        {
          id: expiryOperatorRoleId,
          orgId: expiryOrgId,
          name: "Expiry Boundary Operator",
          scope: "organisation",
          createdById: expiryActorUserId,
          updatedById: expiryActorUserId,
        },
        {
          id: expiryOrdinaryRoleId,
          orgId: expiryOrgId,
          name: "Expiry Boundary Ordinary Role",
          scope: "organisation",
          createdById: expiryActorUserId,
          updatedById: expiryActorUserId,
        },
      ],
    });

    await prisma.$executeRawUnsafe(
      'ALTER TABLE "OrgRoleDefinition" DISABLE TRIGGER "OrgRoleDefinition_protect_system_template"',
    );
    try {
      await prisma.orgRoleDefinition.createMany({
        data: [
          {
            id: headRoleId,
            orgId,
            name: SYSTEM_ROLE_TEMPLATES.organisationHead.name,
            scope: "organisation",
            isSystem: true,
            createdById: operatorUserId,
            updatedById: operatorUserId,
          },
          {
            id: expiryHeadRoleId,
            orgId: expiryOrgId,
            name: SYSTEM_ROLE_TEMPLATES.organisationHead.name,
            scope: "organisation",
            isSystem: true,
            createdById: expiryActorUserId,
            updatedById: expiryActorUserId,
          },
          {
            id: siteDecoyHeadRoleId,
            orgId: expiryOrgId,
            tenantId: siteTenantId,
            name: SYSTEM_ROLE_TEMPLATES.organisationHead.name,
            scope: "site",
            isSystem: true,
            createdById: expiryActorUserId,
            updatedById: expiryActorUserId,
          },
          {
            id: crossOrgHeadRoleId,
            orgId: crossOrgDecoyId,
            name: SYSTEM_ROLE_TEMPLATES.organisationHead.name,
            scope: "organisation",
            isSystem: true,
            createdById: crossOrgHeadUserId,
            updatedById: crossOrgHeadUserId,
          },
        ],
      });
    } finally {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "OrgRoleDefinition" ENABLE TRIGGER "OrgRoleDefinition_protect_system_template"',
      );
    }

    await prisma.orgRolePermission.createMany({
      data: [
        {
          roleDefinitionId: operatorRoleId,
          permissionKey: "platform.access.roles.manage",
          grantedById: operatorUserId,
        },
        {
          roleDefinitionId: operatorRoleId,
          permissionKey: "platform.access.assignments.manage",
          grantedById: operatorUserId,
        },
        {
          roleDefinitionId: selfAuthorityRoleId,
          permissionKey: "platform.access.assignments.manage",
          grantedById: operatorUserId,
        },
        {
          roleDefinitionId: mutableAuthorityRoleId,
          permissionKey: "platform.access.roles.manage",
          grantedById: operatorUserId,
        },
        {
          roleDefinitionId: preservingAuthorityRoleId,
          permissionKey: "platform.access.roles.manage",
          grantedById: operatorUserId,
        },
        {
          roleDefinitionId: ordinaryRoleId,
          permissionKey: "ace.pace.read",
          grantedById: operatorUserId,
        },
        {
          roleDefinitionId: expiryOperatorRoleId,
          permissionKey: "platform.access.roles.manage",
          grantedById: expiryActorUserId,
        },
        {
          roleDefinitionId: expiryOperatorRoleId,
          permissionKey: "platform.access.assignments.manage",
          grantedById: expiryActorUserId,
        },
        {
          roleDefinitionId: expiryOrdinaryRoleId,
          permissionKey: "ace.pace.read",
          grantedById: expiryActorUserId,
        },
      ],
    });

    await prisma.userRoleAssignment.createMany({
      data: [
        ...headAssignmentIds.map((id, index) => ({
          id,
          orgId,
          userId: headUserIds[index],
          roleDefinitionId: headRoleId,
          assignedById: operatorUserId,
          startsAt: PAST,
        })),
        {
          id: randomUUID(),
          orgId,
          userId: inactiveHeadUserIds[0],
          roleDefinitionId: headRoleId,
          assignedById: operatorUserId,
          startsAt: PAST,
          expiresAt: EXPIRED,
        },
        {
          id: randomUUID(),
          orgId,
          userId: inactiveHeadUserIds[1],
          roleDefinitionId: headRoleId,
          assignedById: operatorUserId,
          startsAt: FUTURE,
        },
        {
          id: randomUUID(),
          orgId,
          userId: operatorUserId,
          roleDefinitionId: operatorRoleId,
          assignedById: operatorUserId,
          startsAt: PAST,
        },
        {
          id: selfAssignmentId,
          orgId,
          userId: selfRevokerUserId,
          roleDefinitionId: selfAuthorityRoleId,
          assignedById: operatorUserId,
          startsAt: PAST,
        },
        {
          id: assignmentsOnlyTargetAssignmentId,
          orgId,
          userId: selfRevokerUserId,
          roleDefinitionId: ordinaryRoleId,
          assignedById: operatorUserId,
          startsAt: PAST,
        },
        {
          id: mutableAuthorityAssignmentId,
          orgId,
          userId: roleMutatorUserId,
          roleDefinitionId: mutableAuthorityRoleId,
          assignedById: operatorUserId,
          startsAt: PAST,
        },
        {
          id: preservingAssignmentIds[0],
          orgId,
          userId: preservingUserId,
          roleDefinitionId: selfAuthorityRoleId,
          assignedById: operatorUserId,
          startsAt: PAST,
        },
        {
          id: preservingAssignmentIds[1],
          orgId,
          userId: preservingUserId,
          roleDefinitionId: preservingAuthorityRoleId,
          assignedById: operatorUserId,
          startsAt: PAST,
        },
        {
          id: preservingTargetAssignmentId,
          orgId,
          userId: preservingUserId,
          roleDefinitionId: ordinaryRoleId,
          assignedById: operatorUserId,
          startsAt: PAST,
        },
        {
          id: randomUUID(),
          orgId: expiryOrgId,
          userId: expiryActorUserId,
          roleDefinitionId: expiryOperatorRoleId,
          assignedById: expiryActorUserId,
          startsAt: PAST,
        },
        {
          id: expiryTargetAssignmentId,
          orgId: expiryOrgId,
          userId: expiryActorUserId,
          roleDefinitionId: expiryOrdinaryRoleId,
          assignedById: expiryActorUserId,
          startsAt: PAST,
        },
        {
          id: siteDecoyAssignmentId,
          orgId: expiryOrgId,
          tenantId: siteTenantId,
          userId: siteDecoyHeadUserId,
          roleDefinitionId: siteDecoyHeadRoleId,
          assignedById: expiryActorUserId,
          startsAt: PAST,
        },
        {
          id: crossOrgDecoyAssignmentId,
          orgId: crossOrgDecoyId,
          userId: crossOrgHeadUserId,
          roleDefinitionId: crossOrgHeadRoleId,
          assignedById: crossOrgHeadUserId,
          startsAt: PAST,
        },
      ],
    });
  });

  afterAll(async () => {
    if (!isDatabaseAvailable()) return;
    const orgIds = [orgId, expiryOrgId, crossOrgDecoyId];
    await prisma.outboxEvent.deleteMany({ where: { orgId: { in: orgIds } } });
    await prisma.auditEvent.deleteMany({ where: { orgId: { in: orgIds } } });
    await prisma.userRoleAssignment.deleteMany({
      where: { orgId: { in: orgIds } },
    });
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "OrgRoleRevision" DISABLE TRIGGER "OrgRoleRevision_immutable"',
    );
    try {
      await prisma.orgRoleRevision.deleteMany({
        where: { orgId: { in: orgIds } },
      });
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "OrgRoleDefinition" DISABLE TRIGGER "OrgRoleDefinition_protect_system_template"',
      );
      try {
        await prisma.orgRoleDefinition.deleteMany({
          where: { id: { in: roleIds } },
        });
      } finally {
        await prisma.$executeRawUnsafe(
          'ALTER TABLE "OrgRoleDefinition" ENABLE TRIGGER "OrgRoleDefinition_protect_system_template"',
        );
      }
    } finally {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "OrgRoleRevision" ENABLE TRIGGER "OrgRoleRevision_immutable"',
      );
    }
    await prisma.orgMembership.deleteMany({
      where: { orgId: { in: orgIds } },
    });
    await prisma.tenant.deleteMany({ where: { id: siteTenantId } });
    await prisma.orgVertical.deleteMany({
      where: { orgId: { in: orgIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.org.deleteMany({ where: { id: { in: orgIds } } });
  });

  afterAll(async () => {
    await lockObserver.$disconnect();
  });

  it("rolls back a revocation that would leave the actor with legacy bootstrap authority only", async () => {
    if (!isDatabaseAvailable()) return;

    await expect(
      assignmentService.revoke(
        selfAssignmentId,
        actor(selfRevokerUserId, "self-lockout-assignment"),
      ),
    ).rejects.toMatchObject({
      response: {
        code: "SELF_LOCKOUT_PROTECTED",
        requestId: "self-lockout-assignment",
      },
    });
    await expect(
      prisma.userRoleAssignment.findUnique({
        where: { id: selfAssignmentId },
        select: { revokedAt: true },
      }),
    ).resolves.toEqual({ revokedAt: null });
  });

  it("rejects an assignments.manage-only actor after an unrelated assignment mutation", async () => {
    if (!isDatabaseAvailable()) return;

    await expect(
      assignmentService.revoke(
        assignmentsOnlyTargetAssignmentId,
        actor(selfRevokerUserId, "assignments-manage-only"),
      ),
    ).rejects.toMatchObject({
      response: {
        code: "SELF_LOCKOUT_PROTECTED",
        requestId: "assignments-manage-only",
      },
    });
    await expect(
      prisma.userRoleAssignment.findUnique({
        where: { id: assignmentsOnlyTargetAssignmentId },
        select: { revokedAt: true },
      }),
    ).resolves.toEqual({ revokedAt: null });
  });

  it("rolls back a role update that removes the actor's final typed management permission", async () => {
    if (!isDatabaseAvailable()) return;

    await expect(
      rolesService.update(
        {
          roleId: mutableAuthorityRoleId,
          expectedVersion: 1,
          name: "Mutable Role Manager",
          permissionKeys: ["ace.pace.read"],
        },
        actor(roleMutatorUserId, "self-lockout-role"),
      ),
    ).rejects.toMatchObject({
      response: {
        code: "SELF_LOCKOUT_PROTECTED",
        requestId: "self-lockout-role",
      },
    });
    await expect(
      prisma.orgRoleDefinition.findUnique({
        where: { id: mutableAuthorityRoleId },
        include: {
          permissions: { select: { permissionKey: true } },
        },
      }),
    ).resolves.toMatchObject({
      version: 1,
      permissions: [{ permissionKey: "platform.access.roles.manage" }],
    });
  });

  it("rejects a roles.manage-only actor after an unrelated role mutation", async () => {
    if (!isDatabaseAvailable()) return;

    await expect(
      rolesService.update(
        {
          roleId: ordinaryRoleId,
          expectedVersion: 1,
          name: "Ordinary ACE Role",
          permissionKeys: ["ace.pace.record"],
        },
        actor(roleMutatorUserId, "roles-manage-only"),
      ),
    ).rejects.toMatchObject({
      response: {
        code: "SELF_LOCKOUT_PROTECTED",
        requestId: "roles-manage-only",
      },
    });
    await expect(
      prisma.orgRoleDefinition.findUnique({
        where: { id: ordinaryRoleId },
        select: { version: true },
      }),
    ).resolves.toEqual({ version: 1 });
  });

  it("allows a protected mutation when both permissions remain across active typed roles", async () => {
    if (!isDatabaseAvailable()) return;

    await expect(
      assignmentService.revoke(
        preservingTargetAssignmentId,
        actor(preservingUserId, "preserved-authority"),
      ),
    ).resolves.toMatchObject({
      id: preservingTargetAssignmentId,
      revokedAt: expect.any(Date),
    });
  });

  it("allows an ordinary role change that preserves both safety invariants", async () => {
    if (!isDatabaseAvailable()) return;

    await expect(
      rolesService.update(
        {
          roleId: ordinaryRoleId,
          expectedVersion: 1,
          name: "Ordinary ACE Role",
          permissionKeys: ["ace.pace.record"],
        },
        actor(operatorUserId, "ordinary-role-update"),
      ),
    ).resolves.toMatchObject({
      id: ordinaryRoleId,
      version: 2,
      permissions: [{ permissionKey: "ace.pace.record" }],
    });
  });

  it("rejects a mutation when the sole organisation head expires while waiting for the safety lock", async () => {
    if (!isDatabaseAvailable()) return;

    const expiryHeadAssignmentId = randomUUID();
    const expiresAt = new Date((await databaseNow()).getTime() + 2_000);
    await prisma.userRoleAssignment.create({
      data: {
        id: expiryHeadAssignmentId,
        orgId: expiryOrgId,
        userId: expiryHeadUserId,
        roleDefinitionId: expiryHeadRoleId,
        assignedById: expiryActorUserId,
        startsAt: PAST,
        expiresAt,
      },
    });

    const heldLock = await holdOrganisationSafetyLock(expiryOrgId);
    let mutation: Promise<unknown> | undefined;
    try {
      expect((await databaseNow()).getTime()).toBeLessThan(expiresAt.getTime());
      mutation = assignmentService.revoke(
        expiryTargetAssignmentId,
        expiryActor("head-expired-while-waiting"),
      );
      await waitForWaitingOrganisationSafetyLocks(lockObserver, expiryOrgId, 1);
      await waitUntilDatabaseTimeAfter(expiresAt);
      await heldLock.release();

      await expect(mutation).rejects.toMatchObject({
        response: {
          statusCode: 409,
          code: "LAST_HEAD_PROTECTED",
          requestId: "head-expired-while-waiting",
        },
      });
    } finally {
      await heldLock.release();
      if (mutation) await Promise.allSettled([mutation]);
    }

    await expect(
      prisma.userRoleAssignment.findUnique({
        where: { id: expiryTargetAssignmentId },
        select: { revokedAt: true },
      }),
    ).resolves.toEqual({ revokedAt: null });
    await expect(
      prisma.userRoleAssignment.count({
        where: {
          id: { in: [siteDecoyAssignmentId, crossOrgDecoyAssignmentId] },
          revokedAt: null,
        },
      }),
    ).resolves.toBe(2);
  });

  it("serialises concurrent head revocations so exactly one succeeds", async () => {
    if (!isDatabaseAvailable()) return;

    const heldLock = await holdOrganisationSafetyLock(orgId);
    let mutations: Promise<unknown>[] = [];
    let results: PromiseSettledResult<unknown>[] = [];
    try {
      mutations = headAssignmentIds.map((assignmentId, index) =>
        assignmentService.revoke(
          assignmentId,
          actor(operatorUserId, `concurrent-head-${index}`),
        ),
      );
      await waitForWaitingOrganisationSafetyLocks(lockObserver, orgId, 2);
      await heldLock.release();
      results = await Promise.allSettled(mutations);
    } finally {
      await heldLock.release();
      await Promise.allSettled(mutations);
    }

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({
      response: { statusCode: 409, code: "LAST_HEAD_PROTECTED" },
    });
    await expect(
      prisma.userRoleAssignment.count({
        where: {
          id: { in: headAssignmentIds },
          revokedAt: null,
        },
      }),
    ).resolves.toBe(1);
  });
});
