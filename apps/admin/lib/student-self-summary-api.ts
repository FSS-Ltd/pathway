import {
  API_BASE_URL,
  apiFetch,
  buildAuthHeaders,
  isUsingMockApi,
} from "./api-client";

export interface StudentSelfSummary {
  siteId: string;
  childName: string;
  asOf: string;
  sections: {
    attendance:
      | {
          status: "ready";
          data: {
            counts: { present: number; absent: number; late: number };
            items: Array<{
              date: string;
              status: "PRESENT" | "ABSENT" | "LATE";
            }>;
          };
        }
      | { status: "unavailable" }
      | { status: "error"; message: string };
    homework: { status: "ready" | "unavailable" };
    pace: { status: "unavailable" };
    faith: { status: "unavailable" };
    reports: { status: "unavailable" };
    slips: { status: "unavailable" };
    community: { status: "unavailable" };
  };
}

export async function fetchStudentSelfSummary(
  siteId: string,
  signal?: AbortSignal,
): Promise<StudentSelfSummary> {
  if (isUsingMockApi()) {
    throw new Error("Student overview is unavailable in mock mode.");
  }
  const response = await apiFetch(
    `${API_BASE_URL}/ace/student/sites/${encodeURIComponent(siteId)}/summary`,
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
        ? "Your school overview is no longer available to this account."
        : response.status === 401 || response.status === 403
          ? "Your student access could not be verified. Sign in again and retry."
          : "School overview could not be loaded. Please try again.",
    );
  }
  return response.json() as Promise<StudentSelfSummary>;
}
