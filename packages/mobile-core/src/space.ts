import type { MobileRoleSnapshot } from "./api-types";

export type AppSpace = "family" | "serve";
export type SpaceAvailability = {
  primarySpace: AppSpace;
  availableSpaces: AppSpace[];
  isDualSpaceUser: boolean;
};

export function isServeSpace(space: AppSpace): boolean {
  return space === "serve";
}

export function isFamilySpace(space: AppSpace): boolean {
  return space === "family";
}

export function hasServeAccess(roles: MobileRoleSnapshot): boolean {
  if (roles.hasServeAccess) return true;

  const serveRoleSlugs = new Set([
    "SITE_ADMIN",
    "STAFF",
    "tenant:admin",
    "tenant:coordinator",
    "tenant:teacher",
    "tenant:staff",
    "org:admin",
    "org:owner",
    "org:support",
    "org:safeguarding_lead",
    "org:billing_manager",
  ]);

  return [...roles.siteRoles, ...roles.orgRoles].some((role) => serveRoleSlugs.has(role));
}

export function hasFamilyAccess(roles: MobileRoleSnapshot): boolean {
  if (roles.hasFamilyAccess) return true;

  const familyRoleSlugs = new Set(["VIEWER", "tenant:parent"]);
  return roles.siteRoles.some((role) => familyRoleSlugs.has(role));
}

export function inferSpaceAvailability(
  roles: MobileRoleSnapshot,
  preferredSpace?: AppSpace | null,
): SpaceAvailability {
  const canServe = hasServeAccess(roles);
  const canFamily = hasFamilyAccess(roles);

  const availableSpaces: AppSpace[] = [];
  if (canServe) availableSpaces.push("serve");
  if (canFamily) availableSpaces.push("family");

  if (availableSpaces.length === 0) {
    availableSpaces.push("family");
  }

  const primarySpace =
    preferredSpace && availableSpaces.includes(preferredSpace)
      ? preferredSpace
      : canServe
        ? "serve"
        : "family";

  return {
    primarySpace,
    availableSpaces,
    isDualSpaceUser: canServe && canFamily,
  };
}

export function inferSpaceFromRoles(
  roles: MobileRoleSnapshot,
  preferredSpace?: AppSpace | null,
): AppSpace {
  return inferSpaceAvailability(roles, preferredSpace).primarySpace;
}
