import { HttpStatus } from "@nestjs/common";
import { SYSTEM_ROLE_TEMPLATES } from "@pathway/auth";
import { roleScopeAcceptsPermissionScope, type Prisma } from "@pathway/db";
import {
  CAPABILITY_DEFINITIONS,
  accessTagPermissionKeys,
  getOrgCapabilities,
  isAccessTagAvailable,
  type AccessTagKey,
  type PermissionKey,
} from "@pathway/platform";
import { fromStoredAccessTagKey } from "./access-tag-keys";
import { roleApiError } from "./role-api-error";
import {
  resolveDelegableCeiling,
  type RoleActorContext,
} from "./roles.service";

export interface TagDelegationInput {
  userId: string;
  tagKey: AccessTagKey;
  scope: "organisation" | "site";
}

export async function assertCanGrantAccessTag(
  tx: Prisma.TransactionClient,
  actor: RoleActorContext,
  input: TagDelegationInput,
  now: Date,
): Promise<string | null> {
  const tenantId = input.scope === "site" ? (actor.tenantId ?? null) : null;
  if (input.scope === "site" && !tenantId) {
    throw roleApiError(
      HttpStatus.BAD_REQUEST,
      "INVALID_SELECTED_SITE",
      actor.requestId,
    );
  }
  if (!isAccessTagAvailable(input.tagKey)) {
    throw roleApiError(
      HttpStatus.BAD_REQUEST,
      "ACCESS_TAG_UNAVAILABLE",
      actor.requestId,
    );
  }

  await assertFixedOrganisationHead(tx, actor, now);
  const membership = await tx.orgMembership.findUnique({
    where: { orgId_userId: { orgId: actor.orgId, userId: input.userId } },
    select: { id: true },
  });
  if (!membership) {
    throw roleApiError(
      HttpStatus.BAD_REQUEST,
      "ASSIGNEE_NOT_IN_ORGANISATION",
      actor.requestId,
    );
  }
  if (tenantId) {
    const siteMembership = await tx.siteMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId: input.userId } },
      select: { id: true },
    });
    if (!siteMembership) {
      throw roleApiError(
        HttpStatus.BAD_REQUEST,
        "ACCESS_TAG_ASSIGNEE_NOT_IN_SITE",
        actor.requestId,
      );
    }
  }

  const keys = accessTagPermissionKeys(input.tagKey);
  if (keys.length === 0) {
    throw roleApiError(
      HttpStatus.BAD_REQUEST,
      "ACCESS_TAG_UNAVAILABLE",
      actor.requestId,
    );
  }
  const [metadata, capabilities, heldKeys] = await Promise.all([
    tx.permissionDefinition.findMany({
      where: { key: { in: [...keys] } },
      select: { key: true, scope: true, delegable: true, isActive: true },
    }),
    getOrgCapabilities(actor.orgId, tx),
    readActorPermissionKeys(tx, actor, input.scope, now),
  ]);
  const ceiling = new Set(
    resolveDelegableCeiling({
      actorPermissionKeys: heldKeys,
      activeCapabilities: capabilities,
      activePermissionDefinitions: metadata,
    }),
  );
  for (const key of keys) {
    const definition = metadata.find((entry) => entry.key === key);
    if (
      !definition ||
      !roleScopeAcceptsPermissionScope(input.scope, definition.scope) ||
      CAPABILITY_DEFINITIONS[key].featureToggle !== undefined ||
      !ceiling.has(key)
    ) {
      throw roleApiError(
        HttpStatus.FORBIDDEN,
        "ACCESS_TAG_CANNOT_DELEGATE",
        actor.requestId,
      );
    }
  }
  return tenantId;
}

export async function assertFixedOrganisationHead(
  tx: Prisma.TransactionClient,
  actor: RoleActorContext,
  now: Date,
): Promise<void> {
  const [headAssignment, membership] = await Promise.all([
    tx.userRoleAssignment.findFirst({
      where: {
        orgId: actor.orgId,
        userId: actor.userId,
        tenantId: null,
        revokedAt: null,
        startsAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        roleDefinition: {
          orgId: actor.orgId,
          tenantId: null,
          scope: "organisation",
          isSystem: true,
          isActive: true,
          name: SYSTEM_ROLE_TEMPLATES.organisationHead.name,
        },
      },
      select: { id: true },
    }),
    tx.orgMembership.findUnique({
      where: { orgId_userId: { orgId: actor.orgId, userId: actor.userId } },
      select: { id: true },
    }),
  ]);
  if (!headAssignment || !membership) {
    throw roleApiError(
      HttpStatus.FORBIDDEN,
      "ACCESS_TAG_ACTOR_NOT_HEAD",
      actor.requestId,
    );
  }
}

async function readActorPermissionKeys(
  tx: Prisma.TransactionClient,
  actor: RoleActorContext,
  scope: "organisation" | "site",
  now: Date,
): Promise<PermissionKey[]> {
  const allowedTagScopes =
    scope === "site" && actor.tenantId
      ? [{ tenantId: null }, { tenantId: actor.tenantId }]
      : [{ tenantId: null }];
  const allowedRoleScopes =
    scope === "site" && actor.tenantId
      ? [
          { scope: "organisation" as const, tenantId: null },
          { scope: "site" as const, tenantId: actor.tenantId },
        ]
      : [{ scope: "organisation" as const, tenantId: null }];
  const [assignments, tags] = await Promise.all([
    tx.userRoleAssignment.findMany({
      where: {
        orgId: actor.orgId,
        userId: actor.userId,
        revokedAt: null,
        startsAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        roleDefinition: {
          orgId: actor.orgId,
          isActive: true,
          OR: allowedRoleScopes,
        },
      },
      select: {
        roleDefinition: {
          select: { permissions: { select: { permissionKey: true } } },
        },
      },
    }),
    tx.accessTagGrant.findMany({
      where: {
        orgId: actor.orgId,
        userId: actor.userId,
        revokedAt: null,
        startsAt: { lte: now },
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          { OR: allowedTagScopes },
        ],
      },
      select: { tagKey: true },
    }),
  ]);
  const roleKeys = assignments.flatMap((assignment) =>
    assignment.roleDefinition.permissions
      .map(({ permissionKey }) => permissionKey)
      .filter(isPermissionKey),
  );
  const tagKeys = tags.flatMap(({ tagKey }) => {
    const publicKey = fromStoredAccessTagKey(tagKey);
    return accessTagPermissionKeys(publicKey);
  });
  return [...new Set([...roleKeys, ...tagKeys])];
}

function isPermissionKey(key: string): key is PermissionKey {
  return Object.prototype.hasOwnProperty.call(CAPABILITY_DEFINITIONS, key);
}
