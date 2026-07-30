import { Module } from "@nestjs/common";
import { prisma, withOrgRlsContext } from "@pathway/db";
import { getOrgCapabilities, type PermissionKey } from "@pathway/platform";
import { CommonModule } from "../common/common.module";
import { AuthModule } from "../auth/auth.module";
import { LoggingService } from "../common/logging/logging.service";
import { AccessDecisionLogger } from "./access-decision-logger";
import {
  accessShadowConfigFromEnvironment,
  AccessShadowService,
} from "./access-shadow.service";
import {
  EFFECTIVE_PERMISSIONS_READER,
  EFFECTIVE_PERMISSIONS_CONTEXT,
  EffectivePermissionsService,
  FEATURE_AVAILABILITY_READER,
  ORG_CAPABILITIES_READER,
  type EffectivePermissionsReader,
  type EffectivePermissionsContext,
  type FeatureAvailabilityReader,
  type OrgCapabilitiesReader,
} from "./effective-permissions.service";
import { PermissionGuard } from "./permission.guard";
import { AccessCacheService } from "./access-cache.service";
import { AccessAuditController } from "./access-audit.controller";
import { AccessAuditService } from "./access-audit.service";
import { AccessPermissionsController } from "./access-permissions.controller";
import { AccessPermissionsService } from "./access-permissions.service";
import { AccessUsersController } from "./access-users.controller";
import { AccessUsersService } from "./access-users.service";
import { AssignmentsController } from "./assignments.controller";
import { AssignmentsService } from "./assignments.service";
import { RolesController } from "./roles.controller";
import {
  ROLES_TRANSACTION_BOUNDARY,
  rolesTransactionBoundary,
  RolesService,
} from "./roles.service";
import { RoleSafetyService } from "./role-safety.service";

const effectivePermissionsReader: EffectivePermissionsReader = {
  async getOrganisationMembership(userId, orgId) {
    const membership = await prisma.orgMembership.findUnique({
      where: { orgId_userId: { orgId, userId } },
      select: { id: true },
    });
    return membership !== null;
  },

  async findAssignments(userId, orgId, tenantId, now) {
    const assignments = await prisma.userRoleAssignment.findMany({
      where: {
        userId,
        orgId,
        startsAt: { lte: now },
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        roleDefinition: tenantId
          ? {
              OR: [
                { scope: "organisation", tenantId: null },
                { scope: "site", tenantId },
              ],
            }
          : { scope: "organisation", tenantId: null },
      },
      select: {
        startsAt: true,
        expiresAt: true,
        revokedAt: true,
        roleDefinition: {
          select: {
            id: true,
            scope: true,
            tenantId: true,
            isActive: true,
            permissions: {
              select: {
                permission: { select: { key: true, isActive: true } },
              },
            },
          },
        },
      },
    });

    return assignments.flatMap((assignment) =>
      assignment.roleDefinition.permissions.map((rolePermission) => ({
        roleId: assignment.roleDefinition.id,
        roleScope: assignment.roleDefinition.scope,
        roleTenantId: assignment.roleDefinition.tenantId,
        roleIsActive: assignment.roleDefinition.isActive,
        // PermissionDefinition keys are synchronised from the platform registry.
        permissionKey: rolePermission.permission.key as PermissionKey,
        permissionIsActive: rolePermission.permission.isActive,
        startsAt: assignment.startsAt,
        expiresAt: assignment.expiresAt,
        revokedAt: assignment.revokedAt,
      })),
    );
  },
};

const orgCapabilitiesReader: OrgCapabilitiesReader = {
  get: getOrgCapabilities,
};

// ponytail: fails closed until a real feature-availability source is wired
// (see a405683, "fail closed until feature availability is configured").
// Every EffectivePermissionsService.resolve()/listForUser*() call returns
// empty until then; the effective-access-preview admin UI documents this gap
// rather than working around it. Upgrade: implement isAvailable against the
// real feature-rollout source once it exists.
const featureAvailabilityReader: FeatureAvailabilityReader = {
  async isAvailable() {
    return false;
  },
};

const effectivePermissionsContext: EffectivePermissionsContext = {
  async run(orgId, tenantId, operation) {
    return tenantId === undefined
      ? withOrgRlsContext(orgId, operation)
      : operation();
  },
};

@Module({
  imports: [CommonModule, AuthModule],
  controllers: [
    AssignmentsController,
    RolesController,
    AccessUsersController,
    AccessAuditController,
    AccessPermissionsController,
  ],
  providers: [
    AssignmentsService,
    RolesService,
    AccessUsersService,
    AccessAuditService,
    AccessPermissionsService,
    RoleSafetyService,
    {
      provide: ROLES_TRANSACTION_BOUNDARY,
      useValue: rolesTransactionBoundary,
    },
    AccessCacheService,
    EffectivePermissionsService,
    {
      provide: AccessShadowService,
      useFactory: (
        permissions: EffectivePermissionsService,
        logging: LoggingService,
      ) =>
        new AccessShadowService(
          permissions,
          logging.createLogger(AccessShadowService.name),
          accessShadowConfigFromEnvironment(),
        ),
      inject: [EffectivePermissionsService, LoggingService],
    },
    AccessDecisionLogger,
    PermissionGuard,
    {
      provide: EFFECTIVE_PERMISSIONS_READER,
      useValue: effectivePermissionsReader,
    },
    {
      provide: ORG_CAPABILITIES_READER,
      useValue: orgCapabilitiesReader,
    },
    {
      provide: FEATURE_AVAILABILITY_READER,
      useValue: featureAvailabilityReader,
    },
    {
      provide: EFFECTIVE_PERMISSIONS_CONTEXT,
      useValue: effectivePermissionsContext,
    },
  ],
  exports: [
    AccessCacheService,
    AccessShadowService,
    EffectivePermissionsService,
    PermissionGuard,
  ],
})
export class AccessControlModule {}
