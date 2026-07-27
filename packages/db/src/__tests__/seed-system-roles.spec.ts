import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import {
  seedSystemRoles,
  SYSTEM_ROLE_SEED_DATABASE_ROLE,
  type SystemRoleSeedClient,
  type SystemRoleTemplates,
} from "../seed-system-roles";
import {
  deleteSystemRoleSeedTestOrganisation,
  provisionSystemRoleSeedTestRoles,
} from "./system-role-seed-test-database";

const TEMPLATES = {
  organisationHead: {
    name: "Organisation Head",
    scope: "organisation",
    protected: true,
    permissions: [
      "org.active",
      "site.active",
      "relationship.active",
      "assignment.active",
      "inactive",
      "unavailable",
      "unknown",
    ],
  },
  siteLead: {
    name: "Site Lead",
    scope: "site",
    protected: true,
    permissions: [
      "org.active",
      "site.active",
      "relationship.active",
      "assignment.active",
    ],
  },
  parent: {
    name: "Parent",
    scope: "relationship",
    protected: true,
    permissions: ["site.active", "relationship.active"],
  },
} as const satisfies SystemRoleTemplates;

interface StoredRole {
  id: string;
  orgId: string;
  tenantId: string | null;
  name: string;
  scope: "organisation" | "site" | "relationship";
  isSystem: boolean;
  isActive: boolean;
  version: number;
  createdById: string;
  updatedById: string;
  createdAt: Date;
  updatedAt: Date;
}

class InMemorySystemRoleSeedClient {
  readonly roles = new Map<string, StoredRole>([
    [
      "custom-role",
      {
        id: "custom-role",
        orgId: "org-a",
        tenantId: "site-a",
        name: "Site Lead",
        scope: "site",
        isSystem: false,
        isActive: true,
        version: 3,
        createdById: "customer",
        updatedById: "customer",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      },
    ],
  ]);
  readonly permissions = new Map([
    [
      "custom-role:site.active",
      {
        roleDefinitionId: "custom-role",
        permissionKey: "site.active",
        grantedById: "customer",
        grantedAt: new Date("2026-01-03T00:00:00.000Z"),
      },
    ],
  ]);
  sessionUser = SYSTEM_ROLE_SEED_DATABASE_ROLE;
  transactionCount = 0;
  roleCreates = 0;
  roleUpdates = 0;
  permissionCreates = 0;
  permissionDeletes = 0;
  organisationReads = 0;
  assignmentDelegateAccesses = 0;

  readonly org = {
    findMany: async () => {
      this.organisationReads += 1;
      return [
        {
          id: "org-b",
          tenants: [{ id: "site-b-2" }, { id: "site-b-1" }],
        },
        { id: "org-a", tenants: [{ id: "site-a" }] },
      ];
    },
  };

  readonly permissionDefinition = {
    findMany: async ({
      where,
    }: {
      where: { key: { in: string[] }; isActive: true };
    }) =>
      [
        {
          key: "assignment.active",
          scope: "assignment" as const,
          isActive: true,
        },
        { key: "inactive", scope: "site" as const, isActive: false },
        { key: "org.active", scope: "organisation" as const, isActive: true },
        {
          key: "relationship.active",
          scope: "relationship" as const,
          isActive: true,
        },
        { key: "site.active", scope: "site" as const, isActive: true },
        { key: "unavailable", scope: "site" as const, isActive: true },
      ].filter(
        ({ key, isActive }) =>
          where.key.in.includes(key) && isActive === where.isActive,
      ),
  };

  readonly orgRoleDefinition = {
    findUnique: async ({ where }: { where: { id: string } }) =>
      this.roles.get(where.id) ?? null,
    create: async ({ data }: { data: StoredRole }) => {
      this.roleCreates += 1;
      const now = new Date("2026-02-01T00:00:00.000Z");
      const role = { ...data, createdAt: now, updatedAt: now };
      this.roles.set(role.id, role);
      return role;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<StoredRole>;
    }) => {
      this.roleUpdates += 1;
      const role = this.roles.get(where.id);
      if (!role) throw new Error(`Missing role ${where.id}`);
      const updated = {
        ...role,
        ...data,
        updatedAt: new Date(role.updatedAt.getTime() + 1),
      };
      this.roles.set(where.id, updated);
      return updated;
    },
  };

  readonly orgRolePermission = {
    findMany: async ({ where }: { where: { roleDefinitionId: string } }) =>
      [...this.permissions.values()].filter(
        ({ roleDefinitionId }) => roleDefinitionId === where.roleDefinitionId,
      ),
    deleteMany: async ({
      where,
    }: {
      where: {
        roleDefinitionId: string;
        permissionKey: { in: string[] };
      };
    }) => {
      let count = 0;
      for (const permissionKey of where.permissionKey.in) {
        if (
          this.permissions.delete(`${where.roleDefinitionId}:${permissionKey}`)
        ) {
          count += 1;
        }
      }
      this.permissionDeletes += count;
      return { count };
    },
    createMany: async ({
      data,
    }: {
      data: Array<{
        roleDefinitionId: string;
        permissionKey: string;
        grantedById: string;
      }>;
      skipDuplicates: true;
    }) => {
      for (const row of data) {
        this.permissions.set(`${row.roleDefinitionId}:${row.permissionKey}`, {
          ...row,
          grantedAt: new Date("2026-02-01T00:00:00.000Z"),
        });
      }
      this.permissionCreates += data.length;
      return { count: data.length };
    },
  };

  get userRoleAssignment(): never {
    this.assignmentDelegateAccesses += 1;
    throw new Error("System-role seeding must not create assignments");
  }

  async $queryRawUnsafe(): Promise<Array<{ sessionUser: string }>> {
    return [{ sessionUser: this.sessionUser }];
  }

  async $transaction<T>(
    callback: (tx: InMemorySystemRoleSeedClient) => Promise<T>,
  ): Promise<T> {
    this.transactionCount += 1;
    return callback(this);
  }

  resetMutationCounts(): void {
    this.roleCreates = 0;
    this.roleUpdates = 0;
    this.permissionCreates = 0;
    this.permissionDeletes = 0;
  }
}

function snapshot(client: InMemorySystemRoleSeedClient): unknown {
  return {
    roles: [...client.roles.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    permissions: [...client.permissions.values()].sort((left, right) =>
      `${left.roleDefinitionId}:${left.permissionKey}`.localeCompare(
        `${right.roleDefinitionId}:${right.permissionKey}`,
      ),
    ),
  };
}

describe("system role seeding", () => {
  it("uses one transaction per organisation and performs no writes on an unchanged rerun", async () => {
    const client = new InMemorySystemRoleSeedClient();
    const resolveAvailablePermissionKeys = async (orgId: string) =>
      orgId === "org-a"
        ? [
            "assignment.active",
            "org.active",
            "relationship.active",
            "site.active",
          ]
        : ["relationship.active", "site.active"];

    await seedSystemRoles(
      client as unknown as SystemRoleSeedClient,
      TEMPLATES,
      resolveAvailablePermissionKeys,
    );
    const firstSnapshot = snapshot(client);
    expect(client.transactionCount).toBe(2);
    expect(client.roles.get("custom-role")).toMatchObject({
      name: "Site Lead",
      isSystem: false,
      version: 3,
      updatedById: "customer",
    });

    client.resetMutationCounts();
    await seedSystemRoles(
      client as unknown as SystemRoleSeedClient,
      TEMPLATES,
      resolveAvailablePermissionKeys,
    );

    expect(snapshot(client)).toEqual(firstSnapshot);
    expect(client).toMatchObject({
      roleCreates: 0,
      roleUpdates: 0,
      permissionCreates: 0,
      permissionDeletes: 0,
      transactionCount: 4,
      assignmentDelegateAccesses: 0,
    });
  });

  it("fails before reading organisations when the connection identity is wrong", async () => {
    const client = new InMemorySystemRoleSeedClient();
    client.sessionUser = "pathway_runtime";

    await expect(
      seedSystemRoles(
        client as unknown as SystemRoleSeedClient,
        TEMPLATES,
        async () => ["site.active"],
      ),
    ).rejects.toThrow(/pathway_system_role_seed/);
    expect(client.organisationReads).toBe(0);
    expect(client.transactionCount).toBe(0);
  });

  it("keeps prior organisation commits when a later organisation fails", async () => {
    const client = new InMemorySystemRoleSeedClient();

    await expect(
      seedSystemRoles(
        client as unknown as SystemRoleSeedClient,
        TEMPLATES,
        async (orgId) => {
          if (orgId === "org-b") throw new Error("org-b capability failure");
          return ["site.active"];
        },
      ),
    ).rejects.toThrow("org-b capability failure");

    expect(
      [...client.roles.values()].filter(
        ({ orgId, isSystem }) => orgId === "org-a" && isSystem,
      ),
    ).toHaveLength(3);
  });

  it("filters inactive, unavailable, unknown, and scope-incompatible permissions", async () => {
    const client = new InMemorySystemRoleSeedClient();

    await seedSystemRoles(
      client as unknown as SystemRoleSeedClient,
      TEMPLATES,
      async () => [
        "assignment.active",
        "inactive",
        "org.active",
        "relationship.active",
        "site.active",
        "unknown",
      ],
    );

    const roleId = "system-role:org-a:organisation:organisationHead";
    expect(
      [...client.permissions.values()]
        .filter(({ roleDefinitionId }) => roleDefinitionId === roleId)
        .map(({ permissionKey }) => permissionKey)
        .sort(),
    ).toEqual([
      "assignment.active",
      "org.active",
      "relationship.active",
      "site.active",
    ]);
  });
});

const describeIfDb =
  process.env.PATHWAY_RUN_DB_INTEGRATION_TESTS === "1"
    ? describe
    : describe.skip;

describeIfDb("system role database identity protection", () => {
  let admin: PrismaClient;
  let runtime: PrismaClient;
  let seedClient: PrismaClient;
  let orgId: string;
  let tenantId: string;

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL ?? "";
    const hostname = new URL(databaseUrl).hostname;
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      throw new Error(
        `Refusing to run system-role protection tests against "${hostname}"`,
      );
    }
    const urls = await provisionSystemRoleSeedTestRoles(databaseUrl);
    admin = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    runtime = new PrismaClient({
      datasources: { db: { url: urls.runtimeUrl } },
    });
    seedClient = new PrismaClient({
      datasources: { db: { url: urls.seedUrl } },
    });
  });

  beforeEach(async () => {
    const org = await admin.org.create({
      data: {
        id: randomUUID(),
        name: "System role protection",
        slug: `system-role-protection-${randomUUID()}`,
        planCode: "trial",
      },
    });
    const tenant = await admin.tenant.create({
      data: {
        id: randomUUID(),
        orgId: org.id,
        name: "Protected site",
        slug: `protected-site-${randomUUID()}`,
      },
    });
    orgId = org.id;
    tenantId = tenant.id;
    await admin.permissionDefinition.upsert({
      where: { key: "site.active" },
      update: { isActive: true, scope: "site" },
      create: {
        key: "site.active",
        label: "Site active",
        description: "Database protection fixture",
        scope: "site",
        sensitivity: "standard",
        delegable: true,
      },
    });
  });

  afterEach(async () => {
    await deleteSystemRoleSeedTestOrganisation(admin, orgId);
  });

  afterAll(async () => {
    await Promise.all([
      admin.$disconnect(),
      runtime.$disconnect(),
      seedClient.$disconnect(),
    ]);
  });

  async function withRuntimeContext<T>(
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return runtime.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        "SELECT set_config('app.org_id', $1, true)",
        orgId,
      );
      await tx.$executeRawUnsafe(
        "SELECT set_config('app.tenant_id', $1, true)",
        tenantId,
      );
      return callback(tx);
    });
  }

  it("rejects marker and SET ROLE bypasses from a fresh runtime connection while the seed login succeeds", async () => {
    const templates = {
      siteLead: {
        name: "Site Lead",
        scope: "site",
        protected: true,
        permissions: ["site.active"],
      },
    } as const satisfies SystemRoleTemplates;

    await seedSystemRoles(
      seedClient as unknown as SystemRoleSeedClient,
      templates,
      async () => ["site.active"],
    );
    const roleId = `system-role:${orgId}:${tenantId}:siteLead`;
    await expect(
      admin.$queryRawUnsafe<
        Array<{
          rolinherit: boolean;
          rolbypassrls: boolean;
          rolcreaterole: boolean;
          rolsuper: boolean;
        }>
      >(
        `SELECT rolinherit, rolbypassrls, rolcreaterole, rolsuper
         FROM pg_roles
         WHERE rolname = 'pathway_system_role_seed'`,
      ),
    ).resolves.toEqual([
      {
        rolinherit: false,
        rolbypassrls: false,
        rolcreaterole: false,
        rolsuper: false,
      },
    ]);

    await expect(
      withRuntimeContext(async (tx) => {
        await tx.$executeRawUnsafe(
          "SELECT set_config('app.system_role_seed', 'on', true)",
        );
        await tx.orgRoleDefinition.update({
          where: { id: roleId },
          data: { name: "Runtime marker edit" },
        });
      }),
    ).rejects.toThrow(/dedicated system-role seed identity/i);

    await expect(
      withRuntimeContext((tx) =>
        tx.orgRoleDefinition.create({
          data: {
            id: `runtime-system-role:${randomUUID()}`,
            orgId,
            tenantId,
            name: "Runtime system insert",
            scope: "site",
            isSystem: true,
            createdById: randomUUID(),
            updatedById: randomUUID(),
          },
        }),
      ),
    ).rejects.toThrow(/dedicated system-role seed identity/i);
    await expect(
      withRuntimeContext((tx) =>
        tx.orgRoleDefinition.delete({ where: { id: roleId } }),
      ),
    ).rejects.toThrow(/dedicated system-role seed identity/i);

    await expect(
      runtime.$executeRawUnsafe("SET ROLE pathway_system_role_seed"),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withRuntimeContext((tx) =>
        tx.orgRolePermission.create({
          data: {
            roleDefinitionId: roleId,
            permissionKey: "site.active",
            grantedById: randomUUID(),
          },
        }),
      ),
    ).rejects.toThrow(/dedicated system-role seed identity/i);
    await expect(
      withRuntimeContext((tx) =>
        tx.orgRolePermission.update({
          where: {
            roleDefinitionId_permissionKey: {
              roleDefinitionId: roleId,
              permissionKey: "site.active",
            },
          },
          data: { grantedById: randomUUID() },
        }),
      ),
    ).rejects.toThrow(/dedicated system-role seed identity/i);
    await expect(
      withRuntimeContext((tx) =>
        tx.orgRolePermission.delete({
          where: {
            roleDefinitionId_permissionKey: {
              roleDefinitionId: roleId,
              permissionKey: "site.active",
            },
          },
        }),
      ),
    ).rejects.toThrow(/dedicated system-role seed identity/i);

    await expect(
      seedSystemRoles(
        seedClient as unknown as SystemRoleSeedClient,
        templates,
        async () => ["site.active"],
      ),
    ).resolves.toBeDefined();
  });
});
