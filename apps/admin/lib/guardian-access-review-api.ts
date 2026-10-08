import {
  API_BASE_URL,
  apiFetch,
  buildAuthHeaders,
  isUsingMockApi,
} from "./api-client";
import { apiErrorFromResponse } from "./api-transport";

export type GuardianReviewBasis = "SCHOOL_RECORDS" | "LEGAL_DOCUMENT";

export type GuardianAccessReview = {
  parentId: string;
  hasVerifiedSignIn: boolean;
  parentPortalEnabled: boolean;
  children: {
    id: string;
    fullName: string;
    isGuest: boolean;
    hasFullAccess: boolean;
  }[];
};

function reviewUrl(parentId: string, childId?: string): string {
  const base = `${API_BASE_URL}/parents/${encodeURIComponent(parentId)}/guardian-access`;
  return childId ? `${base}/${encodeURIComponent(childId)}` : base;
}

export async function fetchGuardianAccessReview(
  parentId: string,
  signal?: AbortSignal,
): Promise<GuardianAccessReview> {
  if (isUsingMockApi()) {
    throw new Error("Guardian access review requires a live API.");
  }
  const response = await apiFetch(reviewUrl(parentId), {
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    throw await apiErrorFromResponse(
      response,
      "Unable to load guardian access.",
    );
  }
  return response.json() as Promise<GuardianAccessReview>;
}

export async function approveGuardianAccess(
  parentId: string,
  childId: string,
  reviewBasis: GuardianReviewBasis,
): Promise<void> {
  if (isUsingMockApi()) {
    throw new Error("Guardian access review requires a live API.");
  }
  const response = await apiFetch(reviewUrl(parentId, childId), {
    method: "POST",
    headers: buildAuthHeaders(),
    credentials: "include",
    body: JSON.stringify({ reviewBasis, confirmedLegalAccess: true }),
  });
  if (!response.ok) {
    throw await apiErrorFromResponse(
      response,
      "Unable to approve guardian access.",
    );
  }
}
