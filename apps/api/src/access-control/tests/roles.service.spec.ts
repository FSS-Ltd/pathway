import { CAPABILITY_DEFINITIONS } from "@pathway/platform";
import type { Prisma } from "@pathway/db";
import {
  createRolesTransactionBoundary,
  resolveTemporaryRoleApiBootstrap,
  roleScopeAcceptsPermissionScope,
  RolesService,
  type RoleActorContext,
  type RolesTransactionBoundary,
} from "../roles.service";

const orgId = "org-1";

describe("temporary role API bootstrap", () => {
  it("permits only an authenticated legacy organisation admin to bootstrap delegable organisation-head keys", () => {
    const result = resolveTemporaryRoleApiBootstrap({
      orgId,
      userId: "user-1",
      legacyOrgRoles: ["org:admin"],
      activeCapabilities: ["ace.pace.read", "ace.pace.record"],
      activePermissionDefinitions: [
        { key: "ace.pace.read", delegable: true, isActive: true },
        { key: "ace.pace.record", delegable: true, isActive: true },
      ],
    });

    expect(result).toEqual(["ace.pace.read", "ace.pace.record"]);
  });

  it("does not let a display role, inactive metadata, non-delegable metadata, or inactive capabilities authorise a grant", () => {
    const result = resolveTemporaryRoleApiBootstrap({
      orgId,
      userId: "user-1",
      legacyOrgRoles: ["Organisation Head"],
      activeCapabilities: ["ace.pace.read"],
      activePermissionDefinitions: [
        { key: "ace.pace.read", delegable: false, isActive: true },
        { key: "ace.pace.record", delegable: true, isActive: false },
      ],
    });

    expect(result).toEqual([]);
    expect(CAPABILITY_DEFINITIONS["platform.access.roles.manage"].delegable).toBe(false);
  });
});

describe("role permission scope compatibility", () => {
  it("allows organisation roles to include child and assignment permissions", () => {
    expect(roleScopeAcceptsPermissionScope("organisation", "organisation")).toBe(true);
    expect(roleScopeAcceptsPermissionScope("organisation", "site")).toBe(true);
    expect(roleScopeAcceptsPermissionScope("organisation", "relationship")).toBe(true);
    expect(roleScopeAcceptsPermissionScope("organisation", "assignment")).toBe(true);
  });

  it("does not widen site or relationship role permissions", () => {
    expect(roleScopeAcceptsPermissionScope("site", "organisation")).toBe(false);
    expect(roleScopeAcceptsPermissionScope("relationship", "site")).toBe(false);
  });
});

describe("RolesService route authority", () => {
  const actor = {
    orgId,
    tenantId: "site-1",
    userId: "user-1",
    legacyOrgRoles: ["org:admin"],
    requestId: "role-service-request-1",
  };

  const role = {
    id: "role-1", orgId, tenantId: "site-1", name: "PACE Staff",
    description: null, scope: "site" as const, isSystem: false, isActive: true,
    version: 1, permissions: [{ permissionKey: "ace.pace.read" }],
  };

  function serviceWith(tx: object): RolesService {
    const transaction: RolesTransactionBoundary = {
      run: async (_actor, operation) => operation(tx as never),
    };
    return new RolesService(transaction);
  }

  function allowedService(options: {
    metadata?: Array<{ key: string; delegable: boolean; isActive: boolean; scope: "organisation" | "site" | "relationship" | "assignment" }>;
    role?: typeof role;
    auditEventCreate?: jest.Mock;
    roleCreate?: jest.Mock;
    roleUpdateMany?: jest.Mock;
    transaction?: RolesTransactionBoundary;
  } = {}) {
    const tx = {
      orgMembership: { findUnique: jest.fn().mockResolvedValue({ role: "ORG_ADMIN" }) },
      permissionDefinition: {
        findUnique: jest.fn().mockResolvedValue({ isActive: true }),
        findMany: jest.fn().mockResolvedValue(options.metadata ?? [{
          key: "ace.pace.read", delegable: true, isActive: true, scope: "site",
        }]),
      },
      orgVertical: { findUnique: jest.fn().mockResolvedValue({ vertical: "ACE_SCHOOL" }) },
      orgModule: { findMany: jest.fn().mockResolvedValue([]) },
      orgRoleDefinition: {
        findMany: jest.fn().mockResolvedValue([options.role ?? role]),
        findFirst: jest.fn().mockResolvedValue(options.role ?? role),
        create: options.roleCreate ?? jest.fn().mockResolvedValue(options.role ?? role),
        updateMany:
          options.roleUpdateMany ??
          jest.fn().mockResolvedValue({ count: 1 }),
      },
      orgRolePermission: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      orgRoleRevision: { create: jest.fn().mockResolvedValue({ id: "revision-1" }) },
      auditEvent: { create: options.auditEventCreate ?? jest.fn().mockResolvedValue({ id: "audit-1" }) },
    };
    const transaction: RolesTransactionBoundary = options.transaction ?? {
      async run<T>(
        _actor: RoleActorContext,
        operation: (client: Prisma.TransactionClient) => Promise<T>,
      ): Promise<T> {
        return operation(tx as never);
      },
    };
    return { service: new RolesService(transaction), tx };
  }

  it("rechecks active database membership before allowing a read route", async () => {
    const service = serviceWith({
      orgMembership: { findUnique: jest.fn().mockResolvedValue({ role: "ORG_MEMBER" }) },
    });

    await expect(service.list(actor)).rejects.toMatchObject({
      response: {
        statusCode: 403,
        code: "ROLE_API_ACCESS_DENIED",
        message: "You are not allowed to manage roles.",
      },
    });
  });

  it("returns the exact safe conflict contract when a version check loses the race", async () => {
    const role = {
      id: "role-1", orgId, tenantId: "site-1", name: "PACE Staff",
      description: null, scope: "site", isSystem: false, isActive: true,
      version: 1, permissions: [],
    };
    const service = serviceWith({
      orgMembership: { findUnique: jest.fn().mockResolvedValue({ role: "ORG_ADMIN" }) },
      permissionDefinition: { findUnique: jest.fn().mockResolvedValue({ isActive: true }) },
      orgVertical: { findUnique: jest.fn().mockResolvedValue({ vertical: "ACE_SCHOOL" }) },
      orgModule: { findMany: jest.fn().mockResolvedValue([]) },
      orgRoleDefinition: { findFirst: jest.fn().mockResolvedValue(role), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    });

    await expect(service.retire("role-1", { expectedVersion: 1 }, actor)).rejects.toMatchObject({
      response: {
        statusCode: 409,
        code: "ROLE_VERSION_CONFLICT",
        message: "The role was changed by another request.",
        requestId: "role-service-request-1",
      },
    });
  });

  it.each([
    ["list", (service: RolesService) => service.list(actor)],
    ["get", (service: RolesService) => service.get("role-1", actor)],
    ["create", (service: RolesService) => service.create({ name: "PACE Staff", scope: "site", permissionKeys: ["ace.pace.read"] }, actor)],
    ["clone", (service: RolesService) => service.clone("role-1", { name: "PACE Staff Copy" }, actor)],
    ["update", (service: RolesService) => service.update({ roleId: "role-1", expectedVersion: 1, name: "PACE Staff", permissionKeys: ["ace.pace.read"] }, actor)],
    ["retire", (service: RolesService) => service.retire("role-1", { expectedVersion: 1 }, actor)],
  ])("checks database role authority before %s", async (_method, invoke) => {
    const service = serviceWith({
      orgMembership: { findUnique: jest.fn().mockResolvedValue(null) },
    });

    await expect(invoke(service)).rejects.toMatchObject({
      response: { statusCode: 403, code: "ROLE_API_ACCESS_DENIED" },
    });
  });

  it("creates, clones, updates, and retires roles with a revision and audit event in the same transaction", async () => {
    const { service, tx } = allowedService();

    await service.create({ name: "PACE Staff", scope: "site", permissionKeys: ["ace.pace.read"] }, actor);
    await service.clone("role-1", { name: "PACE Staff Copy" }, actor);
    await service.update({ roleId: "role-1", expectedVersion: 1, name: "PACE Staff Updated", permissionKeys: ["ace.pace.read"] }, actor);
    await service.retire("role-1", { expectedVersion: 1 }, actor);

    expect(tx.orgRoleDefinition.create).toHaveBeenCalledTimes(2);
    expect(tx.orgRoleDefinition.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.orgRolePermission.deleteMany).toHaveBeenCalledWith({ where: { roleDefinitionId: "role-1" } });
    expect(tx.orgRolePermission.createMany).toHaveBeenCalledTimes(1);
    expect(tx.orgRoleRevision.create).toHaveBeenCalledTimes(4);
    expect(tx.auditEvent.create).toHaveBeenCalledTimes(4);
    expect(tx.auditEvent.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({
        metadata: expect.objectContaining({ requestId: actor.requestId }),
      }),
    }));
    expect(tx.auditEvent.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: expect.objectContaining({
        metadata: expect.objectContaining({ requestId: actor.requestId }),
      }),
    }));
    expect(tx.auditEvent.create).toHaveBeenNthCalledWith(3, expect.objectContaining({
      data: expect.objectContaining({
        metadata: expect.objectContaining({ requestId: actor.requestId }),
      }),
    }));
    expect(tx.auditEvent.create).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: "site-1",
        orgId,
        metadata: expect.objectContaining({ requestId: actor.requestId }),
      }),
    }));
  });

  it.each([
    ["unknown key", ["not.a.permission"], [{ key: "ace.pace.read", delegable: true, isActive: true, scope: "site" }], "UNKNOWN_PERMISSION_KEY"],
    ["non-delegable metadata", ["ace.pace.read"], [{ key: "ace.pace.read", delegable: false, isActive: true, scope: "site" }], "NON_DELEGABLE_PERMISSION_KEY"],
    ["illegal scope", ["ace.pace.read"], [{ key: "ace.pace.read", delegable: true, isActive: true, scope: "organisation" }], "ILLEGAL_ROLE_SCOPE"],
    ["inactive metadata", ["ace.pace.read"], [{ key: "ace.pace.read", delegable: true, isActive: false, scope: "site" }], "INACTIVE_PERMISSION_KEY"],
    ["inactive capability", ["finance.invoices"], [{ key: "finance.invoices", delegable: true, isActive: true, scope: "site" }], "INACTIVE_PERMISSION_KEY"],
    ["non-template capability", ["ace.reports.compile"], [{ key: "ace.reports.compile", delegable: true, isActive: true, scope: "site" }], "ACTOR_CANNOT_DELEGATE"],
  ] as const)("rejects %s during permission validation", async (_caseName, permissionKeys, metadata, code) => {
    const { service } = allowedService({ metadata: [...metadata] });

    await expect(service.create({ name: "PACE Staff", scope: "site", permissionKeys: [...permissionKeys] }, actor)).rejects.toMatchObject({
      response: { code },
    });
  });

  it("clones only the delegable intersection from a protected system template without mutating its source", async () => {
    const systemRole = {
      ...role,
      isSystem: true,
      permissions: [
        { permissionKey: "ace.pace.read" },
        { permissionKey: "platform.access.roles.manage" },
      ],
    };
    const { service, tx } = allowedService({
      role: systemRole,
      metadata: [
        {
          key: "ace.pace.read",
          delegable: true,
          isActive: true,
          scope: "site",
        },
        {
          key: "platform.access.roles.manage",
          delegable: false,
          isActive: true,
          scope: "organisation",
        },
      ],
    });

    await expect(
      service.clone("role-1", { name: "System Copy" }, actor),
    ).resolves.toMatchObject({ id: "role-1" });
    expect(tx.orgRoleDefinition.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        permissions: {
          create: [{
            permissionKey: "ace.pace.read",
            grantedById: actor.userId,
          }],
        },
      }),
      include: { permissions: { select: { permissionKey: true } } },
    });
    expect(tx.orgRoleDefinition.updateMany).not.toHaveBeenCalled();
    expect(tx.orgRolePermission.deleteMany).not.toHaveBeenCalled();
  });

  it("still protects system roles from update and retirement", async () => {
    const { service } = allowedService({ role: { ...role, isSystem: true } });

    await expect(service.update({
      roleId: "role-1",
      expectedVersion: 1,
      name: "Changed System Role",
      permissionKeys: ["ace.pace.read"],
    }, actor)).rejects.toMatchObject({
      response: { statusCode: 403, code: "SYSTEM_ROLE_PROTECTED" },
    });
    await expect(
      service.retire("role-1", { expectedVersion: 1 }, actor),
    ).rejects.toMatchObject({
      response: { statusCode: 403, code: "SYSTEM_ROLE_PROTECTED" },
    });
  });

  it.each([
    ["create", (service: RolesService) => service.create({
      name: "Duplicate Role",
      scope: "site",
      permissionKeys: ["ace.pace.read"],
    }, actor)],
    ["clone", (service: RolesService) =>
      service.clone("role-1", { name: "Duplicate Role" }, actor)],
  ])("returns a safe request-correlated conflict for duplicate role names during %s", async (_operation, invoke) => {
    const uniqueConflict = Object.assign(new Error(
      "Unique constraint failed on the fields: (`orgId`,`tenantId`,`name`)",
    ), {
      code: "P2002",
      meta: { target: ["orgId", "tenantId", "name"] },
    });
    const { service } = allowedService({
      roleCreate: jest.fn().mockRejectedValue(uniqueConflict),
    });

    await expect(invoke(service)).rejects.toMatchObject({
      response: {
        statusCode: 409,
        code: "ROLE_NAME_CONFLICT",
        message: "A role with this name already exists in this scope.",
        requestId: actor.requestId,
      },
    });
  });

  it("returns a safe request-correlated conflict from the shared role update path", async () => {
    const uniqueConflict = Object.assign(new Error(
      "Unique constraint failed on the fields: (`orgId`,`tenantId`,`name`)",
    ), {
      code: "P2002",
      meta: { target: ["orgId", "tenantId", "name"] },
    });
    const { service } = allowedService({
      roleUpdateMany: jest.fn().mockRejectedValue(uniqueConflict),
    });

    await expect(service.update({
      roleId: "role-1",
      expectedVersion: 1,
      name: "Duplicate Role",
      permissionKeys: ["ace.pace.read"],
    }, actor)).rejects.toMatchObject({
      response: {
        statusCode: 409,
        code: "ROLE_NAME_CONFLICT",
        message: "A role with this name already exists in this scope.",
        requestId: actor.requestId,
      },
    });
  });

  it("does not commit a role mutation when its revision or audit write fails", async () => {
    const staged: string[] = [];
    const committed: string[] = [];
    const auditEventCreate = jest.fn().mockImplementation(async () => {
      staged.push("audit");
      throw new Error("audit write failed");
    });
    const transaction: RolesTransactionBoundary = {
      run: async (_actor, operation) => {
        try {
          const tx = allowedService({ auditEventCreate, transaction }).tx;
          tx.orgRoleDefinition.create.mockImplementation(async () => {
            staged.push("role");
            return role;
          });
          tx.orgRoleRevision.create.mockImplementation(async () => {
            staged.push("revision");
            return { id: "revision-1" };
          });
          const result = await operation(tx as never);
          committed.push(...staged);
          return result;
        } catch (error) {
          staged.length = 0;
          throw error;
        }
      },
    };
    const { service } = allowedService({ auditEventCreate, transaction });

    await expect(service.create({ name: "PACE Staff", scope: "site", permissionKeys: ["ace.pace.read"] }, actor)).rejects.toThrow("audit write failed");
    expect(committed).toEqual([]);
    expect(staged).toEqual([]);
  });
});

describe("roles transaction boundary", () => {
  it("is constructible around a real transaction runner for low-privilege integration tests", () => {
    const boundary = createRolesTransactionBoundary(async <T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) => operation({} as never));

    expect(boundary).toEqual(expect.objectContaining({ run: expect.any(Function) }));
  });
});
