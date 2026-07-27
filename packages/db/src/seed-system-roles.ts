import type { Prisma } from "@prisma/client";

export const SYSTEM_ACTOR_ID = "00000000-0000-0000-0000-000000000000";

export type SystemRoleScope = "organisation" | "site" | "relationship";
type PermissionScope = SystemRoleScope | "assignment";

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
  | "$executeRawUnsafe"
  | "org"
  | "permissionDefinition"
  | "orgRoleDefinition"
  | "orgRolePermission"
>;

export type ResolveAvailablePermissionKeys = (
  orgId: string,
) => Promise<readonly string[]>;

export interface SystemRoleSeedResult {
  rolesProcessed: number;
  permissionsProcessed: number;
}

const COMPATIBLE_PERMISSION_SCOPES: Readonly<
  Record<SystemRoleScope, ReadonlySet<PermissionScope>>
> = {
  organisation: new Set(["organisation", "site", "relationship", "assignment"]),
  site: new Set(["site", "relationship", "assignment"]),
  relationship: new Set(["relationship"]),
};

function getSystemRoleId(
  orgId: string,
  tenantId: string | null,
  templateKey: string,
): string {
  return `system-role:${orgId}:${tenantId ?? "organisation"}:${templateKey}`;
}

export async function seedSystemRoles(
  tx: SystemRoleSeedTransaction,
  templates: SystemRoleTemplates,
  resolveAvailablePermissionKeys: ResolveAvailablePermissionKeys,
): Promise<SystemRoleSeedResult> {
  await tx.$executeRawUnsafe(
    "SELECT set_config('app.system_role_seed', 'on', true)",
  );

  const templateEntries = Object.entries(templates).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const requestedPermissionKeys = [
    ...new Set(templateEntries.flatMap(([, template]) => template.permissions)),
  ].sort();
  const activeDefinitions = await tx.permissionDefinition.findMany({
    where: {
      key: { in: requestedPermissionKeys },
      isActive: true,
    },
    select: { key: true, scope: true, isActive: true },
    orderBy: { key: "asc" },
  });
  const activeDefinitionScopes = new Map(
    activeDefinitions
      .filter(({ isActive }) => isActive)
      .map(({ key, scope }) => [key, scope]),
  );
  const organisations = await tx.org.findMany({
    select: {
      id: true,
      tenants: {
        select: { id: true },
        orderBy: { id: "asc" },
      },
    },
    orderBy: { id: "asc" },
  });
  let rolesProcessed = 0;
  let permissionsProcessed = 0;

  for (const organisation of organisations) {
    const availablePermissionKeys = new Set(
      await resolveAvailablePermissionKeys(organisation.id),
    );

    for (const [templateKey, template] of templateEntries) {
      const tenantIds =
        template.scope === "site"
          ? organisation.tenants.map(({ id }) => id)
          : [null];

      for (const tenantId of tenantIds) {
        const roleDefinitionId = getSystemRoleId(
          organisation.id,
          tenantId,
          templateKey,
        );
        const permissionKeys = [
          ...new Set(
            template.permissions.filter((permissionKey) => {
              const permissionScope = activeDefinitionScopes.get(permissionKey);
              return (
                permissionScope !== undefined &&
                availablePermissionKeys.has(permissionKey) &&
                COMPATIBLE_PERMISSION_SCOPES[template.scope].has(
                  permissionScope,
                )
              );
            }),
          ),
        ].sort();

        await tx.orgRoleDefinition.upsert({
          where: { id: roleDefinitionId },
          update: {
            name: template.name,
            scope: template.scope,
            tenantId,
            isSystem: template.protected,
            isActive: true,
            version: 1,
            updatedById: SYSTEM_ACTOR_ID,
          },
          create: {
            id: roleDefinitionId,
            orgId: organisation.id,
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

        await tx.orgRolePermission.deleteMany({
          where:
            permissionKeys.length === 0
              ? { roleDefinitionId }
              : {
                  roleDefinitionId,
                  permissionKey: { notIn: permissionKeys },
                },
        });
        if (permissionKeys.length > 0) {
          await tx.orgRolePermission.createMany({
            data: permissionKeys.map((permissionKey) => ({
              roleDefinitionId,
              permissionKey,
              grantedById: SYSTEM_ACTOR_ID,
            })),
            skipDuplicates: true,
          });
        }

        rolesProcessed += 1;
        permissionsProcessed += permissionKeys.length;
      }
    }
  }

  return { rolesProcessed, permissionsProcessed };
}
