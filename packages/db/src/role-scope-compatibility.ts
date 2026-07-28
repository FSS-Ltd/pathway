export type RolePermissionScope =
  | "organisation"
  | "site"
  | "relationship"
  | "assignment";

export type CompatibleRoleScope = Exclude<RolePermissionScope, "assignment">;

const COMPATIBLE_PERMISSION_SCOPES: Readonly<
  Record<CompatibleRoleScope, ReadonlySet<RolePermissionScope>>
> = {
  organisation: new Set(["organisation", "site", "relationship", "assignment"]),
  site: new Set(["site", "relationship", "assignment"]),
  relationship: new Set(["relationship"]),
};

export function roleScopeAcceptsPermissionScope(
  roleScope: CompatibleRoleScope,
  permissionScope: RolePermissionScope,
): boolean {
  return COMPATIBLE_PERMISSION_SCOPES[roleScope].has(permissionScope);
}
