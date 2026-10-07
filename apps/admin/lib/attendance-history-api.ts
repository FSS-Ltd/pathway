import { API_BASE_URL, buildAuthHeaders, isUsingMockApi } from "./api-client";

export type AttendanceCorrection = {
  previousStatus: "PRESENT" | "ABSENT" | "LATE" | null;
  newStatus: "PRESENT" | "ABSENT" | "LATE";
  reason: string;
  correctedAt: string;
  correctedBy: string;
  recoveredLegacy: boolean;
};

export type AttendanceHistoryPage = {
  items: AttendanceCorrection[];
  nextCursor: string | null;
};

export async function fetchAttendanceHistory(
  attendanceId: string,
  { cursor, signal }: { cursor?: string; signal?: AbortSignal } = {},
): Promise<AttendanceHistoryPage> {
  if (isUsingMockApi()) return { items: [], nextCursor: null };

  const params = new URLSearchParams({ limit: "25" });
  if (cursor) params.set("cursor", cursor);
  const response = await fetch(
    `${API_BASE_URL}/attendance/${encodeURIComponent(attendanceId)}/history?${params}`,
    {
      headers: buildAuthHeaders(),
      credentials: "include",
      cache: "no-store",
      signal,
    },
  );
  if (!response.ok) {
    throw new Error("Unable to load attendance correction history.");
  }
  return response.json() as Promise<AttendanceHistoryPage>;
}
