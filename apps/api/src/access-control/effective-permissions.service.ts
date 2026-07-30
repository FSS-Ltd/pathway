import { Inject, Injectable } from "@nestjs/common";
import type { PermissionKey } from "@pathway/platform";
import type {
  AccessDecision,
  EffectiveAccessRequest,
} from "./access-decision.types";
import { AccessCacheService } from "./access-cache.service";

export interface EffectivePermissionWithSources {
  permissionKey: PermissionKey;
  sourceRoleIds: string[];
}

export interface EffectivePermissionGrant {
  roleId: string;
  roleScope: "organisation" | "site" | "relationship";
  roleTenantId: string | null;
  roleIsActive: boolean;
  permissionKey: PermissionKey;
  permissionIsActive: boolean;
  startsAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

export interface EffectivePermissionsReader {
  getOrganisationMembership(userId: string, orgId: string): Promise<boolean>;
  findAssignments(
    userId: string,
    orgId: string,
    tenantId: string | undefined,
    now: Date,
  ): Promise<readonly EffectivePermissionGrant[]>;
}

export interface OrgCapabilitiesReader {
  get(orgId: string): Promise<readonly PermissionKey[]>;
}

export interface FeatureAvailabilityReader {
  isAvailable(orgId: string, permission: PermissionKey): Promise<boolean>;
}

export interface EffectivePermissionsContext {
  run<T>(
    orgId: string,
    tenantId: string | undefined,
    operation: () => Promise<T>,
  ): Promise<T>;
}

export const EFFECTIVE_PERMISSIONS_READER = Symbol(
  "EFFECTIVE_PERMISSIONS_READER",
);
export const ORG_CAPABILITIES_READER = Symbol("ORG_CAPABILITIES_READER");
export const FEATURE_AVAILABILITY_READER = Symbol(
  "FEATURE_AVAILABILITY_READER",
);
export const EFFECTIVE_PERMISSIONS_CONTEXT = Symbol(
  "EFFECTIVE_PERMISSIONS_CONTEXT",
);

@Injectable()
export class EffectivePermissionsService {
  constructor(
    @Inject(EFFECTIVE_PERMISSIONS_READER)
    private readonly reader: EffectivePermissionsReader,
    @Inject(ORG_CAPABILITIES_READER)
    private readonly capabilityReader: OrgCapabilitiesReader,
    @Inject(FEATURE_AVAILABILITY_READER)
    private readonly featureAvailability: FeatureAvailabilityReader,
    @Inject(EFFECTIVE_PERMISSIONS_CONTEXT)
    private readonly context: EffectivePermissionsContext,
    @Inject(AccessCacheService)
    private readonly cache: AccessCacheService,
  ) {}

  async resolve(request: EffectiveAccessRequest): Promise<AccessDecision> {
    return this.context.run(request.orgId, request.tenantId, () =>
      this.resolveInContext(request),
    );
  }

  async listForUser(
    userId: string,
    orgId: string,
    tenantId?: string,
  ): Promise<PermissionKey[]> {
    return this.context.run(orgId, tenantId, () =>
      this.listForUserInContext(userId, orgId, tenantId),
    );
  }

  async listForUserWithSources(
    userId: string,
    orgId: string,
    tenantId?: string,
  ): Promise<EffectivePermissionWithSources[]> {
    return this.context.run(orgId, tenantId, () =>
      this.listForUserWithSourcesInContext(userId, orgId, tenantId),
    );
  }

  private async resolveInContext(
    request: EffectiveAccessRequest,
  ): Promise<AccessDecision> {
    const snapshot = await this.loadSnapshot(
      request.userId,
      request.orgId,
      request.tenantId,
      request.now,
    );
    if (!snapshot.hasMembership) {
      return denied("no-membership");
    }

    const capabilities = new Set(snapshot.capabilities);
    if (!capabilities.has(request.permission)) {
      return denied("capability-missing");
    }

    if (
      !(await this.featureAvailability.isAvailable(
        request.orgId,
        request.permission,
      ))
    ) {
      return denied("feature-disabled");
    }

    const candidates = snapshot.grants.filter(
      (grant) =>
        grant.permissionKey === request.permission &&
        appliesToScope(grant, request.tenantId),
    );

    if (candidates.some((grant) => !grant.permissionIsActive)) {
      return denied("feature-disabled");
    }

    const sourceRoleIds = candidates
      .filter(
        (grant) =>
          grant.roleIsActive &&
          grant.permissionIsActive &&
          isAssignmentActive(grant, request.now),
      )
      .map((grant) => grant.roleId);
    const uniqueSourceRoleIds = [...new Set(sourceRoleIds)].sort();

    return uniqueSourceRoleIds.length > 0
      ? { allowed: true, reason: "allowed", sourceRoleIds: uniqueSourceRoleIds }
      : denied("permission-missing");
  }

  private async listForUserInContext(
    userId: string,
    orgId: string,
    tenantId?: string,
  ): Promise<PermissionKey[]> {
    const now = new Date();
    const snapshot = await this.loadSnapshot(userId, orgId, tenantId, now);
    if (!snapshot.hasMembership) {
      return [];
    }

    const availableCapabilities = new Set(snapshot.capabilities);
    const permissionKeys = [
      ...new Set(
        snapshot.grants
          .filter(
            (grant) =>
              grant.roleIsActive &&
              grant.permissionIsActive &&
              isAssignmentActive(grant, now) &&
              appliesToScope(grant, tenantId) &&
              availableCapabilities.has(grant.permissionKey),
          )
          .map((grant) => grant.permissionKey),
      ),
    ].sort();

    const availability = await Promise.all(
      permissionKeys.map(async (permission) => ({
        permission,
        available: await this.featureAvailability.isAvailable(
          orgId,
          permission,
        ),
      })),
    );

    return availability
      .filter(({ available }) => available)
      .map(({ permission }) => permission);
  }

  private async listForUserWithSourcesInContext(
    userId: string,
    orgId: string,
    tenantId?: string,
  ): Promise<EffectivePermissionWithSources[]> {
    const now = new Date();
    const snapshot = await this.loadSnapshot(userId, orgId, tenantId, now);
    if (!snapshot.hasMembership) {
      return [];
    }

    const availableCapabilities = new Set(snapshot.capabilities);
    const roleIdsByKey = new Map<PermissionKey, Set<string>>();
    for (const grant of snapshot.grants) {
      if (
        !grant.roleIsActive ||
        !grant.permissionIsActive ||
        !isAssignmentActive(grant, now) ||
        !appliesToScope(grant, tenantId) ||
        !availableCapabilities.has(grant.permissionKey)
      ) {
        continue;
      }
      const roleIds = roleIdsByKey.get(grant.permissionKey) ?? new Set();
      roleIds.add(grant.roleId);
      roleIdsByKey.set(grant.permissionKey, roleIds);
    }

    const permissionKeys = [...roleIdsByKey.keys()].sort();
    const availability = await Promise.all(
      permissionKeys.map(async (permission) => ({
        permission,
        available: await this.featureAvailability.isAvailable(
          orgId,
          permission,
        ),
      })),
    );

    return availability
      .filter(({ available }) => available)
      .map(({ permission }) => ({
        permissionKey: permission,
        sourceRoleIds: [...(roleIdsByKey.get(permission) ?? [])].sort(),
      }));
  }

  private loadSnapshot(
    userId: string,
    orgId: string,
    tenantId: string | undefined,
    now: Date,
  ): Promise<EffectiveAccessSnapshot> {
    return this.cache.getOrLoad({ userId, orgId, tenantId }, async () => {
      const hasMembership =
        await this.reader.getOrganisationMembership(userId, orgId);
      if (!hasMembership) {
        return { hasMembership, capabilities: [], grants: [] };
      }

      const [capabilities, grants] = await Promise.all([
        this.capabilityReader.get(orgId),
        this.reader.findAssignments(userId, orgId, tenantId, now),
      ]);
      return { hasMembership, capabilities, grants };
    });
  }
}

interface EffectiveAccessSnapshot {
  readonly hasMembership: boolean;
  readonly capabilities: readonly PermissionKey[];
  readonly grants: readonly EffectivePermissionGrant[];
}

function appliesToScope(
  grant: EffectivePermissionGrant,
  tenantId: string | undefined,
): boolean {
  if (grant.roleScope === "organisation") {
    return grant.roleTenantId === null;
  }

  return (
    tenantId !== undefined &&
    grant.roleScope === "site" &&
    grant.roleTenantId === tenantId
  );
}

function isAssignmentActive(
  grant: EffectivePermissionGrant,
  now: Date,
): boolean {
  return (
    grant.startsAt <= now &&
    (grant.expiresAt === null || grant.expiresAt > now) &&
    grant.revokedAt === null
  );
}

function denied(reason: AccessDecision["reason"]): AccessDecision {
  return { allowed: false, reason, sourceRoleIds: [] };
}
