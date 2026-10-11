import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import {
  ACCESS_TAG_DEFINITIONS,
  isAccessTagAvailable,
  type AccessTagKey,
} from "@pathway/platform";
import { allAccessTagKeys, fromStoredAccessTagKey } from "./access-tag-keys";
import { badgeAllowedScopes, badgeCoverage } from "./badge-matrix";
import { badgeRevision } from "./badge-state.service";
import { EffectivePermissionsService } from "./effective-permissions.service";
import { roleApiError } from "./role-api-error";
import {
  ROLES_TRANSACTION_BOUNDARY,
  type RoleActorContext,
  type RolesTransactionBoundary,
} from "./roles.service";

@Injectable()
export class BadgeMatrixService {
  constructor(
    @Inject(ROLES_TRANSACTION_BOUNDARY)
    private readonly transaction: RolesTransactionBoundary,
    @Inject(EffectivePermissionsService)
    private readonly effective: EffectivePermissionsService,
  ) {}

  async catalogue(actor: RoleActorContext) {
    return this.transaction.run(actor, async (tx) => {
      const roles = await tx.orgRoleDefinition.findMany({
        where: {
          orgId: actor.orgId,
          isSystem: true,
          isActive: true,
          OR: [
            { tenantId: null },
            ...(actor.tenantId ? [{ tenantId: actor.tenantId }] : []),
          ],
        },
        select: {
          id: true,
          name: true,
          description: true,
          scope: true,
          tenantId: true,
          permissions: { select: { permissionKey: true } },
        },
        orderBy: { name: "asc" },
      });
      return {
        roles: roles.map(({ permissions, ...role }) => ({
          ...role,
          permissionKeys: permissions
            .map(({ permissionKey }) => permissionKey)
            .sort(),
        })),
        badges: allAccessTagKeys().map((key) => {
          const definition = ACCESS_TAG_DEFINITIONS[key];
          return {
            key,
            label: definition.label,
            description: definition.description,
            available: isAccessTagAvailable(key),
            permissionKeys: [...definition.permissionKeys],
            allowedScopes: badgeAllowedScopes(key),
            roleCoverage: roles.map((role) => ({
              roleId: role.id,
              coverage: badgeCoverage(
                definition.permissionKeys,
                role.permissions.map(({ permissionKey }) => permissionKey),
              ),
            })),
          };
        }),
      };
    });
  }

  async forUser(actor: RoleActorContext, userId: string) {
    const [catalogue, userState] = await Promise.all([
      this.catalogue(actor),
      this.transaction.run(actor, async (tx) => {
        const member = await tx.orgMembership.findUnique({
          where: { orgId_userId: { orgId: actor.orgId, userId } },
          select: {
            user: {
              select: {
                id: true,
                name: true,
                displayName: true,
                email: true,
                isActive: true,
                superUser: true,
              },
            },
          },
        });
        if (!member)
          throw roleApiError(
            HttpStatus.NOT_FOUND,
            "ROLE_NOT_FOUND",
            actor.requestId,
          );
        const now = new Date();
        const scopes = [
          { tenantId: null },
          ...(actor.tenantId ? [{ tenantId: actor.tenantId }] : []),
        ];
        const [assignments, grants, exclusions] = await Promise.all([
          tx.userRoleAssignment.findMany({
            where: {
              orgId: actor.orgId,
              userId,
              revokedAt: null,
              startsAt: { lte: now },
              AND: [
                { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
                { OR: scopes },
              ],
              roleDefinition: { isActive: true, OR: scopes },
            },
            select: {
              id: true,
              roleDefinitionId: true,
              tenantId: true,
              startsAt: true,
              expiresAt: true,
            },
          }),
          tx.accessTagGrant.findMany({
            where: {
              orgId: actor.orgId,
              userId,
              revokedAt: null,
              startsAt: { lte: now },
              AND: [
                { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
                { OR: scopes },
              ],
            },
            select: { id: true, tagKey: true, tenantId: true, expiresAt: true },
          }),
          tx.accessTagExclusion.findMany({
            where: { orgId: actor.orgId, userId, revokedAt: null, OR: scopes },
            select: { id: true, tagKey: true, tenantId: true },
          }),
        ]);
        return { user: member.user, assignments, grants, exclusions };
      }),
    ]);
    const effective = await this.effective.listForUserWithSources(
      userId,
      actor.orgId,
      actor.tenantId,
    );
    const effectiveKeys = effective.map(({ permissionKey }) => permissionKey);
    return {
      ...catalogue,
      user: userState.user,
      superUserExempt: userState.user.superUser && userState.user.isActive,
      assignments: userState.assignments,
      effectivePermissions: effective,
      badges: catalogue.badges.map((badge) => {
        const directGrants = userState.grants.filter(
          ({ tagKey }) => fromStoredAccessTagKey(tagKey) === badge.key,
        );
        const directExclusions = userState.exclusions.filter(
          ({ tagKey }) => fromStoredAccessTagKey(tagKey) === badge.key,
        );
        const revisionFor = (tenantId: string | null) =>
          badgeRevision({
            grants: directGrants.filter((grant) => grant.tenantId === tenantId),
            exclusions: directExclusions.filter(
              (exclusion) => exclusion.tenantId === tenantId,
            ),
          });
        const revisions = {
          organisation: revisionFor(null),
          site: actor.tenantId ? revisionFor(actor.tenantId) : null,
        };
        const permissionSet = new Set(badge.permissionKeys);
        const blockingTags = userState.exclusions
          .filter(({ tagKey }) =>
            ACCESS_TAG_DEFINITIONS[
              fromStoredAccessTagKey(tagKey)
            ].permissionKeys.some((key) => permissionSet.has(key)),
          )
          .map(({ tagKey }) => fromStoredAccessTagKey(tagKey));
        return {
          ...badge,
          selected:
            badge.available &&
            badgeCoverage(badge.permissionKeys, effectiveKeys) === "full",
          effectiveCoverage: badgeCoverage(badge.permissionKeys, effectiveKeys),
          sourceRoleIds: userState.assignments
            .filter(({ roleDefinitionId }) =>
              badge.roleCoverage.some(
                (coverage) =>
                  coverage.roleId === roleDefinitionId &&
                  coverage.coverage !== "none",
              ),
            )
            .map(({ roleDefinitionId }) => roleDefinitionId),
          directGrants: directGrants.map(({ id, tenantId, expiresAt }) => ({
            id,
            tenantId,
            expiresAt,
          })),
          exclusions: directExclusions.map(({ id, tenantId }) => ({
            id,
            tenantId,
          })),
          blockingTags: [...new Set(blockingTags)] as AccessTagKey[],
          revisions,
          revision: revisions.site ?? revisions.organisation,
        };
      }),
    };
  }
}
