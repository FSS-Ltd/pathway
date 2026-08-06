import { apiClient } from "./http";

export type OrgRole = "ORG_ADMIN" | "ORG_BILLING" | "ORG_MEMBER";

// Matches OrgPersonRow returned by apps/api/src/orgs/org-people.service.ts's
// listPeople (GET /orgs/:orgId/people).
export type OrgPersonRow = {
  id: string;
  name: string;
  displayName: string | null;
  email: string;
  orgRole: OrgRole;
  siteAccessSummary: { allSites: boolean; siteCount: number };
};

export type InviteStatus = "pending" | "used" | "expired" | "revoked";

// Matches InviteSummary returned by apps/api/src/invites/invites.service.ts's
// toSummary() - note there is no `name` field on the response even though
// CreateInviteDto accepts one, so pending-invite rows can only show email.
export type InviteRow = {
  id: string;
  email: string;
  orgRole: OrgRole | null;
  siteAccessMode: "ALL_SITES" | "SELECT_SITES" | null;
  siteCount: number;
  siteRole: string | null;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  lastSentAt: string | null;
  status: InviteStatus;
};

export type InviteAdultInput = { email: string; name?: string };

// GET /orgs/:orgId/people and the invites endpoints all take orgId as a URL
// path param (not @CurrentOrg like most other domain modules in this app -
// see http.ts's `orgId` field for why). Bootstrap sets it once at sign-in.
function currentOrgId(): string {
  const orgId = apiClient.getOrgId();
  if (!orgId) {
    throw new Error("No active organisation found for this session");
  }
  return orgId;
}

export function listOrgPeople() {
  return apiClient.request<OrgPersonRow[]>(`/orgs/${currentOrgId()}/people`);
}

export function listPendingInvites() {
  return apiClient.request<InviteRow[]>(`/orgs/${currentOrgId()}/invites?status=pending`);
}

// ponytail: invites always grant ORG_MEMBER. The wireframe's "Contributor ·
// selected learning logs only" implies a data-scoped role (specific
// LearningLog/Child access) that no model in this codebase supports yet -
// OrgRoleDefinition/PermissionDefinition covers general org-role
// permissions but not row-level scoping. Add a role picker here once a
// scoped-role data model exists; that's a schema change, not a UI change.
export function inviteAdult(input: InviteAdultInput) {
  return apiClient.request<InviteRow>(`/orgs/${currentOrgId()}/invites`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function resendInvite(inviteId: string) {
  return apiClient.request<InviteRow>(`/orgs/${currentOrgId()}/invites/${inviteId}/resend`, {
    method: "POST",
  });
}

export function revokeInvite(inviteId: string) {
  return apiClient.request<InviteRow>(`/orgs/${currentOrgId()}/invites/${inviteId}/revoke`, {
    method: "POST",
  });
}

export function removePersonAccess(userId: string) {
  return apiClient.request<void>(`/orgs/${currentOrgId()}/people/${userId}`, { method: "DELETE" });
}
