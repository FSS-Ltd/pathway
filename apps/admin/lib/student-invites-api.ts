import {
  API_BASE_URL,
  apiFetch,
  buildAuthHeaders,
  isUsingMockApi,
} from "./api-client";
import { apiErrorFromResponse } from "./api-transport";

export interface StudentInvite {
  id: string;
  email: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
}

export interface StudentAccess {
  active: {
    id: string;
    email: string | null;
    linkedAt: string;
  } | null;
}

export interface StudentInviteForRecipient {
  id: string;
  siteName: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  accessAvailable: boolean | null;
}

async function request<T>(
  path: string,
  fallback: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    body?: unknown;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  if (isUsingMockApi()) throw new Error("Student invitations require the API.");
  const response = await apiFetch(`${API_BASE_URL}/student-invites/${path}`, {
    method: options.method ?? "GET",
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });
  if (!response.ok) throw await apiErrorFromResponse(response, fallback);
  return response.json() as Promise<T>;
}

const childPath = (childId: string): string =>
  `children/${encodeURIComponent(childId)}`;

export function getStudentPortalPolicy(
  signal?: AbortSignal,
): Promise<{ enabled: boolean }> {
  return request("policy", "Unable to load student portal policy.", { signal });
}

export function setStudentPortalPolicy(
  enabled: boolean,
): Promise<{ enabled: boolean }> {
  return request("policy", "Unable to update student portal policy.", {
    method: "PUT",
    body: { enabled },
  });
}

export function listStudentInvites(
  childId: string,
  signal?: AbortSignal,
): Promise<StudentInvite[]> {
  return request(childPath(childId), "Unable to load student invitations.", {
    signal,
  });
}

export function getStudentAccess(
  childId: string,
  signal?: AbortSignal,
): Promise<StudentAccess> {
  return request(
    `${childPath(childId)}/access`,
    "Unable to load student access.",
    { signal },
  );
}

export function createStudentInvite(
  childId: string,
  email: string,
): Promise<StudentInvite> {
  return request(childPath(childId), "Unable to send student invitation.", {
    method: "POST",
    body: { email: email.trim(), confirmedSchoolApproval: true },
  });
}

export function updateStudentInvite(
  inviteId: string,
  action: "resend" | "revoke",
): Promise<StudentInvite | { id: string; revokedAt: string }> {
  return request(
    `${encodeURIComponent(inviteId)}/${action}`,
    `Unable to ${action} student invitation.`,
    {
      method: "POST",
      body: action === "resend" ? { confirmedSchoolApproval: true } : undefined,
    },
  );
}

export function revokeStudentAccess(
  childId: string,
  reason: string,
): Promise<void> {
  return request(
    `${childPath(childId)}/access`,
    "Unable to revoke student access.",
    {
      method: "DELETE",
      body: { reason: reason.trim() },
    },
  );
}

export function getStudentInviteForRecipient(
  siteId: string,
  inviteId: string,
): Promise<StudentInviteForRecipient> {
  return request(
    `sites/${encodeURIComponent(siteId)}/${encodeURIComponent(inviteId)}`,
    "Unable to load this invitation.",
  );
}

export function acceptStudentInvite(
  siteId: string,
  inviteId: string,
): Promise<void> {
  return request(
    `sites/${encodeURIComponent(siteId)}/${encodeURIComponent(inviteId)}/accept`,
    "Unable to accept this invitation.",
    { method: "POST" },
  );
}
