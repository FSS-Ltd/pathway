import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@pathway/db";
import type { PermissionKey } from "@pathway/platform";
import type {
  AccessDecision,
  EffectiveAccessRequest,
} from "./access-decision.types";
import { AccessCacheService } from "./access-cache.service";

export interface EffectivePermissionWithSources {
  permissionKey: PermissionKey;
  sourceRoleIds: string[];
  sourceTagGrantIds?: string[];
  sourceSuperUser?: true;
}

export interface EffectiveMembership {
  hasMembership: boolean;
  isSuperUser: boolean;
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

export interface EffectiveTagPermissionGrant {
  tagGrantId: string;
  tenantId: string | null;
  permissionKey: PermissionKey;
  permissionIsActive: boolean;
  startsAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

export interface EffectivePermissionsReader {
  isActiveSuperUser(userId: string): Promise<boolean>;
  getMembership(
    userId: string,
    orgId: string,
    tenantId: string | undefined,
    isSuperUser: boolean,
  ): Promise<EffectiveMembership>;
  findActivePermissionKeys(
    keys: readonly PermissionKey[],
  ): Promise<readonly PermissionKey[]>;
  findAssignments(
    userId: string,
    orgId: string,
    tenantId: string | undefined,
    now: Date,
  ): Promise<readonly EffectivePermissionGrant[]>;
  findTagGrants(
    userId: string,
    orgId: string,
    tenantId: string | undefined,
    now: Date,
  ): Promise<readonly EffectiveTagPermissionGrant[]>;
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
    transaction?: Prisma.TransactionClient,
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
    const isSuperUser = await this.reader.isActiveSuperUser(request.userId);
    return this.context.run(request.orgId, request.tenantId, () =>
      this.resolveInContext(request, isSuperUser),
    );
  }

  async listForUser(
    userId: string,
    orgId: string,
    tenantId?: string,
  ): Promise<PermissionKey[]> {
    const isSuperUser = await this.reader.isActiveSuperUser(userId);
    return this.context.run(orgId, tenantId, () =>
      this.listForUserInContext(userId, orgId, tenantId, isSuperUser),
    );
  }

  async listForUserWithSources(
    userId: string,
    orgId: string,
    tenantId?: string,
    now = new Date(),
  ): Promise<EffectivePermissionWithSources[]> {
    const isSuperUser = await this.reader.isActiveSuperUser(userId);
    return this.context.run(orgId, tenantId, () =>
      this.listForUserWithSourcesInContext(
        userId,
        orgId,
        tenantId,
        now,
        isSuperUser,
      ),
    );
  }

  /** Read uncommitted access changes for an audited cutover in the caller's transaction. */
  async listForUserWithSourcesInTransaction(
    userId: string,
    orgId: string,
    tenantId: string | undefined,
    now: Date,
    transaction: Prisma.TransactionClient,
    knownOrdinaryUser?: true,
  ): Promise<EffectivePermissionWithSources[]> {
    const isSuperUser = knownOrdinaryUser
      ? false
      : await this.reader.isActiveSuperUser(userId);
    return this.context.run(
      orgId,
      tenantId,
      () =>
        this.listForUserWithSourcesInContext(
          userId,
          orgId,
          tenantId,
          now,
          isSuperUser,
          true,
        ),
      transaction,
    );
  }

  private async resolveInContext(
    request: EffectiveAccessRequest,
    isSuperUser: boolean,
  ): Promise<AccessDecision> {
    const snapshot = await this.loadSnapshot(
      request.userId,
      request.orgId,
      request.tenantId,
      request.now,
      isSuperUser,
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

    if (snapshot.isSuperUser) {
      const active = await this.reader.findActivePermissionKeys([
        request.permission,
      ]);
      return active.includes(request.permission)
        ? {
            allowed: true,
            reason: "allowed",
            sourceRoleIds: [],
            sourceSuperUser: true,
          }
        : denied("feature-disabled");
    }

    const tagGrants = await this.reader.findTagGrants(
      request.userId,
      request.orgId,
      request.tenantId,
      request.now,
    );

    const candidates = snapshot.grants.filter(
      (grant) =>
        grant.permissionKey === request.permission &&
        appliesToScope(grant, request.tenantId),
    );
    const tagCandidates = tagGrants.filter(
      (grant) =>
        grant.permissionKey === request.permission &&
        appliesToTagScope(grant, request.tenantId),
    );

    if (
      candidates.some((grant) => !grant.permissionIsActive) ||
      tagCandidates.some((grant) => !grant.permissionIsActive)
    ) {
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
    const sourceTagGrantIds = [
      ...new Set(
        tagCandidates
          .filter((grant) => isTagGrantActive(grant, request.now))
          .map((grant) => grant.tagGrantId),
      ),
    ].sort();

    return uniqueSourceRoleIds.length > 0 || sourceTagGrantIds.length > 0
      ? {
          allowed: true,
          reason: "allowed",
          sourceRoleIds: uniqueSourceRoleIds,
          ...(sourceTagGrantIds.length > 0 ? { sourceTagGrantIds } : {}),
        }
      : denied("permission-missing");
  }

  private async listForUserInContext(
    userId: string,
    orgId: string,
    tenantId: string | undefined,
    isSuperUser: boolean,
  ): Promise<PermissionKey[]> {
    const now = new Date();
    const snapshot = await this.loadSnapshot(
      userId,
      orgId,
      tenantId,
      now,
      isSuperUser,
    );
    if (!snapshot.hasMembership) {
      return [];
    }

    const tagGrants = await this.reader.findTagGrants(
      userId,
      orgId,
      tenantId,
      now,
    );

    const availableCapabilities = new Set(snapshot.capabilities);
    const superUserKeys = snapshot.isSuperUser
      ? await this.reader.findActivePermissionKeys(snapshot.capabilities)
      : [];
    const permissionKeys = [
      ...new Set([
        ...superUserKeys,
        ...snapshot.grants
          .filter(
            (grant) =>
              grant.roleIsActive &&
              grant.permissionIsActive &&
              isAssignmentActive(grant, now) &&
              appliesToScope(grant, tenantId) &&
              availableCapabilities.has(grant.permissionKey),
          )
          .map((grant) => grant.permissionKey),
        ...tagGrants
          .filter(
            (grant) =>
              grant.permissionIsActive &&
              isTagGrantActive(grant, now) &&
              appliesToTagScope(grant, tenantId) &&
              availableCapabilities.has(grant.permissionKey),
          )
          .map((grant) => grant.permissionKey),
      ]),
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
    tenantId: string | undefined,
    now: Date,
    isSuperUser: boolean,
    bypassCache = false,
  ): Promise<EffectivePermissionWithSources[]> {
    const snapshot = await this.loadSnapshot(
      userId,
      orgId,
      tenantId,
      now,
      isSuperUser,
      bypassCache,
    );
    if (!snapshot.hasMembership) {
      return [];
    }

    const tagGrants = await this.reader.findTagGrants(
      userId,
      orgId,
      tenantId,
      now,
    );

    const availableCapabilities = new Set(snapshot.capabilities);
    const superUserKeys = snapshot.isSuperUser
      ? await this.reader.findActivePermissionKeys(snapshot.capabilities)
      : [];
    const roleIdsByKey = new Map<PermissionKey, Set<string>>();
    const tagIdsByKey = new Map<PermissionKey, Set<string>>();
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

    for (const grant of tagGrants) {
      if (
        !grant.permissionIsActive ||
        !isTagGrantActive(grant, now) ||
        !appliesToTagScope(grant, tenantId) ||
        !availableCapabilities.has(grant.permissionKey)
      ) {
        continue;
      }
      const tagIds = tagIdsByKey.get(grant.permissionKey) ?? new Set<string>();
      tagIds.add(grant.tagGrantId);
      tagIdsByKey.set(grant.permissionKey, tagIds);
    }

    const permissionKeys = [
      ...new Set([
        ...superUserKeys,
        ...roleIdsByKey.keys(),
        ...tagIdsByKey.keys(),
      ]),
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
      .map(({ permission }) => ({
        permissionKey: permission,
        sourceRoleIds: [...(roleIdsByKey.get(permission) ?? [])].sort(),
        ...(snapshot.isSuperUser && superUserKeys.includes(permission)
          ? { sourceSuperUser: true as const }
          : {}),
        ...(tagIdsByKey.has(permission)
          ? {
              sourceTagGrantIds: [
                ...(tagIdsByKey.get(permission) ?? []),
              ].sort(),
            }
          : {}),
      }));
  }

  private async loadSnapshot(
    userId: string,
    orgId: string,
    tenantId: string | undefined,
    now: Date,
    isSuperUser: boolean,
    bypassCache = false,
  ): Promise<EffectiveAccessSnapshot> {
    const membership = await this.reader.getMembership(
      userId,
      orgId,
      tenantId,
      isSuperUser,
    );
    if (!membership.hasMembership) {
      return { ...membership, capabilities: [], grants: [] };
    }
    const [capabilities, grants] = await Promise.all([
      this.capabilityReader.get(orgId),
      bypassCache
        ? this.reader.findAssignments(userId, orgId, tenantId, now)
        : this.cache.getOrLoad({ userId, orgId, tenantId }, () =>
            this.reader.findAssignments(userId, orgId, tenantId, now),
          ),
    ]);
    return { ...membership, capabilities, grants };
  }
}

interface EffectiveAccessSnapshot {
  readonly hasMembership: boolean;
  readonly isSuperUser: boolean;
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

function appliesToTagScope(
  grant: EffectiveTagPermissionGrant,
  tenantId: string | undefined,
): boolean {
  return grant.tenantId === null || grant.tenantId === tenantId;
}

function isTagGrantActive(
  grant: EffectiveTagPermissionGrant,
  now: Date,
): boolean {
  return (
    grant.startsAt <= now &&
    (grant.expiresAt === null || grant.expiresAt > now) &&
    grant.revokedAt === null
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
