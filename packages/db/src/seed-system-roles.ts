import type { Prisma, PrismaClient } from "@prisma/client";
import {
  roleScopeAcceptsPermissionScope,
  type RolePermissionScope,
} from "./role-scope-compatibility";

export const SYSTEM_ACTOR_ID = "00000000-0000-0000-0000-000000000000";
export const SYSTEM_ROLE_SEED_DATABASE_ROLE = "pathway_system_role_seed";

export type SystemRoleScope = "organisation" | "site" | "relationship";

export interface SystemRoleTemplateInput {
  readonly name: string;
  readonly scope: SystemRoleScope;
  readonly protected: true;
  readonly permissions: readonly string[];
}

export type SystemRoleTemplates = Readonly<
  Record<string, SystemRoleTemplateInput>
>;

export type SystemRoleSeedTransaction = Pick<
  Prisma.TransactionClient,
  "orgModule" | "orgRoleDefinition" | "orgRolePermission" | "orgVertical"
>;

export interface SystemRoleSeedClient {
  readonly org: PrismaClient["org"];
  readonly permissionDefinition: PrismaClient["permissionDefinition"];
  $queryRawUnsafe<T = unknown>(query: string): Promise<T>;
  $transaction<T>(
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ): Promise<T>;
}

export type ResolveAvailablePermissionKeys = (
  orgId: string,
  tx: SystemRoleSeedTransaction,
) => Promise<readonly string[]>;

export interface SystemRoleSeedResult {
  rolesProcessed: number;
  permissionsProcessed: number;
}

const SYSTEM_ROLE_SEED_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 15_000,
} as const;

export function getSystemRoleId(
  orgId: string,
  tenantId: string | null,
  templateKey: string,
): string {
  return `system-role:${orgId}:${tenantId ?? "organisation"}:${templateKey}`;
}

export async function assertSystemRoleSeedIdentity(
  client: Pick<SystemRoleSeedClient, "$queryRawUnsafe">,
): Promise<void> {
  const rows = await client.$queryRawUnsafe<Array<{ sessionUser: string }>>(
    'SELECT session_user AS "sessionUser"',
  );
  const sessionUser = rows[0]?.sessionUser;
  if (sessionUser !== SYSTEM_ROLE_SEED_DATABASE_ROLE) {
    throw new Error(
      `SYSTEM_ROLE_SEED_DATABASE_URL must authenticate as ${SYSTEM_ROLE_SEED_DATABASE_ROLE}`,
    );
  }
}

function roleUpdateData(
  stored: {
    name: string;
    scope: SystemRoleScope;
    tenantId: string | null;
    isSystem: boolean;
    isActive: boolean;
    createdById: string;
    updatedById: string;
  },
  template: SystemRoleTemplateInput,
  tenantId: string | null,
): Prisma.OrgRoleDefinitionUncheckedUpdateInput | null {
  const data: Prisma.OrgRoleDefinitionUncheckedUpdateInput = {};

  if (stored.name !== template.name) data.name = template.name;
  if (stored.scope !== template.scope) data.scope = template.scope;
  if (stored.tenantId !== tenantId) data.tenantId = tenantId;
  if (!stored.isSystem) data.isSystem = true;
  if (!stored.isActive) data.isActive = true;
  if (stored.createdById !== SYSTEM_ACTOR_ID) {
    data.createdById = SYSTEM_ACTOR_ID;
  }
  if (stored.updatedById !== SYSTEM_ACTOR_ID || Object.keys(data).length > 0) {
    data.updatedById = SYSTEM_ACTOR_ID;
  }

  return Object.keys(data).length > 0 ? data : null;
}

async function reconcileRole(
  tx: SystemRoleSeedTransaction,
  orgId: string,
  tenantId: string | null,
  templateKey: string,
  template: SystemRoleTemplateInput,
  permissionKeys: readonly string[],
): Promise<void> {
  const roleDefinitionId = getSystemRoleId(orgId, tenantId, templateKey);
  const stored = await tx.orgRoleDefinition.findUnique({
    where: { id: roleDefinitionId },
    select: {
      orgId: true,
      tenantId: true,
      name: true,
      scope: true,
      isSystem: true,
      isActive: true,
      createdById: true,
      updatedById: true,
    },
  });

  if (!stored) {
    await tx.orgRoleDefinition.create({
      data: {
        id: roleDefinitionId,
        orgId,
        tenantId,
        name: template.name,
        scope: template.scope,
        isSystem: template.protected,
        isActive: true,
        version: 1,
        createdById: SYSTEM_ACTOR_ID,
        updatedById: SYSTEM_ACTOR_ID,
      },
    });
  } else {
    if (stored.orgId !== orgId || !stored.isSystem) {
      throw new Error(
        `Deterministic system role ID collision for ${roleDefinitionId}`,
      );
    }
    const update = roleUpdateData(stored, template, tenantId);
    if (update) {
      await tx.orgRoleDefinition.update({
        where: { id: roleDefinitionId },
        data: update,
      });
    }
  }

  const storedPermissions = await tx.orgRolePermission.findMany({
    where: { roleDefinitionId },
    select: { permissionKey: true, grantedById: true },
  });
  const expectedKeys = new Set(permissionKeys);
  const storedByKey = new Map(
    storedPermissions.map((permission) => [
      permission.permissionKey,
      permission,
    ]),
  );
  const keysToDelete = storedPermissions
    .filter(
      ({ permissionKey, grantedById }) =>
        !expectedKeys.has(permissionKey) || grantedById !== SYSTEM_ACTOR_ID,
    )
    .map(({ permissionKey }) => permissionKey)
    .sort();
  const keysToCreate = permissionKeys.filter((permissionKey) => {
    const storedPermission = storedByKey.get(permissionKey);
    return (
      !storedPermission || storedPermission.grantedById !== SYSTEM_ACTOR_ID
    );
  });

  if (keysToDelete.length > 0) {
    await tx.orgRolePermission.deleteMany({
      where: {
        roleDefinitionId,
        permissionKey: { in: keysToDelete },
      },
    });
  }
  if (keysToCreate.length > 0) {
    await tx.orgRolePermission.createMany({
      data: keysToCreate.map((permissionKey) => ({
        roleDefinitionId,
        permissionKey,
        grantedById: SYSTEM_ACTOR_ID,
      })),
      skipDuplicates: true,
    });
  }
}

export async function seedSystemRoles(
  client: SystemRoleSeedClient,
  templates: SystemRoleTemplates,
  resolveAvailablePermissionKeys: ResolveAvailablePermissionKeys,
): Promise<SystemRoleSeedResult> {
  await assertSystemRoleSeedIdentity(client);

  const templateEntries = Object.entries(templates).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const requestedPermissionKeys = [
    ...new Set(templateEntries.flatMap(([, template]) => template.permissions)),
  ].sort();
  const [activeDefinitions, organisations] = await Promise.all([
    client.permissionDefinition.findMany({
      where: {
        key: { in: requestedPermissionKeys },
        isActive: true,
      },
      select: { key: true, scope: true },
      orderBy: { key: "asc" },
    }),
    client.org.findMany({
      select: {
        id: true,
        tenants: {
          select: { id: true },
          orderBy: { id: "asc" },
        },
      },
      orderBy: { id: "asc" },
    }),
  ]);
  const activeDefinitionScopes = new Map(
    activeDefinitions.map(({ key, scope }) => [key, scope]),
  );
  let rolesProcessed = 0;
  let permissionsProcessed = 0;

  for (const organisation of [...organisations].sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    const result = await client.$transaction(async (rawTx) => {
      const tx = rawTx as SystemRoleSeedTransaction;
      const availablePermissionKeys = new Set(
        await resolveAvailablePermissionKeys(organisation.id, tx),
      );
      let organisationRolesProcessed = 0;
      let organisationPermissionsProcessed = 0;

      for (const [templateKey, template] of templateEntries) {
        const tenantIds =
          template.scope === "site"
            ? [...organisation.tenants]
                .sort((left, right) => left.id.localeCompare(right.id))
                .map(({ id }) => id)
            : [null];

        for (const tenantId of tenantIds) {
          const permissionKeys = [
            ...new Set(
              template.permissions.filter((permissionKey) => {
                const permissionScope =
                  activeDefinitionScopes.get(permissionKey);
                return (
                  permissionScope !== undefined &&
                  availablePermissionKeys.has(permissionKey) &&
                  roleScopeAcceptsPermissionScope(
                    template.scope,
                    permissionScope as RolePermissionScope,
                  )
                );
              }),
            ),
          ].sort();

          await reconcileRole(
            tx,
            organisation.id,
            tenantId,
            templateKey,
            template,
            permissionKeys,
          );
          organisationRolesProcessed += 1;
          organisationPermissionsProcessed += permissionKeys.length;
        }
      }

      return {
        rolesProcessed: organisationRolesProcessed,
        permissionsProcessed: organisationPermissionsProcessed,
      };
    }, SYSTEM_ROLE_SEED_TRANSACTION_OPTIONS);
    rolesProcessed += result.rolesProcessed;
    permissionsProcessed += result.permissionsProcessed;
  }

  return { rolesProcessed, permissionsProcessed };
}
