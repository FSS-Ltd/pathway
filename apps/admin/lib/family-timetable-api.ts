import {
  API_BASE_URL,
  apiFetch,
  buildAuthHeaders,
  isUsingMockApi,
} from "./api-client";

export type FamilyTimetableScope =
  | { kind: "parent"; siteId: string; childId: string }
  | { kind: "student"; siteId: string };

export interface FamilyTimetable {
  siteId: string;
  childId: string;
  childName: string;
  timezone: string | null;
  from: string;
  to: string;
  items: Array<{
    id: string;
    title: string | null;
    startsAt: string;
    endsAt: string;
  }>;
}

export async function fetchFamilyTimetable(
  scope: FamilyTimetableScope,
  from: Date,
  to: Date,
  signal?: AbortSignal,
): Promise<FamilyTimetable> {
  if (isUsingMockApi()) {
    throw new Error("Family timetable is unavailable in mock mode.");
  }
  const site = encodeURIComponent(scope.siteId);
  const path =
    scope.kind === "student"
      ? `/ace/student/sites/${site}/timetable`
      : `/ace/parent/sites/${site}/children/${encodeURIComponent(scope.childId)}/timetable`;
  const query = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
  });
  const response = await apiFetch(`${API_BASE_URL}${path}?${query}`, {
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    throw new Error(
      response.status === 404 || response.status === 403
        ? "Timetable is not available for this account."
        : "Timetable could not be loaded. Please try again.",
    );
  }
  return response.json() as Promise<FamilyTimetable>;
}

export async function setSessionFamilyPublication(
  sessionId: string,
  publish: boolean,
): Promise<string | null> {
  if (isUsingMockApi()) {
    throw new Error("Family publication is unavailable in mock mode.");
  }
  const response = await apiFetch(
    `${API_BASE_URL}/sessions/${encodeURIComponent(sessionId)}/family-publication`,
    {
      method: publish ? "POST" : "DELETE",
      headers: buildAuthHeaders(),
      credentials: "include",
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error(
      response.status === 403
        ? "You do not have access to publish this session."
        : response.status === 400
          ? "Assign a group before publishing this session."
          : "Publication could not be updated. Please try again.",
    );
  }
  const result = (await response.json()) as {
    familyPublishedAt: string | null;
  };
  return result.familyPublishedAt;
}
