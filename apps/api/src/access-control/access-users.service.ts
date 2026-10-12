import { Inject, Injectable } from "@nestjs/common";
import { getOrgCapabilities } from "@pathway/platform";
import { Prisma } from "@pathway/db";
import { roleApiError } from "./role-api-error";
import { fromStoredAccessTagKey } from "./access-tag-keys";
import {
  EffectivePermissionsService,
  type EffectivePermissionWithSources,
} from "./effective-permissions.service";
import {
  ROLES_TRANSACTION_BOUNDARY,
  type RoleActorContext,
  type RolesTransactionBoundary,
} from "./roles.service";

export interface EffectivePermissionsResult {
  userId: string;
  orgId: string;
  tenantId: string | null;
  permissions: EffectivePermissionWithSources[];
}

export interface AccessSummaryAssignment {
  id: string;
  roleDefinitionId: string;
  roleName: string;
  scope: string;
  tenantId: string | null;
  startsAt: Date;
  expiresAt: Date | null;
  isActive: boolean;
}

export interface AccessSummaryResult {
  userId: string;
  orgId: string;
  tenantId: string | null;
  organisationMembership: { role: string } | null;
  assignments: AccessSummaryAssignment[];
  tagGrants: {
    id: string;
    tagKey: string;
    tenantId: string | null;
    grantedById: string;
    startsAt: Date;
    expiresAt: Date | null;
    isActive: boolean;
  }[];
  organisationCapabilities: string[];
}

export interface AccessDirectoryQuery {
  limit?: number;
  cursor?: string;
  search?: string;
  roleDefinitionId?: string;
}

@Injectable()
export class AccessUsersService {
  constructor(
    @Inject(ROLES_TRANSACTION_BOUNDARY)
    private readonly transaction: RolesTransactionBoundary,
    @Inject(EffectivePermissionsService)
    private readonly effectivePermissions: EffectivePermissionsService,
  ) {}

  async listDirectory(
    actor: RoleActorContext,
    query: AccessDirectoryQuery = {},
  ) {
    const limit = query.limit ?? 10;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw roleApiError(
        400,
        "INVALID_EFFECTIVE_ACCESS_REQUEST",
        actor.requestId,
      );
    }
    const now = new Date();
    const search = query.search?.trim();
    return this.transaction.run(actor, async (tx) => {
      const filters: Prisma.OrgMembershipWhereInput[] = [
        { orgId: actor.orgId },
        ...(query.cursor ? [{ userId: { gt: query.cursor } }] : []),
        ...(search
          ? [
              {
                user: {
                  OR: [
                    {
                      name: {
                        contains: search,
                        mode: Prisma.QueryMode.insensitive,
                      },
                    },
                    {
                      displayName: {
                        contains: search,
                        mode: Prisma.QueryMode.insensitive,
                      },
                    },
                    {
                      email: {
                        contains: search,
                        mode: Prisma.QueryMode.insensitive,
                      },
                    },
                  ],
                },
              },
            ]
          : []),
        ...(query.roleDefinitionId
          ? [
              {
                user: {
                  roleAssignments: {
                    some: {
                      orgId: actor.orgId,
                      roleDefinitionId: query.roleDefinitionId,
                      revokedAt: null,
                      startsAt: { lte: now },
                      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                      roleDefinition: {
                        isActive: true,
                        OR: [
                          { tenantId: null },
                          ...(actor.tenantId
                            ? [{ tenantId: actor.tenantId }]
                            : []),
                        ],
                      },
                    },
                  },
                },
              },
            ]
          : []),
      ];
      const rows = await tx.orgMembership.findMany({
        where: { AND: filters },
        orderBy: { userId: "asc" },
        take: limit + 1,
        select: {
          userId: true,
          role: true,
          user: {
            select: {
              id: true,
              name: true,
              displayName: true,
              email: true,
              isActive: true,
              superUser: true,
              hasFamilyAccess: true,
            },
          },
        },
      });
      const visibleRows = rows.slice(0, limit);
      const assignments = visibleRows.length
        ? await tx.userRoleAssignment.findMany({
            where: {
              orgId: actor.orgId,
              userId: { in: visibleRows.map(({ userId }) => userId) },
              revokedAt: null,
              startsAt: { lte: now },
              AND: [
                { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
                {
                  OR: [
                    { tenantId: null },
                    ...(actor.tenantId ? [{ tenantId: actor.tenantId }] : []),
                  ],
                },
              ],
              roleDefinition: { isActive: true },
            },
            select: { userId: true, roleDefinitionId: true },
          })
        : [];
      const roleIdsByUser = new Map<string, string[]>();
      for (const assignment of assignments) {
        const ids = roleIdsByUser.get(assignment.userId) ?? [];
        ids.push(assignment.roleDefinitionId);
        roleIdsByUser.set(assignment.userId, ids);
      }
      const items = visibleRows.map(({ user, role }) => ({
        ...user,
        orgRole: role,
        roleDefinitionIds: roleIdsByUser.get(user.id) ?? [],
      }));
      return {
        items,
        nextCursor:
          rows.length > limit ? (rows[limit - 1]?.userId ?? null) : null,
      };
    });
  }

  async getEffectivePermissions(
    targetUserId: string,
    actor: RoleActorContext,
  ): Promise<EffectivePermissionsResult> {
    // Validates the selected site belongs to the actor's organisation
    // (INVALID_SELECTED_SITE) before resolving anything.
    await this.transaction.run(actor, async () => {});

    const permissions = await this.effectivePermissions.listForUserWithSources(
      targetUserId,
      actor.orgId,
      actor.tenantId,
    );

    return {
      userId: targetUserId,
      orgId: actor.orgId,
      tenantId: actor.tenantId ?? null,
      permissions,
    };
  }

  async getAccessSummary(
    targetUserId: string,
    actor: RoleActorContext,
  ): Promise<AccessSummaryResult> {
    return this.transaction.run(actor, async (tx) => {
      const [membership, assignments, tagGrants, capabilities] =
        await Promise.all([
          tx.orgMembership.findUnique({
            where: {
              orgId_userId: { orgId: actor.orgId, userId: targetUserId },
            },
            select: { role: true },
          }),
          tx.userRoleAssignment.findMany({
            where: {
              orgId: actor.orgId,
              userId: targetUserId,
              revokedAt: null,
            },
            select: {
              id: true,
              tenantId: true,
              startsAt: true,
              expiresAt: true,
              roleDefinition: { select: { id: true, name: true, scope: true } },
            },
            orderBy: { startsAt: "desc" },
          }),
          tx.accessTagGrant.findMany({
            where: {
              orgId: actor.orgId,
              userId: targetUserId,
              revokedAt: null,
              OR: [
                { tenantId: null },
                ...(actor.tenantId ? [{ tenantId: actor.tenantId }] : []),
              ],
            },
            select: {
              id: true,
              tagKey: true,
              tenantId: true,
              grantedById: true,
              startsAt: true,
              expiresAt: true,
            },
            orderBy: { startsAt: "desc" },
          }),
          getOrgCapabilities(actor.orgId, tx),
        ]);

      const now = new Date();
      return {
        userId: targetUserId,
        orgId: actor.orgId,
        tenantId: actor.tenantId ?? null,
        organisationMembership: membership ? { role: membership.role } : null,
        assignments: assignments.map((assignment) => ({
          id: assignment.id,
          roleDefinitionId: assignment.roleDefinition.id,
          roleName: assignment.roleDefinition.name,
          scope: assignment.roleDefinition.scope,
          tenantId: assignment.tenantId,
          startsAt: assignment.startsAt,
          expiresAt: assignment.expiresAt,
          isActive:
            assignment.startsAt <= now &&
            (assignment.expiresAt === null || assignment.expiresAt > now),
        })),
        tagGrants: tagGrants.map((grant) => ({
          id: grant.id,
          tagKey: fromStoredAccessTagKey(grant.tagKey),
          tenantId: grant.tenantId,
          grantedById: grant.grantedById,
          startsAt: grant.startsAt,
          expiresAt: grant.expiresAt,
          isActive:
            grant.startsAt <= now &&
            (grant.expiresAt === null || grant.expiresAt > now),
        })),
        organisationCapabilities: capabilities,
      };
    });
  }

  /**
   * Reading your own effective permissions is not a delegation-boundary
   * read (unlike getEffectivePermissions, which reads another user's), so
   * this carries no platform.access.* bootstrap check - gating it would
   * make it unreachable for exactly the users (staff, parents, students)
   * who need it to render navigation.
   */
  async listOwnPermissions(actor: RoleActorContext): Promise<string[]> {
    return this.effectivePermissions.listForUser(
      actor.userId,
      actor.orgId,
      actor.tenantId,
    );
  }
}
