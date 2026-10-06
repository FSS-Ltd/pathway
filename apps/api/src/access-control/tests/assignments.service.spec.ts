import type { Prisma } from "@pathway/db";
import { AccessCacheService, MAX_ACCESS_CACHE_TTL_MS } from "../access-cache.service";
import {
  AssignmentsService,
  type AssignRoleCommand,
} from "../assignments.service";
import type {
  RoleActorContext,
  RolesTransactionBoundary,
} from "../roles.service";
import { OutboxService } from "../../common/outbox/outbox.service";
import { getOrCreateRequestId } from "../request-id";
import {
  RoleSafetyService,
  type RoleMutationCommand,
} from "../role-safety.service";

const actor: RoleActorContext = {
  orgId: "org-1",
  tenantId: "site-1",
  userId: "actor-1",
  legacyOrgRoles: ["org:admin"],
  requestId: "assignment-service-request-1",
};
const command: AssignRoleCommand = {
  userId: "user-1",
  roleDefinitionId: "role-1",
  orgId: "org-1",
  tenantId: "site-1",
  startsAt: new Date("2026-07-30T09:00:00.000Z"),
  expiresAt: new Date("2026-08-30T09:00:00.000Z"),
};
const passThroughRoleSafety = {
  async assertHeadAndSelfLockoutSafe(
    safetyCommand: RoleMutationCommand,
  ): Promise<void> {
    await safetyCommand.mutate();
  },
} as RoleSafetyService;

function buildHarness(options: {
  actorMembership?: { role: string } | null;
  assigneeMembership?: { role: string } | null;
  role?: {
    id: string;
    orgId: string;
    tenantId: string | null;
    scope: "organisation" | "site" | "relationship";
    isActive: boolean;
    isSystem: boolean;
  } | null;
  invalidateUser?: jest.Mock;
  outboxCreateMany?: jest.Mock;
  transaction?: RolesTransactionBoundary;
} = {}) {
  const assignment = {
    id: "assignment-1",
    ...command,
    assignedById: actor.userId,
    revokedAt: null,
    revokedById: null,
  };
  const tx = {
    $queryRawUnsafe: jest.fn().mockResolvedValue([
      { set_config: "on" },
    ]),
    orgMembership: {
      findUnique: jest.fn().mockImplementation(
        ({ where }: { where: { orgId_userId: { userId: string } } }) =>
          Promise.resolve(
            where.orgId_userId.userId === actor.userId
              ? options.actorMembership === undefined
                ? { role: "ORG_ADMIN" }
                : options.actorMembership
              : options.assigneeMembership === undefined
                ? { role: "ORG_MEMBER" }
                : options.assigneeMembership,
          ),
      ),
    },
    permissionDefinition: {
      findUnique: jest.fn().mockResolvedValue({ isActive: true }),
    },
    orgVertical: {
      findUnique: jest.fn().mockResolvedValue({ vertical: "ACE_SCHOOL" }),
    },
    orgModule: { findMany: jest.fn().mockResolvedValue([]) },
    orgRoleDefinition: {
      findFirst: jest.fn().mockResolvedValue(
        options.role === undefined
          ? {
              id: "role-1",
              orgId: "org-1",
              tenantId: "site-1",
              scope: "site",
              isActive: true,
              isSystem: true,
            }
          : options.role,
      ),
    },
    userRoleAssignment: {
      findMany: jest.fn().mockResolvedValue([assignment]),
      findFirst: jest.fn().mockResolvedValue(assignment),
      create: jest.fn().mockResolvedValue(assignment),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    auditEvent: {
      create: jest.fn().mockResolvedValue({ id: "audit-1" }),
    },
    outboxEvent: {
      createMany:
        options.outboxCreateMany ??
        jest.fn().mockResolvedValue({ id: "outbox-1" }),
      findFirstOrThrow: jest.fn().mockResolvedValue({ id: "outbox-1" }),
    },
  };
  const transaction = options.transaction ?? {
    async run<T>(
      _actor: RoleActorContext,
      operation: (client: Prisma.TransactionClient) => Promise<T>,
    ): Promise<T> {
      return operation(tx as unknown as Prisma.TransactionClient);
    },
  };
  const cache = {
    invalidateUser:
      options.invalidateUser ?? jest.fn().mockResolvedValue(undefined),
  } as unknown as AccessCacheService;

  return {
    cache,
    tx,
    service: new AssignmentsService(
      transaction,
      new OutboxService(),
      cache,
      passThroughRoleSafety,
    ),
  };
}

describe("AssignmentsService", () => {
  it("creates assignment, audit, and invalidation outbox intent atomically before invalidating after commit", async () => {
    let committed = false;
    const invalidateUser = jest.fn().mockImplementation(async () => {
      expect(committed).toBe(true);
    });
    const base = buildHarness({ invalidateUser });
    const transaction: RolesTransactionBoundary = {
      async run(_actor, operation) {
        const result = await operation(
          base.tx as unknown as Prisma.TransactionClient,
        );
        committed = true;
        return result;
      },
    };
    const service = new AssignmentsService(
      transaction,
      new OutboxService(),
      base.cache,
      passThroughRoleSafety,
    );

    await expect(service.assign([command], actor)).resolves.toEqual([
      expect.objectContaining({ id: "assignment-1" }),
    ]);

    expect(base.tx.userRoleAssignment.create).toHaveBeenCalledWith({
      data: {
        id: expect.any(String),
        orgId: "org-1",
        tenantId: "site-1",
        userId: "user-1",
        roleDefinitionId: "role-1",
        assignedById: "actor-1",
        startsAt: command.startsAt,
        expiresAt: command.expiresAt,
      },
    });
    expect(base.tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: "ROLE_ASSIGNMENT",
        action: "ASSIGNMENT_CREATED",
        metadata: expect.objectContaining({
          requestId: actor.requestId,
          roleDefinitionId: "role-1",
        }),
      }),
    });
    expect(base.tx.outboxEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          aggregateType: "user-access",
          aggregateId: "user-1",
          eventType: "access.assignment.changed",
          payload: expect.objectContaining({
            action: "assigned",
            assignmentId: expect.any(String),
            orgId: "org-1",
            requestId: actor.requestId,
          }),
          idempotencyKey: expect.stringContaining(actor.requestId),
        }),
      ],
      skipDuplicates: true,
    });
    expect(invalidateUser).toHaveBeenCalledWith("user-1", "org-1");
  });

  it("keeps an oversized inbound request ID out of the indexed outbox idempotency key", async () => {
    const oversizedRequestId = "r".repeat(129);
    const boundedRequestId = getOrCreateRequestId({
      headers: { "x-request-id": oversizedRequestId },
    });
    const { service, tx } = buildHarness();

    await service.assign([command], { ...actor, requestId: boundedRequestId });

    const idempotencyKey =
      tx.outboxEvent.createMany.mock.calls[0][0].data[0].idempotencyKey;
    expect(boundedRequestId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(idempotencyKey).toContain(boundedRequestId);
    expect(idempotencyKey).not.toContain(oversizedRequestId);
  });

  it("rolls back every bulk assignment, audit, and outbox write when one outbox enqueue fails", async () => {
    const staged: string[] = [];
    const committed: string[] = [];
    const base = buildHarness();
    base.tx.userRoleAssignment.create.mockImplementation(async () => {
      staged.push("assignment");
      return {
        id: `assignment-${staged.length}`,
        ...command,
        assignedById: actor.userId,
        revokedAt: null,
        revokedById: null,
      };
    });
    base.tx.auditEvent.create.mockImplementation(async () => {
      staged.push("audit");
      return { id: "audit-1" };
    });
    base.tx.outboxEvent.createMany
      .mockImplementationOnce(async () => {
        staged.push("outbox");
        return { id: "outbox-1" };
      })
      .mockRejectedValueOnce(new Error("outbox unavailable"));
    const transaction: RolesTransactionBoundary = {
      async run(_actor, operation) {
        try {
          const result = await operation(
            base.tx as unknown as Prisma.TransactionClient,
          );
          committed.push(...staged);
          return result;
        } catch (error) {
          staged.length = 0;
          throw error;
        }
      },
    };
    const service = new AssignmentsService(
      transaction,
      new OutboxService(),
      base.cache,
      passThroughRoleSafety,
    );

    await expect(
      service.assign(
        [
          command,
          { ...command, userId: "user-2", roleDefinitionId: "role-2" },
        ],
        actor,
      ),
    ).rejects.toThrow("outbox unavailable");
    expect(committed).toEqual([]);
    expect(staged).toEqual([]);
    expect(base.cache.invalidateUser).not.toHaveBeenCalled();
  });

  it("denies a role from another selected site before writing", async () => {
    const { service, tx } = buildHarness({
      role: {
        id: "role-1",
        orgId: "org-1",
        tenantId: "site-2",
        scope: "site",
        isActive: true,
        isSystem: true,
      },
    });

    await expect(service.assign([command], actor)).rejects.toMatchObject({
      response: {
        statusCode: 403,
        code: "INVALID_ASSIGNMENT_SCOPE",
        requestId: actor.requestId,
      },
    });
    expect(tx.userRoleAssignment.create).not.toHaveBeenCalled();
    expect(tx.orgRoleDefinition.findFirst).toHaveBeenCalledWith({
      where: {
        id: "role-1",
        orgId: "org-1",
        isActive: true,
        isSystem: true,
      },
      select: {
        id: true,
        orgId: true,
        tenantId: true,
        scope: true,
      },
    });
  });

  it("rejects relationship-scoped roles before writing", async () => {
    const { service, tx } = buildHarness({
      role: {
        id: "role-1",
        orgId: "org-1",
        tenantId: "site-1",
        scope: "relationship",
        isActive: true,
        isSystem: true,
      },
    });

    await expect(service.assign([command], actor)).rejects.toMatchObject({
      response: {
        statusCode: 400,
        code: "ROLE_NOT_ASSIGNABLE",
        requestId: actor.requestId,
      },
    });
    expect(tx.userRoleAssignment.create).not.toHaveBeenCalled();
  });

  it("rejects an ordinary custom role before any assignment write", async () => {
    const { service, tx } = buildHarness({ role: null });

    await expect(service.assign([command], actor)).rejects.toMatchObject({
      response: { statusCode: 400, code: "ROLE_NOT_ASSIGNABLE" },
    });
    expect(tx.orgRoleDefinition.findFirst).toHaveBeenCalledWith({
      where: {
        id: command.roleDefinitionId,
        orgId: actor.orgId,
        isActive: true,
        isSystem: true,
      },
      select: {
        id: true,
        orgId: true,
        tenantId: true,
        scope: true,
      },
    });
    expect(tx.userRoleAssignment.create).not.toHaveBeenCalled();
  });

  it("rejects an expired or inverted assignment window", async () => {
    const { service, tx } = buildHarness();

    await expect(
      service.assign(
        [{ ...command, expiresAt: new Date(command.startsAt.getTime()) }],
        actor,
      ),
    ).rejects.toMatchObject({
      response: { statusCode: 400, code: "INVALID_ASSIGNMENT_WINDOW" },
    });
    expect(tx.userRoleAssignment.create).not.toHaveBeenCalled();
  });

  it("requires the assignee to be an active organisation member", async () => {
    const { service } = buildHarness({ assigneeMembership: null });

    await expect(service.assign([command], actor)).rejects.toMatchObject({
      response: { statusCode: 400, code: "ASSIGNEE_NOT_IN_ORGANISATION" },
    });
  });

  it.each([
    [
      "metadata code",
      Object.assign(new Error("database constraint detail"), {
        code: "P2004",
        meta: { code: "23514" },
      }),
    ],
    [
      "Prisma diagnostic",
      Object.assign(new Error("database constraint detail"), {
        code: "P2004",
        meta: {
          database_error:
            'PostgresError { code: "23514", message: "check violation" }',
        },
      }),
    ],
  ])(
    "translates a database scope race from %s into a safe request-correlated envelope",
    async (_name, error) => {
      const { service, tx } = buildHarness();
      tx.userRoleAssignment.create.mockRejectedValue(error);

      await expect(service.assign([command], actor)).rejects.toMatchObject({
        response: {
          statusCode: 400,
          code: "INVALID_ASSIGNMENT_SCOPE",
          message: "The role assignment scope is invalid.",
          requestId: actor.requestId,
        },
      });
    },
  );

  it.each([
    [
      "direct overlap signal",
      Object.assign(new Error("database overlap detail"), {
        code: "PRA01",
      }),
    ],
    [
      "Prisma-wrapped overlap signal",
      Object.assign(new Error("database overlap detail"), {
        code: "P2004",
        meta: {
          database_error:
            'PostgresError { code: "PRA01", message: "overlap" }',
        },
      }),
    ],
  ])(
    "translates an assignment %s into a safe request-correlated conflict",
    async (_name, databaseError) => {
      const { service, tx } = buildHarness();
      tx.userRoleAssignment.create.mockRejectedValue(databaseError);

      await expect(service.assign([command], actor)).rejects.toMatchObject({
        response: {
          statusCode: 409,
          code: "ASSIGNMENT_OVERLAP",
          message:
            "The role assignment overlaps an existing active assignment.",
          requestId: actor.requestId,
        },
      });
    },
  );

  it.each([
    [
      "Prisma transaction conflict",
      Object.assign(new Error("retry transaction"), { code: "P2034" }),
    ],
    [
      "serialization failure",
      Object.assign(new Error("serialization failure"), {
        code: "P2004",
        meta: { code: "40001" },
      }),
    ],
    [
      "deadlock",
      Object.assign(new Error("deadlock"), {
        code: "P2004",
        meta: {
          database_error:
            'PostgresError { code: "40P01", message: "deadlock" }',
        },
      }),
    ],
  ])("does not mislabel %s as assignment overlap", async (_name, error) => {
    const { service, tx } = buildHarness();
    tx.userRoleAssignment.create.mockRejectedValue(error);

    await expect(service.assign([command], actor)).rejects.toBe(error);
  });

  it("creates assignments in resolved identity order and returns caller order", async () => {
    const { service, tx } = buildHarness();
    const siteCommand: AssignRoleCommand = {
      ...command,
      userId: "user-z",
      roleDefinitionId: "role-a-site",
    };
    const organisationCommand: AssignRoleCommand = {
      ...command,
      userId: "user-a",
      roleDefinitionId: "role-z-organisation",
    };
    tx.orgRoleDefinition.findFirst.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve(
          where.id === organisationCommand.roleDefinitionId
            ? {
                id: organisationCommand.roleDefinitionId,
                orgId: actor.orgId,
                tenantId: null,
                scope: "organisation",
                isActive: true,
                isSystem: true,
              }
            : {
                id: siteCommand.roleDefinitionId,
                orgId: actor.orgId,
                tenantId: actor.tenantId,
                scope: "site",
                isActive: true,
                isSystem: true,
              },
        ),
    );
    tx.userRoleAssignment.create.mockImplementation(
      async ({ data }: { data: { userId: string } }) => ({
        ...data,
        id: `assignment-${data.userId}`,
        revokedAt: null,
        revokedById: null,
      }),
    );

    const assignments = await service.assign(
      [siteCommand, organisationCommand],
      actor,
    );

    expect(
      tx.userRoleAssignment.create.mock.calls.map(
        ([input]) => input.data.userId,
      ),
    ).toEqual(["user-a", "user-z"]);
    expect(assignments.map((assignment) => assignment.userId)).toEqual([
      "user-z",
      "user-a",
    ]);
  });

  it("logically revokes once without physically deleting assignment history", async () => {
    const { service, tx, cache } = buildHarness();

    await expect(service.revoke("assignment-1", actor)).resolves.toEqual(
      expect.objectContaining({ id: "assignment-1" }),
    );

    expect(tx.userRoleAssignment.updateMany).toHaveBeenCalledWith({
      where: {
        id: "assignment-1",
        orgId: "org-1",
        revokedAt: null,
      },
      data: {
        revokedAt: expect.any(Date),
        revokedById: "actor-1",
      },
    });
    expect(tx.userRoleAssignment).not.toHaveProperty("delete");
    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: "ROLE_ASSIGNMENT",
        action: "ASSIGNMENT_REVOKED",
        metadata: expect.objectContaining({ requestId: actor.requestId }),
      }),
    });
    expect(cache.invalidateUser).toHaveBeenCalledWith("user-1", "org-1");
  });

  it("lists assignments with an organisation predicate inside trusted RLS context", async () => {
    const { service, tx } = buildHarness();

    await service.list(actor);

    expect(tx.$queryRawUnsafe).toHaveBeenCalledWith(
      "SELECT set_config('app.assignment_org_read', 'on', true)",
    );
    expect(tx.userRoleAssignment.findMany).toHaveBeenCalledWith({
      where: { orgId: "org-1" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 51,
    });
  });

  it("uses a default 50-item creation-order page and validates list bounds", async () => {
    const { service, tx } = buildHarness();

    await service.list(actor);
    await service.list(actor, { limit: 50 });
    await expect(service.list(actor, { limit: 0 })).rejects.toMatchObject({
      response: { statusCode: 400, code: "INVALID_ASSIGNMENT_REQUEST" },
    });
    await expect(service.list(actor, { limit: 51 })).rejects.toMatchObject({
      response: { statusCode: 400, code: "INVALID_ASSIGNMENT_REQUEST" },
    });

    expect(tx.userRoleAssignment.findMany).toHaveBeenNthCalledWith(1, {
      where: { orgId: "org-1" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 51,
    });
    expect(tx.userRoleAssignment.findMany).toHaveBeenNthCalledWith(2, {
      where: { orgId: "org-1" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 51,
    });
  });

  it("returns deterministic creation-order pages without widening the organisation predicate", async () => {
    const { service, tx } = buildHarness();
    const createdAt = new Date("2026-07-30T09:00:00.000Z");
    const first = { id: "assignment-z", createdAt, orgId: "org-1" };
    const second = { id: "assignment-a", createdAt, orgId: "org-1" };
    const third = {
      id: "assignment-earlier",
      createdAt: new Date("2026-07-29T09:00:00.000Z"),
      orgId: "org-1",
    };
    tx.userRoleAssignment.findMany
      .mockResolvedValueOnce([first, second, third])
      .mockResolvedValueOnce([third])
      .mockResolvedValueOnce([]);

    const firstPage = await service.list(actor, { limit: 2 });
    const nextPage = await service.list(actor, {
      limit: 2,
      cursor: firstPage.nextCursor ?? undefined,
    });
    const exhaustedPage = await service.list(actor, {
      limit: 2,
      cursor: nextPage.nextCursor ?? undefined,
    });

    expect(firstPage.items.map(({ id }) => id)).toEqual([
      "assignment-z",
      "assignment-a",
    ]);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    expect(nextPage.items.map(({ id }) => id)).toEqual(["assignment-earlier"]);
    expect(nextPage.nextCursor).toBeNull();
    expect(exhaustedPage).toEqual({ items: [], nextCursor: null });
    expect(tx.userRoleAssignment.findMany).toHaveBeenNthCalledWith(2, {
      where: {
        orgId: "org-1",
        OR: [
          { createdAt: { lt: createdAt } },
          { createdAt, id: { lt: "assignment-a" } },
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 3,
    });
  });

  it("rejects malformed opaque list cursors before reading assignments", async () => {
    const { service, tx } = buildHarness();

    await expect(
      service.list(actor, { cursor: "not-a-cursor" }),
    ).rejects.toMatchObject({
      response: {
        statusCode: 400,
        code: "INVALID_ASSIGNMENT_REQUEST",
        requestId: actor.requestId,
      },
    });
    expect(tx.userRoleAssignment.findMany).not.toHaveBeenCalled();
  });

  it("keeps successful assignment durable when direct invalidation fails and lets the cache fall back within 60 seconds", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-07-29T12:00:00.000Z"));
    try {
      const cache = new AccessCacheService();
      const load = jest
        .fn()
        .mockResolvedValueOnce({ marker: "before" })
        .mockResolvedValueOnce({ marker: "after" });
      const key = { userId: "user-1", orgId: "org-1", tenantId: "site-1" };
      await cache.getOrLoad(key, load);
      jest.spyOn(cache, "invalidateUser").mockRejectedValueOnce(
        new Error("local invalidation failed"),
      );
      const base = buildHarness();
      const service = new AssignmentsService(
        {
          run: async (_actor, operation) =>
            operation(base.tx as unknown as Prisma.TransactionClient),
        },
        new OutboxService(),
        cache,
        passThroughRoleSafety,
      );

      await expect(service.assign([command], actor)).resolves.toHaveLength(1);
      await expect(cache.getOrLoad(key, load)).resolves.toEqual({
        marker: "before",
      });
      jest.advanceTimersByTime(MAX_ACCESS_CACHE_TTL_MS);
      await expect(cache.getOrLoad(key, load)).resolves.toEqual({
        marker: "after",
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
