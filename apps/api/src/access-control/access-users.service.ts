import { Inject, Injectable } from "@nestjs/common";
import { getOrgCapabilities } from "@pathway/platform";
import { assertPlatformAccessRouteAccessWithShadow } from "./assert-platform-access";
import { AccessShadowService } from "./access-shadow.service";
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
    @Inject(AccessShadowService)
    private readonly shadow: AccessShadowService,
  ) {}

  async getEffectivePermissions(
    targetUserId: string,
    actor: RoleActorContext,
  ): Promise<EffectivePermissionsResult> {
    await this.transaction.run(actor, (tx) =>
      assertPlatformAccessRouteAccessWithShadow(
        tx,
        actor,
        "platform.access.users.read",
        "EFFECTIVE_ACCESS_API_ACCESS_DENIED",
        "GET /access/users/:userId/effective-permissions",
        this.shadow,
      ),
    );

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
      await assertPlatformAccessRouteAccessWithShadow(
        tx,
        actor,
        "platform.access.users.read",
        "ACCESS_SUMMARY_API_ACCESS_DENIED",
        "GET /access/users/:userId/access-summary",
        this.shadow,
      );

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
}
