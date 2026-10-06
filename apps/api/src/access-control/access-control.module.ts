import { Module } from "@nestjs/common";
import {
  applyTenantContext,
  prisma,
  withOrgRlsContext,
  withPrismaTransactionContext,
  withTenantRlsContext,
} from "@pathway/db";
import {
  CAPABILITY_DEFINITIONS,
  accessTagPermissionKeys,
  getOrgCapabilities,
  isAccessTagAvailable,
  type CapabilityDefinition,
  type PermissionKey,
} from "@pathway/platform";
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
import { AccessTagsController } from "./access-tags.controller";
import { AccessTagsService } from "./access-tags.service";
import { fromStoredAccessTagKey } from "./access-tag-keys";
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

  async findTagGrants(userId, orgId, tenantId, now) {
    const [grants, siteMembership] = await Promise.all([
      prisma.accessTagGrant.findMany({
        where: {
          orgId,
          userId,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          AND: [
            {
              OR: [{ tenantId: null }, ...(tenantId ? [{ tenantId }] : [])],
            },
          ],
        },
        select: {
          id: true,
          tenantId: true,
          tagKey: true,
          startsAt: true,
          expiresAt: true,
          revokedAt: true,
        },
      }),
      tenantId
        ? prisma.siteMembership.findUnique({
            where: { tenantId_userId: { tenantId, userId } },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);
    const visible = grants
      .filter((grant) => grant.tenantId === null || siteMembership !== null)
      .map((grant) => ({
        grant,
        publicKey: fromStoredAccessTagKey(grant.tagKey),
      }))
      .filter(({ publicKey }) => isAccessTagAvailable(publicKey));
    const keys = [
      ...new Set(
        visible.flatMap(({ publicKey }) => accessTagPermissionKeys(publicKey)),
      ),
    ];
    const metadata = await prisma.permissionDefinition.findMany({
      where: { key: { in: keys } },
      select: { key: true, isActive: true },
    });
    const activeByKey = new Map(
      metadata.map(({ key, isActive }) => [key, isActive]),
    );
    return visible.flatMap(({ grant, publicKey }) =>
      accessTagPermissionKeys(publicKey).map((permissionKey) => ({
        tagGrantId: grant.id,
        tenantId: grant.tenantId,
        permissionKey,
        permissionIsActive: activeByKey.get(permissionKey) === true,
        startsAt: grant.startsAt,
        expiresAt: grant.expiresAt,
        revokedAt: grant.revokedAt,
      })),
    );
  },
};

const orgCapabilitiesReader: OrgCapabilitiesReader = {
  get: getOrgCapabilities,
};

// Only ace.student_community declares a FeatureToggle today, and no route
// using it exists yet (lands in ACE-F15+). A key with no toggle is not
// subject to this layer at all; a key with one stays denied until a real
// per-org rollout source is wired. Unknown keys fail closed.
const featureAvailabilityReader: FeatureAvailabilityReader = {
  async isAvailable(_orgId, permission) {
    const definition = (
      CAPABILITY_DEFINITIONS as Record<string, CapabilityDefinition>
    )[permission];
    if (!definition) return false;
    return definition.featureToggle === undefined;
  },
};

const effectivePermissionsContext: EffectivePermissionsContext = {
  async run(orgId, tenantId, operation, transaction) {
    if (transaction) {
      await applyTenantContext(transaction, tenantId ?? "", orgId);
      return withPrismaTransactionContext(transaction, operation);
    }
    return tenantId
      ? withTenantRlsContext(tenantId, orgId, () => operation())
      : withOrgRlsContext(orgId, () => operation());
  },
};

@Module({
  imports: [CommonModule, AuthModule],
  controllers: [
    AssignmentsController,
    RolesController,
    AccessUsersController,
    AccessTagsController,
    AccessAuditController,
    AccessPermissionsController,
  ],
  providers: [
    AssignmentsService,
    RolesService,
    AccessUsersService,
    AccessTagsService,
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
    // PermissionGuard's own dependency: a consuming module (e.g.
    // AnnouncementsModule) that only imports AccessControlModule to use the
    // guard needs this resolvable too, or Nest can't construct the guard
    // outside AccessControlModule's own controllers.
    AccessDecisionLogger,
  ],
})
export class AccessControlModule {}
