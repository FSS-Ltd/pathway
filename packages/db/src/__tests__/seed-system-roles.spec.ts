import { randomUUID } from "node:crypto";
import type { PrismaClientType } from "../index";
import {
  seedSystemRoles,
  SYSTEM_ACTOR_ID,
  type SystemRoleSeedTransaction,
  type SystemRoleTemplates,
} from "../seed-system-roles";

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
}

class InMemorySystemRoleSeedTransaction {
  trustedSeed = false;
  assignmentDelegateAccesses = 0;
  readonly roles = new Map<string, StoredRole>([
    [
      "custom-role",
      {
        id: "custom-role",
        orgId: "org-a",
        tenantId: "site-a",
        name: "Custom clone",
        scope: "site",
        isSystem: false,
        isActive: true,
        version: 3,
        createdById: "customer",
        updatedById: "customer",
      },
    ],
  ]);
  readonly permissions = new Set(["custom-role:site.active"]);

  readonly org = {
    findMany: async () => [
      {
        id: "org-b",
        tenants: [{ id: "site-b-2" }, { id: "site-b-1" }],
      },
      { id: "org-a", tenants: [{ id: "site-a" }] },
    ],
  };

  readonly permissionDefinition = {
    findMany: async () => [
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
    ],
  };

  readonly orgRoleDefinition = {
    upsert: async ({
      where,
      update,
      create,
    }: {
      where: { id: string };
      update: Partial<StoredRole>;
      create: StoredRole;
    }): Promise<StoredRole> => {
      this.assertTrusted();
      const stored = this.roles.get(where.id);
      const next = stored ? { ...stored, ...update } : create;
      this.roles.set(where.id, next);
      return next;
    },
  };

  readonly orgRolePermission = {
    deleteMany: async ({
      where,
    }: {
      where: {
        roleDefinitionId: string;
        permissionKey?: { notIn: string[] };
      };
    }): Promise<{ count: number }> => {
      this.assertTrusted();
      let count = 0;
      for (const value of [...this.permissions]) {
        const separatorIndex = value.lastIndexOf(":");
        const roleDefinitionId = value.slice(0, separatorIndex);
        const permissionKey = value.slice(separatorIndex + 1);
        if (
          roleDefinitionId === where.roleDefinitionId &&
          (!where.permissionKey ||
            !where.permissionKey.notIn.includes(permissionKey ?? ""))
        ) {
          this.permissions.delete(value);
          count += 1;
        }
      }
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
    }): Promise<{ count: number }> => {
      this.assertTrusted();
      let count = 0;
      for (const row of data) {
        expect(row.grantedById).toBe(SYSTEM_ACTOR_ID);
        const value = `${row.roleDefinitionId}:${row.permissionKey}`;
        if (!this.permissions.has(value)) {
          this.permissions.add(value);
          count += 1;
        }
      }
      return { count };
    },
  };

  get userRoleAssignment(): never {
    this.assignmentDelegateAccesses += 1;
    throw new Error("System-role seeding must not create assignments");
  }

  async $executeRawUnsafe(query: string): Promise<number> {
    if (query.includes("app.system_role_seed")) {
      this.trustedSeed = true;
      return 1;
    }
    throw new Error(`Unexpected SQL: ${query}`);
  }

  private assertTrusted(): void {
    if (!this.trustedSeed) {
      throw new Error("System role mutation requires trusted seed context");
    }
  }
}

describe("system role seeding", () => {
  it("seeds every organisation/site deterministically without duplicates or assignments", async () => {
    const tx = new InMemorySystemRoleSeedTransaction();
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
      tx as unknown as SystemRoleSeedTransaction,
      TEMPLATES,
      resolveAvailablePermissionKeys,
    );
    const rolesAfterFirstRun = [...tx.roles.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
    const permissionsAfterFirstRun = [...tx.permissions].sort();
    const siteLeadRoleId = rolesAfterFirstRun.find(
      ({ orgId, tenantId, name }) =>
        orgId === "org-a" && tenantId === "site-a" && name === "Site Lead",
    )?.id;
    tx.permissions.add(`${siteLeadRoleId}:org.active`);

    await seedSystemRoles(
      tx as unknown as SystemRoleSeedTransaction,
      TEMPLATES,
      resolveAvailablePermissionKeys,
    );

    expect(
      [...tx.roles.values()].sort((left, right) =>
        left.id.localeCompare(right.id),
      ),
    ).toEqual(rolesAfterFirstRun);
    expect([...tx.permissions].sort()).toEqual(permissionsAfterFirstRun);
    expect(tx.roles.size).toBe(8);
    expect(tx.permissions.size).toBe(16);
    expect(tx.roles.get("custom-role")).toMatchObject({
      name: "Custom clone",
      isSystem: false,
      version: 3,
      updatedById: "customer",
    });
    expect(tx.permissions).toContain("custom-role:site.active");
    expect(tx.assignmentDelegateAccesses).toBe(0);
  });

  it("filters inactive, unavailable, unknown, and scope-incompatible permissions", async () => {
    const tx = new InMemorySystemRoleSeedTransaction();

    await seedSystemRoles(
      tx as unknown as SystemRoleSeedTransaction,
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

    const organisationRoleId = [...tx.roles.values()].find(
      ({ orgId, name }) => orgId === "org-a" && name === "Organisation Head",
    )?.id;
    const siteRoleId = [...tx.roles.values()].find(
      ({ orgId, tenantId, name }) =>
        orgId === "org-a" && tenantId === "site-a" && name === "Site Lead",
    )?.id;
    const parentRoleId = [...tx.roles.values()].find(
      ({ orgId, name }) => orgId === "org-a" && name === "Parent",
    )?.id;

    expect(
      [...tx.permissions]
        .filter((value) => value.startsWith(`${organisationRoleId}:`))
        .sort(),
    ).toEqual([
      `${organisationRoleId}:assignment.active`,
      `${organisationRoleId}:org.active`,
      `${organisationRoleId}:relationship.active`,
      `${organisationRoleId}:site.active`,
    ]);
    expect(
      [...tx.permissions]
        .filter((value) => value.startsWith(`${siteRoleId}:`))
        .sort(),
    ).toEqual([
      `${siteRoleId}:assignment.active`,
      `${siteRoleId}:relationship.active`,
      `${siteRoleId}:site.active`,
    ]);
    expect(
      [...tx.permissions]
        .filter((value) => value.startsWith(`${parentRoleId}:`))
        .sort(),
    ).toEqual([`${parentRoleId}:relationship.active`]);
  });
});

const describeIfDb =
  process.env.PATHWAY_RUN_DB_INTEGRATION_TESTS === "1"
    ? describe
    : describe.skip;

describeIfDb("system role database protection", () => {
  let prisma: PrismaClientType;
  let orgId: string;
  let tenantId: string;

  beforeAll(async () => {
    const hostname = new URL(process.env.DATABASE_URL ?? "").hostname;
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      throw new Error(
        `Refusing to run system-role protection tests against "${hostname}"`,
      );
    }
    prisma = (await import("../index")).prisma;
  });

  beforeEach(async () => {
    const org = await prisma.org.create({
      data: {
        id: randomUUID(),
        name: "System role protection",
        slug: `system-role-protection-${randomUUID()}`,
        planCode: "trial",
      },
    });
    const tenant = await prisma.tenant.create({
      data: {
        id: randomUUID(),
        orgId: org.id,
        name: "Protected site",
        slug: `protected-site-${randomUUID()}`,
      },
    });
    orgId = org.id;
    tenantId = tenant.id;
    await prisma.permissionDefinition.upsert({
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
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        "SELECT set_config('app.system_role_seed', 'on', true)",
      );
      await tx.orgRoleDefinition.deleteMany({ where: { orgId } });
    });
    await prisma.tenant.deleteMany({ where: { orgId } });
    await prisma.org.delete({ where: { id: orgId } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects customer changes to system templates and grants while allowing trusted reruns", async () => {
    const templates = {
      siteLead: {
        name: "Site Lead",
        scope: "site",
        protected: true,
        permissions: ["site.active"],
      },
    } as const satisfies SystemRoleTemplates;

    await prisma.$transaction((tx) =>
      seedSystemRoles(tx, templates, async () => ["site.active"]),
    );
    const role = await prisma.orgRoleDefinition.findFirstOrThrow({
      where: { orgId, tenantId, isSystem: true },
    });

    await expect(
      prisma.orgRoleDefinition.update({
        where: { id: role.id },
        data: { name: "Customer edit" },
      }),
    ).rejects.toThrow(/trusted system-role seed context/i);
    await expect(
      prisma.orgRolePermission.delete({
        where: {
          roleDefinitionId_permissionKey: {
            roleDefinitionId: role.id,
            permissionKey: "site.active",
          },
        },
      }),
    ).rejects.toThrow(/trusted system-role seed context/i);
    await expect(
      prisma.orgRoleDefinition.delete({ where: { id: role.id } }),
    ).rejects.toThrow(/trusted system-role seed context/i);

    await expect(
      prisma.$transaction((tx) =>
        seedSystemRoles(tx, templates, async () => ["site.active"]),
      ),
    ).resolves.toBeDefined();
  });
});
