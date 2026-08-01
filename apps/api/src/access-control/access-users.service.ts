import { Inject, Injectable } from "@nestjs/common";
import { getOrgCapabilities } from "@pathway/platform";
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
  organisationCapabilities: string[];
}

@Injectable()
export class AccessUsersService {
  constructor(
    @Inject(ROLES_TRANSACTION_BOUNDARY)
    private readonly transaction: RolesTransactionBoundary,
    @Inject(EffectivePermissionsService)
    private readonly effectivePermissions: EffectivePermissionsService,
  ) {}

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
      const [membership, assignments, capabilities] = await Promise.all([
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
