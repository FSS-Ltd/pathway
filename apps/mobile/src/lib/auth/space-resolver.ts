import type { AppSpace, RolesResponse } from "@pathway/mobile-core";
import { hasFamilyAccess, hasServeAccess, inferSpaceAvailability } from "@pathway/mobile-core";

export type SpaceResolution = {
  primarySpace: AppSpace;
  availableSpaces: AppSpace[];
  isDualSpaceUser: boolean;
  hasFamilyAccess: boolean;
  hasServeAccess: boolean;
};

export function resolveSpaceFromRoles(
  roles: RolesResponse,
  preferredSpace?: AppSpace | null,
): SpaceResolution {
  const roleSnapshot = {
    orgRoles: roles.orgRoles.map((role) => role.role),
    siteRoles: roles.siteRoles.map((role) => role.role),
    hasFamilyAccess: roles.hasFamilyAccess,
    hasServeAccess: roles.hasServeAccess,
  };

  const availability = inferSpaceAvailability(roleSnapshot, preferredSpace);
  const canFamily = hasFamilyAccess(roleSnapshot);
  const canServe = hasServeAccess(roleSnapshot);

  return {
    primarySpace: availability.primarySpace,
    availableSpaces: availability.availableSpaces,
    isDualSpaceUser: availability.isDualSpaceUser,
    hasFamilyAccess: canFamily,
    hasServeAccess: canServe,
  };
}
