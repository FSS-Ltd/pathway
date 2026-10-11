import { roleScopeAcceptsPermissionScope } from "@pathway/db";
import {
  ACCESS_TAG_DEFINITIONS,
  CAPABILITY_DEFINITIONS,
  type AccessTagKey,
} from "@pathway/platform";

export type BadgeCoverage = "full" | "partial" | "none";

export function badgeAllowedScopes(
  key: AccessTagKey,
): ("organisation" | "site")[] {
  const permissionKeys = ACCESS_TAG_DEFINITIONS[key].permissionKeys;
  return (["organisation", "site"] as const).filter(
    (scope) =>
      permissionKeys.length > 0 &&
      permissionKeys.every((permissionKey) =>
        roleScopeAcceptsPermissionScope(
          scope,
          CAPABILITY_DEFINITIONS[permissionKey].scope,
        ),
      ),
  );
}

export function badgeCoverage(
  badgePermissions: readonly string[],
  heldPermissions: readonly string[],
): BadgeCoverage {
  if (badgePermissions.length === 0) return "none";
  const held = new Set(heldPermissions);
  const matched = badgePermissions.filter((permission) =>
    held.has(permission),
  ).length;
  if (matched === 0) return "none";
  return matched === badgePermissions.length ? "full" : "partial";
}
