export type ActiveSite = {
  id: string;
  name: string;
  orgId: string;
  orgName: string | null;
  orgSlug?: string | null;
  timezone?: string | null;
  role?: string | null;
};

export type ActiveSiteState = {
  activeSiteId: string | null;
  sites: ActiveSite[];
};

export type AuthMe = {
  userId: string;
};

export type RolesResponse = {
  userId: string;
  superUser?: boolean;
  currentOrgIsMasterOrg?: boolean;
  hasFamilyAccess?: boolean;
  hasServeAccess?: boolean;
  orgRoles: Array<{ orgId: string; role: string }>;
  siteRoles: Array<{ tenantId: string; role: string }>;
  orgMemberships: Array<{ orgId: string; orgName: string; role: string }>;
  siteMemberships: Array<{
    tenantId: string;
    tenantName: string;
    orgId: string;
    role: string;
  }>;
};

export type MobileRoleSnapshot = {
  orgRoles: string[];
  siteRoles: string[];
  hasServeAccess?: boolean;
  hasFamilyAccess?: boolean;
};
