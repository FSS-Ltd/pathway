import { Inject, Injectable } from "@nestjs/common";
import type { PermissionKey } from "@pathway/platform";
import type {
  AccessDecision,
  EffectiveAccessRequest,
} from "./access-decision.types";

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

export const EFFECTIVE_PERMISSIONS_READER = Symbol(
  "EFFECTIVE_PERMISSIONS_READER",
);
export const ORG_CAPABILITIES_READER = Symbol("ORG_CAPABILITIES_READER");
export const FEATURE_AVAILABILITY_READER = Symbol(
  "FEATURE_AVAILABILITY_READER",
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
  ) {}

  async resolve(request: EffectiveAccessRequest): Promise<AccessDecision> {
    if (
      !(await this.reader.getOrganisationMembership(
        request.userId,
        request.orgId,
      ))
    ) {
      return denied("no-membership");
    }

    const capabilities = new Set(
      await this.capabilityReader.get(request.orgId),
    );
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

    const candidates = (
      await this.reader.findAssignments(
        request.userId,
        request.orgId,
        request.tenantId,
        request.now,
      )
    ).filter(
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

  async listForUser(
    userId: string,
    orgId: string,
    tenantId?: string,
  ): Promise<PermissionKey[]> {
    if (!(await this.reader.getOrganisationMembership(userId, orgId))) {
      return [];
    }

    const now = new Date();
    const [capabilities, grants] = await Promise.all([
      this.capabilityReader.get(orgId),
      this.reader.findAssignments(userId, orgId, tenantId, now),
    ]);
    const availableCapabilities = new Set(capabilities);
    const permissionKeys = [
      ...new Set(
        grants
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
