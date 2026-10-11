import {
  API_BASE_URL,
  apiFetch,
  buildAuthHeaders,
  isUsingMockApi,
} from "./api-client";

export type ChildAttendanceEntry = {
  id: string;
  status: "PRESENT" | "ABSENT" | "LATE";
  timestamp: string;
  sessionTitle: string | null;
};

export type ChildAttendancePage = {
  items: ChildAttendanceEntry[];
  nextCursor: string | null;
};

export async function fetchChildAttendance(
  childId: string,
  cursor?: string,
): Promise<ChildAttendancePage> {
  if (isUsingMockApi()) return { items: [], nextCursor: null };
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  const query = params.size ? `?${params}` : "";
  const response = await apiFetch(
    `${API_BASE_URL}/attendance/child/${encodeURIComponent(childId)}${query}`,
    {
      headers: buildAuthHeaders(),
      credentials: "include",
      cache: "no-store",
    },
  );
  if (response.status === 403)
    throw new Error("You cannot view this attendance record.");
  if (response.status === 404) throw new Error("This profile is unavailable.");
  if (!response.ok)
    throw new Error("Unable to load attendance. Please try again.");
  return response.json() as Promise<ChildAttendancePage>;
}
