import { randomUUID } from "node:crypto";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import {
  isDatabaseAvailable,
  requireDatabase,
} from "../../../test-helpers.e2e";

const TENANT_A = process.env.E2E_TENANT_ID as string;
const TENANT_B = process.env.E2E_TENANT2_ID as string;
const ORG_ID = process.env.E2E_ORG_ID as string;
const CI_RLS_ROLE = "pathway_e2e_rls";

interface RoleFixture {
  roleId: string;
  permissionKey: string;
}

function getRlsRoleName(): string | undefined {
  const configuredRole = process.env.E2E_RLS_ROLE;
  if (!configuredRole) return undefined;
  if (
    configuredRole !== CI_RLS_ROLE ||
    !/^[a-z_][a-z0-9_]*$/.test(configuredRole)
  ) {
    throw new Error(`Unexpected E2E RLS role: ${configuredRole}`);
  }
  return configuredRole;
}

async function withRoleRlsContext<T>(
  tenantId: string,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const roleName = getRlsRoleName();
  return withTenantRlsContext(tenantId, ORG_ID, async (tx) => {
    if (roleName) {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE "${roleName}"`);
      const roleAttributes = await tx.$queryRaw<
        Array<{ currentUser: string; rolsuper: boolean; rolbypassrls: boolean }>
      >`
        SELECT current_user AS "currentUser", rolsuper, rolbypassrls
        FROM pg_roles
        WHERE rolname = current_user
      `;
      expect(roleAttributes).toEqual([
        {
          currentUser: CI_RLS_ROLE,
          rolsuper: false,
          rolbypassrls: false,
        },
      ]);
    }
    return callback(tx);
  });
}

async function insertRole(
  tenantId: string,
  roleId: string,
  name: string,
): Promise<void> {
  await withRoleRlsContext(tenantId, async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "OrgRoleDefinition" (
        "id", "orgId", "tenantId", "name", "scope", "createdById", "updatedById"
      ) VALUES (
        ${roleId}, ${ORG_ID}, ${tenantId}, ${name}, 'site'::"RoleScope", ${randomUUID()}, ${randomUUID()}
      )
    `;
  });
}

async function insertRolePermission(
  tenantId: string,
  roleId: string,
  permissionKey: string,
): Promise<void> {
  await withRoleRlsContext(tenantId, async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "OrgRolePermission" ("roleDefinitionId", "permissionKey", "grantedById")
      VALUES (${roleId}, ${permissionKey}, ${randomUUID()})
    `;
  });
}

describe("organisation role definition RLS", () => {
  const fixtures: Record<string, RoleFixture> = {};
  let permissionKey: string;

  beforeAll(async () => {
    if (!requireDatabase()) return;

    const definitions = await withRoleRlsContext(
      TENANT_A,
      (tx) =>
        tx.$queryRaw<Array<{ key: string }>>`
          SELECT "key" FROM "PermissionDefinition" WHERE "isActive" = true ORDER BY "key" LIMIT 1
        `,
    );
    const definition = definitions[0];
    if (!definition) {
      throw new Error(
        "An active platform PermissionDefinition is required for access-control RLS tests.",
      );
    }
    permissionKey = definition.key;

    const roleA = randomUUID();
    const roleB = randomUUID();
    await insertRole(TENANT_A, roleA, `Role A ${roleA}`);
    await insertRole(TENANT_B, roleB, `Role B ${roleB}`);
    await insertRolePermission(TENANT_A, roleA, permissionKey);
    await insertRolePermission(TENANT_B, roleB, permissionKey);

    fixtures[TENANT_A] = { roleId: roleA, permissionKey };
    fixtures[TENANT_B] = { roleId: roleB, permissionKey };
  });

  afterAll(async () => {
    if (!isDatabaseAvailable()) return;

    for (const tenantId of [TENANT_A, TENANT_B]) {
      const fixture = fixtures[tenantId];
      if (!fixture) continue;
      await withRoleRlsContext(tenantId, async (tx) => {
        await tx.$executeRaw`
          DELETE FROM "OrgRolePermission" WHERE "roleDefinitionId" = ${fixture.roleId}
        `;
        await tx.$executeRaw`
          DELETE FROM "OrgRoleDefinition" WHERE "id" = ${fixture.roleId}
        `;
      });
    }
  });

  it("lists and reads only role definitions at the active site", async () => {
    if (!isDatabaseAvailable()) return;

    const visibleRoleIds = await withRoleRlsContext(
      TENANT_A,
      (tx) => tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "OrgRoleDefinition" WHERE "id" IN (${fixtures[TENANT_A].roleId}, ${fixtures[TENANT_B].roleId})
      `,
    );

    expect(visibleRoleIds).toEqual([{ id: fixtures[TENANT_A].roleId }]);
  });

  it("rejects a role definition that claims another organisation's site", async () => {
    if (!isDatabaseAvailable()) return;

    await expect(
      withRoleRlsContext(
        TENANT_A,
        (tx) =>
          tx.$executeRaw`
          INSERT INTO "OrgRoleDefinition" (
            "id", "orgId", "tenantId", "name", "scope", "createdById", "updatedById"
          ) VALUES (
            ${randomUUID()}, ${randomUUID()}, ${TENANT_A}, 'Mismatched organisation site role', 'site'::"RoleScope", ${randomUUID()}, ${randomUUID()}
          )
        `,
      ),
    ).rejects.toThrow();
  });

  it("rejects a permission row for an unknown platform permission key", async () => {
    if (!isDatabaseAvailable()) return;

    await expect(
      insertRolePermission(TENANT_A, fixtures[TENANT_A].roleId, randomUUID()),
    ).rejects.toThrow();
  });

  it("rejects organisation attempts to create a platform permission key", async () => {
    if (!isDatabaseAvailable()) return;

    await expect(
      withRoleRlsContext(
        TENANT_A,
        (tx) =>
          tx.$executeRaw`
          INSERT INTO "PermissionDefinition" (
            "key", "label", "description", "scope", "sensitivity", "delegable"
          ) VALUES (
            ${`organisation-created.${randomUUID()}`}, 'Organisation-created key', 'Must be blocked', 'site'::"PermissionScope", 'standard'::"PermissionSensitivity", true
          )
        `,
      ),
    ).rejects.toThrow();
  });

  it("blocks cross-site role definition creation, update, and deletion", async () => {
    if (!isDatabaseAvailable()) return;

    await expect(
      withRoleRlsContext(
        TENANT_A,
        (tx) =>
          tx.$executeRaw`
          INSERT INTO "OrgRoleDefinition" (
            "id", "orgId", "tenantId", "name", "scope", "createdById", "updatedById"
          ) VALUES (
            ${randomUUID()}, ${ORG_ID}, ${TENANT_B}, 'Cross-site role', 'site'::"RoleScope", ${randomUUID()}, ${randomUUID()}
          )
        `,
      ),
    ).rejects.toThrow();

    const updated = await withRoleRlsContext(
      TENANT_A,
      (tx) => tx.$executeRaw`
        UPDATE "OrgRoleDefinition" SET "name" = 'Blocked update'
        WHERE "id" = ${fixtures[TENANT_B].roleId}
      `,
    );
    const deleted = await withRoleRlsContext(
      TENANT_A,
      (tx) => tx.$executeRaw`
        DELETE FROM "OrgRoleDefinition" WHERE "id" = ${fixtures[TENANT_B].roleId}
      `,
    );

    expect(updated).toBe(0);
    expect(deleted).toBe(0);
  });

  it("blocks cross-site permission membership list, creation, update, and deletion", async () => {
    if (!isDatabaseAvailable()) return;

    const visiblePermissionRows = await withRoleRlsContext(
      TENANT_A,
      (tx) => tx.$queryRaw<Array<{ roleDefinitionId: string }>>`
        SELECT "roleDefinitionId" FROM "OrgRolePermission"
        WHERE "roleDefinitionId" IN (${fixtures[TENANT_A].roleId}, ${fixtures[TENANT_B].roleId})
      `,
    );
    expect(visiblePermissionRows).toEqual([
      { roleDefinitionId: fixtures[TENANT_A].roleId },
    ]);

    await expect(
      insertRolePermission(TENANT_A, fixtures[TENANT_B].roleId, permissionKey),
    ).rejects.toThrow();

    const updated = await withRoleRlsContext(
      TENANT_A,
      (tx) => tx.$executeRaw`
        UPDATE "OrgRolePermission" SET "grantedById" = ${randomUUID()}
        WHERE "roleDefinitionId" = ${fixtures[TENANT_B].roleId}
          AND "permissionKey" = ${permissionKey}
      `,
    );
    const deleted = await withRoleRlsContext(
      TENANT_A,
      (tx) => tx.$executeRaw`
        DELETE FROM "OrgRolePermission"
        WHERE "roleDefinitionId" = ${fixtures[TENANT_B].roleId}
          AND "permissionKey" = ${permissionKey}
      `,
    );

    expect(updated).toBe(0);
    expect(deleted).toBe(0);
  });
});
