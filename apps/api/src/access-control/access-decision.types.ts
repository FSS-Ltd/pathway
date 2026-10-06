import type { PermissionKey } from "@pathway/platform";

export interface EffectiveAccessRequest {
  userId: string;
  orgId: string;
  tenantId?: string;
  permission: PermissionKey;
  now: Date;
}

export interface AccessDecision {
  allowed: boolean;
  reason:
    | "allowed"
    | "no-membership"
    | "capability-missing"
    | "permission-missing"
    | "feature-disabled"
    | "relationship-denied"
    | "release-denied"
    | "tenant-denied";
  sourceRoleIds: string[];
  sourceTagGrantIds?: string[];
}
