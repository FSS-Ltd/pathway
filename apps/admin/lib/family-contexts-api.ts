import { API_BASE_URL, buildAuthHeaders, isUsingMockApi } from "./api-client";

export type FamilyContext = {
  kind: "parent" | "student";
  siteId: string;
  siteName: string;
  childId: string;
  childName: string;
};

export async function fetchFamilyContexts(
  signal?: AbortSignal,
): Promise<FamilyContext[]> {
  if (isUsingMockApi()) {
    throw new Error("Family access is unavailable in mock mode.");
  }
  const response = await fetch(`${API_BASE_URL}/ace/family/contexts`, {
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    throw new Error(
      response.status === 401 || response.status === 403
        ? "Your family access could not be verified. Sign in again and retry."
        : "Family access could not be loaded. Please try again.",
    );
  }
  const data = (await response.json()) as { items: FamilyContext[] };
  return data.items;
}
