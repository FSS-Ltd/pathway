import type { EffectivePermissionWithSources } from "./effective-permissions.service";

export interface AccessParity {
  before: readonly string[];
  after: readonly string[];
  gained: readonly string[];
  lost: readonly string[];
}

/** Project the effect of retiring every custom role held by one user at one scope. */
export function assessCustomAssignmentParity(
  current: readonly EffectivePermissionWithSources[],
  customRoleIds: ReadonlySet<string>,
  replacementKeys: readonly string[],
): AccessParity {
  const before = [
    ...new Set(current.map(({ permissionKey }) => permissionKey)),
  ].sort();
  const retained = current
    .filter(
      ({ sourceRoleIds, sourceTagGrantIds }) =>
        sourceRoleIds.some((id) => !customRoleIds.has(id)) ||
        (sourceTagGrantIds?.length ?? 0) > 0,
    )
    .map(({ permissionKey }) => permissionKey);
  const after = [...new Set([...retained, ...replacementKeys])].sort();
  const beforeSet = new Set<string>(before);
  const afterSet = new Set(after);
  return {
    before,
    after,
    gained: after.filter((key) => !beforeSet.has(key)),
    lost: before.filter((key) => !afterSet.has(key)),
  };
}
