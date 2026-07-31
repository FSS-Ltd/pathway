import { HttpStatus } from "@nestjs/common";
import { SYSTEM_ROLE_TEMPLATES, UserOrgRole } from "@pathway/auth";
import type { Prisma } from "@pathway/db";
import { getOrgCapabilities, type PermissionKey } from "@pathway/platform";
import type { AccessShadowService } from "./access-shadow.service";
import { roleApiError } from "./role-api-error";
import type { RoleActorContext } from "./roles.service";

/**
 * Shared by every controller under the `platform.access.*` capability family
 * (roles, assignments, effective-access, audit, permissions). An actor may
 * call one of these routes only while all of the following hold: they carry
 * the legacy ORG_ADMIN role, the target permission key is active, the org has
 * it enabled, and it is part of the organisationHead system-role template.
 */
export async function evaluatePlatformAccessRouteAccess(
  tx: Prisma.TransactionClient,
  actor: RoleActorContext,
  permissionKey: PermissionKey,
): Promise<boolean> {
  const membership = await tx.orgMembership.findUnique({
    where: { orgId_userId: { orgId: actor.orgId, userId: actor.userId } },
    select: { role: true },
  });
  if (
    membership?.role !== "ORG_ADMIN" ||
    !actor.legacyOrgRoles.includes(UserOrgRole.ORG_ADMIN)
  ) {
    return false;
  }

  const [definition, capabilities] = await Promise.all([
    tx.permissionDefinition.findUnique({
      where: { key: permissionKey },
      select: { isActive: true },
    }),
    getOrgCapabilities(actor.orgId, tx),
  ]);
  return (
    !!definition?.isActive &&
    capabilities.includes(permissionKey) &&
    (
      SYSTEM_ROLE_TEMPLATES.organisationHead.permissions as readonly string[]
    ).includes(permissionKey)
  );
}

export async function assertPlatformAccessRouteAccess(
  tx: Prisma.TransactionClient,
  actor: RoleActorContext,
  permissionKey: PermissionKey,
  deniedCode: string,
): Promise<void> {
  if (!(await evaluatePlatformAccessRouteAccess(tx, actor, permissionKey))) {
    throw roleApiError(HttpStatus.FORBIDDEN, deniedCode, actor.requestId);
  }
}

/**
 * Same bootstrap check, plus a non-blocking shadow comparison against the
 * typed EffectivePermissionsService for the approved matrix route/permission
 * pairs in ACCESS_SHADOW_ALLOW_LIST. The legacy decision remains
 * authoritative; this only records drift for observation before ACE-F14
 * removes the bootstrap.
 */
export async function assertPlatformAccessRouteAccessWithShadow(
  tx: Prisma.TransactionClient,
  actor: RoleActorContext,
  permissionKey: PermissionKey,
  deniedCode: string,
  route: string,
  shadow: AccessShadowService,
): Promise<void> {
  const legacyAllowed = await evaluatePlatformAccessRouteAccess(
    tx,
    actor,
    permissionKey,
  );
  await shadow.compare({
    route,
    legacyAllowed,
    request: {
      userId: actor.userId,
      orgId: actor.orgId,
      tenantId: actor.tenantId,
      permission: permissionKey,
      now: new Date(),
    },
  });
  if (!legacyAllowed) {
    throw roleApiError(HttpStatus.FORBIDDEN, deniedCode, actor.requestId);
  }
}
