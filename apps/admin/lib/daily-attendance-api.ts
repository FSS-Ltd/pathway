import { API_BASE_URL, buildAuthHeaders, isUsingMockApi } from "./api-client";

export type DailyAttendanceStatus = "PRESENT" | "ABSENT" | "LATE";
export type DailyAbsenceReason =
  | "SICK"
  | "HOLIDAY"
  | "NOT_SCHEDULED"
  | "EXCUSED"
  | "UNEXCUSED";

export type DailyAttendanceRow = {
  childId: string;
  displayName: string;
  academicYear: string;
  band: { id: string; name: string };
  mark: {
    id: string;
    status: DailyAttendanceStatus;
    absenceReason: DailyAbsenceReason | null;
    recordedAt: string;
    recordedBy: string;
  } | null;
};

export type DailyAttendancePage = {
  date: string;
  timezone: string | null;
  teachingDate: { kind: string; reason: string | null } | null;
  permittedBands: Array<{ id: string; name: string }>;
  page: number;
  limit: number;
  total: number;
  nextPage: number | null;
  counts: { present: number; absent: number; late: number; unmarked: number };
  items: DailyAttendanceRow[];
};

export type DailyAttendanceMarkInput = {
  status: DailyAttendanceStatus;
  absenceReason?: DailyAbsenceReason;
  correctionReason?: string;
};

export type DailyAttendanceCorrection = {
  previousStatus: DailyAttendanceStatus;
  newStatus: DailyAttendanceStatus;
  previousReason: DailyAbsenceReason | null;
  newReason: DailyAbsenceReason | null;
  correctionReason: string;
  correctedAt: string;
  correctedBy: string;
};

export type DailyAttendanceHistoryPage = {
  items: DailyAttendanceCorrection[];
  nextCursor: string | null;
};

export async function fetchDailyAttendance(
  query: { date: string; bandId?: string; page?: number },
  signal?: AbortSignal,
): Promise<DailyAttendancePage> {
  if (isUsingMockApi()) {
    return {
      date: query.date,
      timezone: "Europe/London",
      teachingDate: null,
      permittedBands: [],
      page: query.page ?? 1,
      limit: 50,
      total: 0,
      nextPage: null,
      counts: { present: 0, absent: 0, late: 0, unmarked: 0 },
      items: [],
    };
  }
  const params = new URLSearchParams({
    date: query.date,
    page: String(query.page ?? 1),
    limit: "50",
  });
  if (query.bandId) params.set("bandId", query.bandId);
  const response = await fetch(`${API_BASE_URL}/attendance/daily?${params}`, {
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw await dailyAttendanceError(response);
  return response.json() as Promise<DailyAttendancePage>;
}

export async function saveDailyAttendanceMark(
  date: string,
  childId: string,
  input: DailyAttendanceMarkInput,
  signal?: AbortSignal,
): Promise<void> {
  if (isUsingMockApi()) {
    throw new Error("Daily attendance changes are unavailable in mock mode.");
  }
  const response = await fetch(
    `${API_BASE_URL}/attendance/daily/${encodeURIComponent(date)}/children/${encodeURIComponent(childId)}`,
    {
      method: "PUT",
      headers: buildAuthHeaders(),
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify(input),
      signal,
    },
  );
  if (!response.ok) throw await dailyAttendanceError(response);
}

export async function fetchDailyAttendanceHistory(
  factId: string,
  { cursor, signal }: { cursor?: string; signal?: AbortSignal } = {},
): Promise<DailyAttendanceHistoryPage> {
  if (isUsingMockApi()) return { items: [], nextCursor: null };
  const params = new URLSearchParams({ limit: "25" });
  if (cursor) params.set("cursor", cursor);
  const response = await fetch(
    `${API_BASE_URL}/attendance/daily/${encodeURIComponent(factId)}/history?${params}`,
    {
      headers: buildAuthHeaders(),
      credentials: "include",
      cache: "no-store",
      signal,
    },
  );
  if (!response.ok) throw await dailyAttendanceError(response);
  return response.json() as Promise<DailyAttendanceHistoryPage>;
}

async function dailyAttendanceError(response: Response): Promise<Error> {
  if (response.status === 403)
    return new Error("You cannot access this register.");
  if (response.status === 404)
    return new Error(
      "This register is unavailable for your current site or band.",
    );
  if (response.status === 409) {
    const body: unknown = await response.json().catch(() => null);
    if (
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof body.message === "string"
    ) {
      return new Error(body.message);
    }
  }
  return new Error("Daily attendance is unavailable. Please try again.");
}
