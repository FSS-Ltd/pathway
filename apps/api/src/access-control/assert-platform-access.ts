import { HttpStatus } from "@nestjs/common";
import { SYSTEM_ROLE_TEMPLATES, UserOrgRole } from "@pathway/auth";
import type { Prisma } from "@pathway/db";
import { getOrgCapabilities, type PermissionKey } from "@pathway/platform";
import { roleApiError } from "./role-api-error";
import type { RoleActorContext } from "./roles.service";

/**
 * Shared by every controller under the `platform.access.*` capability family
 * (roles, assignments, effective-access, audit, permissions). An actor may
 * call one of these routes only while all of the following hold: they carry
 * the legacy ORG_ADMIN role, the target permission key is active, the org has
 * it enabled, and it is part of the organisationHead system-role template.
 */
export async function assertPlatformAccessRouteAccess(
  tx: Prisma.TransactionClient,
  actor: RoleActorContext,
  permissionKey: PermissionKey,
  deniedCode: string,
): Promise<void> {
  const membership = await tx.orgMembership.findUnique({
    where: { orgId_userId: { orgId: actor.orgId, userId: actor.userId } },
    select: { role: true },
  });
  if (
    membership?.role !== "ORG_ADMIN" ||
    !actor.legacyOrgRoles.includes(UserOrgRole.ORG_ADMIN)
  ) {
    throw roleApiError(HttpStatus.FORBIDDEN, deniedCode, actor.requestId);
  }

  const [definition, capabilities] = await Promise.all([
    tx.permissionDefinition.findUnique({
      where: { key: permissionKey },
      select: { isActive: true },
    }),
    getOrgCapabilities(actor.orgId, tx),
  ]);
  if (
    !definition?.isActive ||
    !capabilities.includes(permissionKey) ||
    !(
      SYSTEM_ROLE_TEMPLATES.organisationHead.permissions as readonly string[]
    ).includes(permissionKey)
  ) {
    throw roleApiError(HttpStatus.FORBIDDEN, deniedCode, actor.requestId);
  }
}
