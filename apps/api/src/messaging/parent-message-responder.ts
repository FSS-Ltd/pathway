import { SYSTEM_ROLE_TEMPLATES } from "@pathway/auth";
import type { Prisma } from "@pathway/db";

export function parentResponderWhere(
  orgId: string,
  siteId: string,
  now: Date,
  userId?: string,
): Prisma.SiteMembershipWhereInput {
  const active = {
    startsAt: { lte: now },
    expiresAt: { gt: now },
    revokedAt: null,
  };
  const role = (name: string, tenantId: string | null) => ({
    orgId,
    tenantId,
    startsAt: active.startsAt,
    revokedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: active.expiresAt }],
    roleDefinition: {
      orgId,
      name,
      isSystem: true,
      isActive: true,
      tenantId,
      permissions: { some: { permissionKey: "messaging.messages.send" } },
    },
  });

  return {
    tenantId: siteId,
    ...(userId ? { userId } : {}),
    role: { in: ["SITE_ADMIN", "STAFF"] },
    user: {
      isActive: true,
      studentIdentities: { none: { tenantId: siteId } },
      OR: [
        {
          roleAssignments: {
            some: role(SYSTEM_ROLE_TEMPLATES.organisationHead.name, null),
          },
        },
        {
          roleAssignments: {
            some: role(SYSTEM_ROLE_TEMPLATES.siteLead.name, siteId),
          },
        },
        {
          accessTagGrants: {
            some: {
              orgId,
              tagKey: "PARENT_MESSAGE_RESPONDER",
              startsAt: active.startsAt,
              revokedAt: null,
              OR: [{ expiresAt: null }, { expiresAt: active.expiresAt }],
              AND: [{ OR: [{ tenantId: null }, { tenantId: siteId }] }],
            },
          },
        },
      ],
    },
  };
}
