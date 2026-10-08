import {
  Prisma,
  applyTenantContext,
  runTransaction,
  withPrismaTransactionContext,
  roleScopeAcceptsPermissionScope,
  type RoleScope,
} from "@pathway/db";
import {
  CAPABILITY_DEFINITIONS,
  getOrgCapabilities,
  type PermissionKey,
} from "@pathway/platform";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AccessCacheService } from "./access-cache.service";
import { EffectivePermissionsService } from "./effective-permissions.service";
import { roleApiError } from "./role-api-error";
import { RoleSafetyService } from "./role-safety.service";
import type {
  CloneRoleDto,
  CreateRoleDto,
  RetireRoleDto,
  UpdateRoleDto,
} from "./dto/role.dto";

export interface DelegableCeilingInput {
  actorPermissionKeys: readonly PermissionKey[];
  activeCapabilities: readonly PermissionKey[];
  activePermissionDefinitions: readonly {
    key: string;
    delegable: boolean;
    isActive: boolean;
  }[];
}

/**
 * The delegable ceiling is the intersection of what the actor themself
 * effectively holds, what the org's active capabilities include (vertical +
 * modules), and the registry's static `delegable` flag. `delegable: false`
 * is what keeps platform-access and safeguarding-case keys ungrantable,
 * regardless of vertical or actor grants.
 */
export function resolveDelegableCeiling(
  input: DelegableCeilingInput,
): PermissionKey[] {
  const activeDelegableMetadata = new Set(
    input.activePermissionDefinitions
      .filter((definition) => definition.isActive && definition.delegable)
      .map((definition) => definition.key),
  );
  const actorHeld = new Set(input.actorPermissionKeys);

  return [...new Set(input.activeCapabilities)]
    .filter(
      (key) =>
        key in CAPABILITY_DEFINITIONS &&
        activeDelegableMetadata.has(key) &&
        actorHeld.has(key),
    )
    .sort();
}

export interface RoleActorContext {
  orgId: string;
  tenantId?: string;
  userId: string;
  legacyOrgRoles: readonly string[];
  requestId: string;
}

export { roleScopeAcceptsPermissionScope } from "@pathway/db";

export const ROLES_TRANSACTION_BOUNDARY = Symbol("ROLES_TRANSACTION_BOUNDARY");

export interface RolesTransactionBoundary {
  run<T>(
    actor: RoleActorContext,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T>;
}

export type RolesTransactionRunner = <T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
) => Promise<T>;

export function createRolesTransactionBoundary(
  transactionRunner: RolesTransactionRunner = runTransaction,
): RolesTransactionBoundary {
  return {
    async run(actor, operation) {
      return transactionRunner(async (tx) => {
        await applyTenantContext(tx, actor.tenantId ?? "", actor.orgId);

        if (actor.tenantId) {
          const site = await tx.tenant.findFirst({
            where: { id: actor.tenantId, orgId: actor.orgId },
            select: { id: true },
          });
          if (!site) {
            throw roleApiError(
              HttpStatus.FORBIDDEN,
              "INVALID_SELECTED_SITE",
              actor.requestId,
            );
          }
        }

        return withPrismaTransactionContext(
          tx,
          () => operation(tx),
          actor.tenantId
            ? {
                kind: "tenant",
                tenantId: actor.tenantId,
                orgId: actor.orgId,
                readOnly: false,
              }
            : { kind: "org", orgId: actor.orgId, readOnly: false },
        );
      });
    },
  };
}

export const rolesTransactionBoundary = createRolesTransactionBoundary();

export interface UpdateRoleCommand extends UpdateRoleDto {
  roleId: string;
}

type RoleMutation = "create" | "update" | "retire";

@Injectable()
export class RolesService {
  constructor(
    @Inject(ROLES_TRANSACTION_BOUNDARY)
    private readonly transaction: RolesTransactionBoundary,
    @Inject(AccessCacheService)
    private readonly cache: AccessCacheService,
    @Inject(RoleSafetyService)
    private readonly roleSafety: RoleSafetyService,
    @Inject(EffectivePermissionsService)
    private readonly effectivePermissions: EffectivePermissionsService,
  ) {}

  async list(actor: RoleActorContext) {
    return this.inOrganisationContext(actor, async (tx) => {
      return tx.orgRoleDefinition.findMany({
        where: { orgId: actor.orgId },
        include: { permissions: { select: { permissionKey: true } } },
        orderBy: { name: "asc" },
      });
    });
  }

  async get(roleId: string, actor: RoleActorContext) {
    return this.inOrganisationContext(actor, async (tx) => {
      return this.requireRoleInTransaction(tx, roleId, actor);
    });
  }

  async create(command: CreateRoleDto, actor: RoleActorContext) {
    return this.inOrganisationContext(actor, async (tx) => {
      if (command.scope === "site" && !actor.tenantId) {
        throw roleApiError(
          HttpStatus.BAD_REQUEST,
          "INVALID_SELECTED_SITE",
          actor.requestId,
        );
      }
      const permissionKeys = await this.validatePermissionKeys(
        tx, command.permissionKeys, command.scope, actor,
      );
      const role = await this.withRoleNameConflictTranslation(actor, () =>
        tx.orgRoleDefinition.create({
          data: {
            orgId: actor.orgId,
            tenantId: command.scope === "site" ? actor.tenantId : null,
            name: command.name,
            description: command.description,
            scope: command.scope,
            createdById: actor.userId,
            updatedById: actor.userId,
            permissions: {
              create: permissionKeys.map((permissionKey) => ({
                permissionKey,
                grantedById: actor.userId,
              })),
            },
          },
          include: { permissions: { select: { permissionKey: true } } },
        }),
      );
      await this.recordRevisionAndAudit(tx, role, actor, "create");
      return role;
    });
  }

  async clone(roleId: string, command: CloneRoleDto, actor: RoleActorContext) {
    return this.inOrganisationContext(actor, async (tx) => {
      const source = await this.requireRoleInTransaction(tx, roleId, actor);
      const permissionKeys = await this.resolveClonePermissionKeys(
        tx, source.permissions.map((permission) => permission.permissionKey), source.scope, actor,
      );
      const role = await this.withRoleNameConflictTranslation(actor, () =>
        tx.orgRoleDefinition.create({
          data: {
            orgId: actor.orgId,
            tenantId: source.tenantId,
            name: command.name,
            description:
              command.description ?? source.description ?? undefined,
            scope: source.scope,
            createdById: actor.userId,
            updatedById: actor.userId,
            permissions: {
              create: permissionKeys.map((permissionKey) => ({
                permissionKey,
                grantedById: actor.userId,
              })),
            },
          },
          include: { permissions: { select: { permissionKey: true } } },
        }),
      );
      await this.recordRevisionAndAudit(tx, role, actor, "create");
      return role;
    });
  }

  async update(command: UpdateRoleCommand, actor: RoleActorContext) {
    return this.mutate(command.roleId, command.expectedVersion, command, actor, "update");
  }

  async retire(roleId: string, command: RetireRoleDto, actor: RoleActorContext) {
    const result = await this.inOrganisationContext(actor, async (tx) => {
      const role = await this.requireRoleInTransaction(tx, roleId, actor);
      this.assertCustomRole(role, actor);
      await this.roleSafety.assertHeadAndSelfLockoutSafe({
        tx,
        actorUserId: actor.userId,
        orgId: actor.orgId,
        requestId: actor.requestId,
        mutate: async () => {
          const updated = await tx.orgRoleDefinition.updateMany({
            where: {
              id: roleId,
              orgId: actor.orgId,
              version: command.expectedVersion,
            },
            data: {
              isActive: false,
              version: { increment: 1 },
              updatedById: actor.userId,
            },
          });
          if (updated.count !== 1) {
            throw roleApiError(
              HttpStatus.CONFLICT,
              "ROLE_VERSION_CONFLICT",
              actor.requestId,
            );
          }
        },
      });
      const retired = await this.requireRoleInTransaction(tx, roleId, actor);
      await this.recordRevisionAndAudit(tx, retired, actor, "retire");
      const userIds = await this.findAssignedUserIds(tx, roleId, actor.orgId);
      return { role: retired, userIds };
    });
    await this.invalidateUsers(result.userIds, actor.orgId);
    return result.role;
  }

  private async mutate(
    roleId: string, expectedVersion: number, command: UpdateRoleDto, actor: RoleActorContext, mutation: RoleMutation,
  ) {
    const result = await this.inOrganisationContext(actor, async (tx) => {
      const role = await this.requireRoleInTransaction(tx, roleId, actor);
      this.assertCustomRole(role, actor);
      const permissionKeys = await this.validatePermissionKeys(tx, command.permissionKeys, role.scope, actor);
      await this.roleSafety.assertHeadAndSelfLockoutSafe({
        tx,
        actorUserId: actor.userId,
        orgId: actor.orgId,
        requestId: actor.requestId,
        mutate: async () => {
          const updated = await this.withRoleNameConflictTranslation(
            actor,
            () =>
              tx.orgRoleDefinition.updateMany({
                where: {
                  id: roleId,
                  orgId: actor.orgId,
                  version: expectedVersion,
                },
                data: {
                  name: command.name,
                  description: command.description,
                  version: { increment: 1 },
                  updatedById: actor.userId,
                },
              }),
          );
          if (updated.count !== 1) {
            throw roleApiError(
              HttpStatus.CONFLICT,
              "ROLE_VERSION_CONFLICT",
              actor.requestId,
            );
          }
          await tx.orgRolePermission.deleteMany({
            where: { roleDefinitionId: roleId },
          });
          await tx.orgRolePermission.createMany({
            data: permissionKeys.map((permissionKey) => ({
              roleDefinitionId: roleId,
              permissionKey,
              grantedById: actor.userId,
            })),
          });
        },
      });
      const changed = await this.requireRoleInTransaction(tx, roleId, actor);
      await this.recordRevisionAndAudit(tx, changed, actor, mutation);
      const userIds = await this.findAssignedUserIds(tx, roleId, actor.orgId);
      return { role: changed, userIds };
    });
    await this.invalidateUsers(result.userIds, actor.orgId);
    return result.role;
  }

  private async findAssignedUserIds(
    tx: Prisma.TransactionClient,
    roleDefinitionId: string,
    orgId: string,
  ): Promise<string[]> {
    const assignments = await tx.userRoleAssignment.findMany({
      where: { orgId, roleDefinitionId, revokedAt: null },
      distinct: ["userId"],
      select: { userId: true },
    });
    return assignments.map(({ userId }) => userId);
  }

  private async invalidateUsers(
    userIds: readonly string[],
    orgId: string,
  ): Promise<void> {
    await Promise.allSettled(
      [...new Set(userIds)].map((userId) =>
        this.cache.invalidateUser(userId, orgId),
      ),
    );
  }

  private async validatePermissionKeys(
    tx: Prisma.TransactionClient, keys: readonly string[], scope: RoleScope, actor: RoleActorContext,
  ): Promise<PermissionKey[]> {
    const distinct = [...new Set(keys)];
    const unknown = distinct.filter((key) => !(key in CAPABILITY_DEFINITIONS));
    if (unknown.length > 0) {
      throw roleApiError(
        HttpStatus.BAD_REQUEST,
        "UNKNOWN_PERMISSION_KEY",
        actor.requestId,
        { keys: unknown },
      );
    }
    const metadata = await tx.permissionDefinition.findMany({
      where: { key: { in: distinct } }, select: { key: true, delegable: true, isActive: true, scope: true },
    });
    const capabilities = await getOrgCapabilities(actor.orgId, tx);
    const actorPermissionKeys = await this.effectivePermissions.listForUser(
      actor.userId, actor.orgId, actor.tenantId,
    );
    const ceilingKeys = new Set(resolveDelegableCeiling({
      actorPermissionKeys, activeCapabilities: capabilities, activePermissionDefinitions: metadata,
    }));
    for (const key of distinct) {
      const definition = metadata.find((entry) => entry.key === key);
      if (!definition || !definition.isActive || !capabilities.includes(key as PermissionKey)) {
        throw roleApiError(
          HttpStatus.BAD_REQUEST,
          "INACTIVE_PERMISSION_KEY",
          actor.requestId,
          { key },
        );
      }
      if (!definition.delegable) {
        throw roleApiError(
          HttpStatus.FORBIDDEN,
          "NON_DELEGABLE_PERMISSION_KEY",
          actor.requestId,
          { key },
        );
      }
      if (!roleScopeAcceptsPermissionScope(scope, definition.scope)) {
        throw roleApiError(
          HttpStatus.BAD_REQUEST,
          "ILLEGAL_ROLE_SCOPE",
          actor.requestId,
          { key, scope },
        );
      }
      if (!ceilingKeys.has(key as PermissionKey)) {
        throw roleApiError(
          HttpStatus.FORBIDDEN,
          "ACTOR_CANNOT_DELEGATE",
          actor.requestId,
          { key },
        );
      }
    }
    return distinct as PermissionKey[];
  }

  private async resolveClonePermissionKeys(
    tx: Prisma.TransactionClient,
    keys: readonly string[],
    scope: RoleScope,
    actor: RoleActorContext,
  ): Promise<PermissionKey[]> {
    const knownKeys = [...new Set(keys)].filter(
      (key): key is PermissionKey => key in CAPABILITY_DEFINITIONS,
    );
    const metadata = await tx.permissionDefinition.findMany({
      where: { key: { in: knownKeys } },
      select: {
        key: true,
        delegable: true,
        isActive: true,
        scope: true,
      },
    });
    const capabilities = await getOrgCapabilities(actor.orgId, tx);
    const actorPermissionKeys = await this.effectivePermissions.listForUser(
      actor.userId, actor.orgId, actor.tenantId,
    );
    const ceilingKeys = new Set(
      resolveDelegableCeiling({
        actorPermissionKeys,
        activeCapabilities: capabilities,
        activePermissionDefinitions: metadata,
      }),
    );
    const metadataByKey = new Map(
      metadata.map((definition) => [definition.key, definition]),
    );

    return knownKeys.filter((key) => {
      const definition = metadataByKey.get(key);
      return (
        definition?.isActive === true &&
        definition.delegable &&
        capabilities.includes(key) &&
        ceilingKeys.has(key) &&
        roleScopeAcceptsPermissionScope(scope, definition.scope)
      );
    });
  }

  private async requireRoleInTransaction(
    tx: Prisma.TransactionClient,
    roleId: string,
    actor: RoleActorContext,
  ) {
    const role = await tx.orgRoleDefinition.findFirst({
      where: { id: roleId, orgId: actor.orgId }, include: { permissions: { select: { permissionKey: true } } },
    });
    if (!role) {
      throw roleApiError(HttpStatus.NOT_FOUND, "ROLE_NOT_FOUND", actor.requestId);
    }
    return role;
  }

  private assertCustomRole(
    role: { isSystem: boolean },
    actor: RoleActorContext,
  ): void {
    if (role.isSystem) {
      throw roleApiError(
        HttpStatus.FORBIDDEN,
        "SYSTEM_ROLE_PROTECTED",
        actor.requestId,
      );
    }
  }

  private async recordRevisionAndAudit(
    tx: Prisma.TransactionClient,
    role: Awaited<ReturnType<RolesService["requireRoleInTransaction"]>>,
    actor: RoleActorContext,
    mutation: RoleMutation,
  ): Promise<void> {
    const permissionKeys = role.permissions.map((permission) => permission.permissionKey).sort();
    await tx.orgRoleRevision.create({
      data: {
        roleDefinitionId: role.id, orgId: role.orgId, tenantId: role.tenantId,
        version: role.version, name: role.name, description: role.description,
        scope: role.scope, isActive: role.isActive, permissionKeys, actorUserId: actor.userId,
      },
    });
    await recordAuditEventInTransaction(tx, {
      actorUserId: actor.userId, tenantId: role.tenantId ?? undefined, orgId: role.orgId,
      entityType: AuditEntityType.ORG_ROLE, entityId: role.id,
      action: mutation === "create" ? AuditAction.ROLE_CREATED : mutation === "retire" ? AuditAction.ROLE_RETIRED : AuditAction.ROLE_UPDATED,
      metadata: { version: role.version, permissionKeys, requestId: actor.requestId },
    });
  }

  private async withRoleNameConflictTranslation<T>(
    actor: RoleActorContext,
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (isUniqueConstraintConflict(error)) {
        throw roleApiError(
          HttpStatus.CONFLICT,
          "ROLE_NAME_CONFLICT",
          actor.requestId,
        );
      }
      throw error;
    }
  }

  private async inOrganisationContext<T>(
    actor: RoleActorContext,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.transaction.run(actor, operation);
  }
}

function isUniqueConstraintConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as {
    code?: unknown;
    meta?: { code?: unknown };
  };
  return (
    candidate.code === "P2002" ||
    candidate.code === "23505" ||
    candidate.meta?.code === "23505"
  );
}
