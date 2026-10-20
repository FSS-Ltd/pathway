import {
  API_BASE_URL,
  apiFetch,
  buildAuthHeaders,
  isUsingMockApi,
} from "./api-client";

export interface GuardianHomeworkItem {
  id: string;
  title: string;
  dueAt: string;
  status: "NOT_STARTED" | "DRAFT" | "SUBMITTED" | "RETURNED" | "COMPLETED";
  feedback: string | null;
  feedbackReleasedAt: string | null;
}

export async function fetchGuardianHomework(
  siteId: string,
  childId: string,
  signal?: AbortSignal,
): Promise<GuardianHomeworkItem[]> {
  if (isUsingMockApi())
    throw new Error("Homework is unavailable in mock mode.");
  let response: Response;
  try {
    response = await apiFetch(
      `${API_BASE_URL}/ace/family/sites/${encodeURIComponent(siteId)}/children/${encodeURIComponent(childId)}/homework`,
      {
        headers: buildAuthHeaders(),
        credentials: "include",
        cache: "no-store",
        signal,
      },
    );
  } catch {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    throw new Error("Connection lost. Check your connection and try again.");
  }
  if (!response.ok) {
    throw new Error(
      [401, 403, 404].includes(response.status)
        ? "Your homework access could not be verified. Return to your family overview and try again."
        : "Homework could not be loaded. Please try again.",
    );
  }
  return response.json() as Promise<GuardianHomeworkItem[]>;
}
