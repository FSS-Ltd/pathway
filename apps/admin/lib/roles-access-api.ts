import {
  ACCESS_TAG_DEFINITIONS,
  type AccessTagKey,
} from "@pathway/platform/access-tags";
import { notifyAccessChanged } from "./access-change-events";
import { API_BASE_URL, apiFetch } from "./api-client";
import { apiErrorFromResponse } from "./api-transport";

export type AccessPerson = {
  id: string;
  name: string | null;
  displayName: string | null;
  email: string;
  isActive: boolean;
  superUser: boolean;
  hasFamilyAccess: boolean;
  orgRole: string;
  roleDefinitionIds: string[];
};

export type BadgeScope = "organisation" | "site";
export type BadgeCoverage = "full" | "partial" | "none";
export type BadgeState = "enabled" | "excluded" | "inherit";

export type MatrixRole = {
  id: string;
  name: string;
  description: string | null;
  scope: BadgeScope;
  tenantId: string | null;
  permissionKeys: string[];
};

export type MatrixBadge = {
  key: AccessTagKey;
  label: string;
  description: string;
  available: boolean;
  permissionKeys: string[];
  allowedScopes: BadgeScope[];
  roleCoverage: Array<{ roleId: string; coverage: BadgeCoverage }>;
};

export type BadgeMatrix = { roles: MatrixRole[]; badges: MatrixBadge[] };

export type PersonBadge = MatrixBadge & {
  editableScopes: BadgeScope[];
  selected: boolean;
  effectiveCoverage: BadgeCoverage;
  sourceRoleIds: string[];
  directGrants: Array<{
    id: string;
    tenantId: string | null;
    expiresAt: string | null;
  }>;
  exclusions: Array<{ id: string; tenantId: string | null }>;
  blockingTags: AccessTagKey[];
  revisions: { organisation: string; site: string | null };
  revision: string;
};

export type PersonAccess = Omit<BadgeMatrix, "badges"> & {
  user: {
    id: string;
    name: string | null;
    displayName: string | null;
    email: string;
    isActive: boolean;
    superUser: boolean;
  };
  superUserExempt: boolean;
  canAdministerBadges: boolean;
  targetInSelectedSite: boolean;
  assignments: Array<{
    id: string;
    roleDefinitionId: string;
    tenantId: string | null;
    startsAt: string;
    expiresAt: string | null;
  }>;
  effectivePermissions: Array<{
    permissionKey: string;
    sourceRoleIds: string[];
    sourceTagGrantIds: string[];
    sourceSuperUser?: true;
  }>;
  badges: PersonBadge[];
};

export class BadgeMutationError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly blockingTags: AccessTagKey[] = [],
  ) {
    super(message);
    this.name = "BadgeMutationError";
  }
}

async function read<T>(path: string, fallback: string): Promise<T> {
  const response = await apiFetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) throw await apiErrorFromResponse(response, fallback);
  return response.json() as Promise<T>;
}

export function fetchAccessDirectory(params: {
  cursor?: string;
  limit: number;
  search?: string;
  roleDefinitionId?: string;
}): Promise<{ items: AccessPerson[]; nextCursor: string | null }> {
  const query = new URLSearchParams({ limit: String(params.limit) });
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.search) query.set("search", params.search);
  if (params.roleDefinitionId)
    query.set("roleDefinitionId", params.roleDefinitionId);
  return read(`/access/users?${query}`, "Unable to load people.");
}

export function fetchBadgeMatrix(): Promise<BadgeMatrix> {
  return read("/access/tags/matrix", "Unable to load badge matrix.");
}

export function fetchPersonAccess(userId: string): Promise<PersonAccess> {
  return read(
    `/access/tags/users/${encodeURIComponent(userId)}/matrix`,
    "Unable to load this person's access.",
  );
}

export async function setPersonBadgeState(input: {
  userId: string;
  tagKey: AccessTagKey;
  scope: BadgeScope;
  state: BadgeState;
  expectedRevision: string;
  requestId: string;
}): Promise<{ state: BadgeState; revision: string }> {
  const response = await apiFetch(
    `${API_BASE_URL}/access/tags/users/${encodeURIComponent(input.userId)}/${encodeURIComponent(input.tagKey)}`,
    {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "x-request-id": input.requestId,
      },
      body: JSON.stringify({
        scope: input.scope,
        state: input.state,
        expectedRevision: input.expectedRevision,
      }),
    },
  );
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const body = payload && typeof payload === "object" ? payload : null;
    const message =
      body && "message" in body && typeof body.message === "string"
        ? body.message
        : "Unable to update this badge.";
    const code =
      body && "code" in body && typeof body.code === "string"
        ? body.code
        : undefined;
    const details =
      body &&
      "details" in body &&
      body.details &&
      typeof body.details === "object"
        ? body.details
        : null;
    const blockingTags =
      details &&
      "blockingTags" in details &&
      Array.isArray(details.blockingTags)
        ? details.blockingTags.filter(
            (tag): tag is AccessTagKey =>
              typeof tag === "string" &&
              Object.prototype.hasOwnProperty.call(ACCESS_TAG_DEFINITIONS, tag),
          )
        : [];
    throw new BadgeMutationError(message, code, blockingTags);
  }
  notifyAccessChanged();
  return response.json() as Promise<{ state: BadgeState; revision: string }>;
}
