import { API_BASE_URL, buildAuthHeaders, isUsingMockApi } from "./api-client";

export type FamilyDailyAttendanceHistory = {
  siteId: string;
  childId: string;
  from: string;
  to: string;
  counts: { present: number; absent: number; late: number };
  items: Array<{
    date: string;
    status: "PRESENT" | "ABSENT" | "LATE";
    absenceReason:
      | "SICK"
      | "HOLIDAY"
      | "NOT_SCHEDULED"
      | "EXCUSED"
      | "UNEXCUSED"
      | null;
  }>;
};

export type FamilyAttendanceScope =
  | { kind: "student"; siteId: string }
  | { kind: "parent"; siteId: string; childId: string };

export async function fetchFamilyDailyAttendance(
  scope: FamilyAttendanceScope,
  dates: { from: string; to: string },
  signal?: AbortSignal,
): Promise<FamilyDailyAttendanceHistory> {
  if (isUsingMockApi()) {
    throw new Error("Family attendance is unavailable in mock mode.");
  }
  const site = encodeURIComponent(scope.siteId);
  const path =
    scope.kind === "student"
      ? `/ace/student/sites/${site}/attendance/daily`
      : `/ace/parent/sites/${site}/children/${encodeURIComponent(scope.childId)}/attendance/daily`;
  const params = new URLSearchParams(dates);
  const response = await fetch(`${API_BASE_URL}${path}?${params}`, {
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    if (response.status === 404 || response.status === 403) {
      throw new Error("Attendance is not available for this account.");
    }
    if (response.status === 400) {
      throw new Error("Choose valid dates up to today, within one year.");
    }
    throw new Error("Attendance could not be loaded. Please try again.");
  }
  return response.json() as Promise<FamilyDailyAttendanceHistory>;
}
