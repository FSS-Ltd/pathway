import type { RoleScope } from "@prisma/client";
import { roleScopeAcceptsPermissionScope } from "@pathway/db";
import {
  CAPABILITY_DEFINITIONS,
  accessTagPermissionKeys,
  isAccessTagAvailable,
  type AccessTagKey,
  type PermissionKey,
} from "@pathway/platform";
import { allAccessTagKeys } from "./access-tag-keys";

export interface InventoryRole {
  id: string;
  name: string;
  scope: RoleScope;
  tenantId: string | null;
  isActive: boolean;
  permissionKeys: readonly string[];
}

export interface RawCoverage {
  fixedRoles: ReadonlyArray<{
    id: string;
    name: string;
    permissionKeys: readonly string[];
  }>;
  accessTags: ReadonlyArray<{
    key: AccessTagKey;
    permissionKeys: readonly PermissionKey[];
  }>;
  uncoveredPermissionKeys: readonly string[];
}

/** Candidate coverage only. Issuing a tag still requires the normal delegation checks. */
export function assessCustomAssignmentCoverage(
  customRole: InventoryRole,
  fixedRoles: readonly InventoryRole[],
): RawCoverage {
  const legacyKeys = [...new Set(customRole.permissionKeys)].sort();
  if (!customRole.isActive || customRole.scope === "relationship") {
    return {
      fixedRoles: [],
      accessTags: [],
      uncoveredPermissionKeys: legacyKeys,
    };
  }

  const legacySet = new Set(legacyKeys);
  const safeFixedRoleRecords = fixedRoles.filter(
    (role) =>
      role.isActive &&
      role.scope === customRole.scope &&
      role.tenantId === customRole.tenantId &&
      role.permissionKeys.length > 0 &&
      role.permissionKeys.every((key) => legacySet.has(key)),
  );
  const safeFixedRoles = safeFixedRoleRecords
    .map(({ id, name, permissionKeys }) => ({
      id,
      name,
      permissionKeys: [...new Set(permissionKeys)].sort(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

  const covered = new Set(
    safeFixedRoleRecords.flatMap((role) => role.permissionKeys),
  );
  const accessTags = allAccessTagKeys()
    .filter((tag) => isSafeTagCandidate(tag, customRole.scope, legacySet))
    .sort()
    .map((key) => ({ key, permissionKeys: accessTagPermissionKeys(key) }));
  for (const tag of accessTags) {
    for (const key of tag.permissionKeys) covered.add(key);
  }

  return {
    fixedRoles: safeFixedRoles,
    accessTags,
    uncoveredPermissionKeys: legacyKeys.filter((key) => !covered.has(key)),
  };
}

function isSafeTagCandidate(
  tag: AccessTagKey,
  scope: RoleScope,
  legacyKeys: ReadonlySet<string>,
): boolean {
  if (!isAccessTagAvailable(tag) || scope === "relationship") return false;
  const keys = accessTagPermissionKeys(tag);
  return (
    keys.length > 0 &&
    keys.every((key) => {
      const definition = CAPABILITY_DEFINITIONS[key];
      return (
        legacyKeys.has(key) &&
        definition?.delegable === true &&
        definition.featureToggle === undefined &&
        roleScopeAcceptsPermissionScope(scope, definition.scope)
      );
    })
  );
}
