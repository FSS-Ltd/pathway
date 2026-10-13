import {
  API_BASE_URL,
  apiFetch,
  buildAuthHeaders,
  isUsingMockApi,
} from "./api-client";
import type { StudentOverviewResponse } from "./child-overview-api";

type SectionResult<T> =
  | { status: "ready"; data: T }
  | { status: "unavailable" }
  | { status: "error"; message: string };

export interface FamilySummary {
  siteId: string;
  childId: string;
  childName: string;
  asOf: string;
  sections: {
    attendance: SectionResult<{
      counts: { present: number; absent: number; late: number };
      items: Array<{
        date: string;
        status: "PRESENT" | "ABSENT" | "LATE";
      }>;
    }>;
    notices: SectionResult<{
      items: Array<{ id: string; title: string }>;
    }>;
    messages: SectionResult<{ unreadCount: number }>;
    homework: { status: "unavailable" };
    reports: { status: "unavailable" };
    slips: { status: "unavailable" };
    faith: { status: "unavailable" };
    finance: { status: "unavailable" };
  };
}

export async function fetchFamilySummary(
  siteId: string,
  childId: string,
  signal?: AbortSignal,
): Promise<FamilySummary> {
  if (isUsingMockApi()) {
    throw new Error("Family summary is unavailable in mock mode.");
  }
  const response = await apiFetch(
    `${API_BASE_URL}/ace/family/sites/${encodeURIComponent(siteId)}/children/${encodeURIComponent(childId)}/summary`,
    {
      headers: buildAuthHeaders(),
      credentials: "include",
      cache: "no-store",
      signal,
    },
  );
  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? "This child’s school summary is no longer available to your account."
        : response.status === 401 || response.status === 403
          ? "Your family access could not be verified. Sign in again and retry."
          : "Family summary could not be loaded. Please try again.",
    );
  }
  return response.json() as Promise<FamilySummary>;
}

export async function fetchFamilyChildOverview(
  siteId: string,
  childId: string,
  signal?: AbortSignal,
): Promise<StudentOverviewResponse> {
  if (isUsingMockApi()) {
    throw new Error("Family overview is unavailable in mock mode.");
  }
  const response = await apiFetch(
    `${API_BASE_URL}/family/sites/${encodeURIComponent(siteId)}/children/${encodeURIComponent(childId)}/overview`,
    {
      headers: buildAuthHeaders(),
      credentials: "include",
      cache: "no-store",
      signal,
    },
  );
  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? "This child’s overview is no longer available to your account."
        : response.status === 401 || response.status === 403
          ? "Your family access could not be verified. Sign in again and retry."
          : "Family overview could not be loaded. Please try again.",
    );
  }
  return response.json() as Promise<StudentOverviewResponse>;
}
