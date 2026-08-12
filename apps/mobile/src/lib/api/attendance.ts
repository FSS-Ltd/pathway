import { apiClient, ApiError } from "@/lib/api/client";

export type AttendanceSessionProgress =
  | "not_started"
  | "in_progress"
  | "complete";
export type SessionTimingStatus = "upcoming" | "live" | "completed";
export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE";

type AttendanceSessionSummaryResponse = {
  sessionId: string;
  title: string | null;
  startsAt: string;
  endsAt: string;
  groupIds: string[];
  ageGroupLabel: string | null;
  markedCount: number;
  totalChildCount: number;
  status: AttendanceSessionProgress;
};

export type AttendanceSessionSummary = AttendanceSessionSummaryResponse & {
  timingStatus: SessionTimingStatus;
};

export type AttendanceSessionDetailResponse = {
  session: {
    id: string;
    title: string | null;
    startsAt: string;
    endsAt: string;
    groupIds: string[];
    ageGroupLabel: string | null;
  };
  children: Array<{ id: string; displayName: string }>;
  rows: Array<{
    id?: string;
    childId: string;
    present: boolean | null;
    status?: AttendanceStatus | null;
    timestamp?: string;
  }>;
};

export type AttendanceRegisterStatus =
  | "present"
  | "absent"
  | "late"
  | "unknown";

export type AttendanceSessionDetail = AttendanceSessionDetailResponse & {
  childStatusRows: Array<{
    attendanceId: string | null;
    childId: string;
    childName: string;
    status: AttendanceRegisterStatus;
  }>;
  summary: {
    present: number;
    absent: number;
    late: number;
    unknown: number;
  };
  progressStatus: "not_started" | "in_progress" | "completed";
  timingStatus: SessionTimingStatus;
};

export type SaveAttendanceRow = {
  childId: string;
  status: AttendanceStatus;
  correctionReason?: string;
};

export type AttendanceSaveOutcome = "rejected" | "unknown";

export class AttendanceSaveError extends Error {
  constructor(
    readonly outcome: AttendanceSaveOutcome,
    readonly status: number | null,
  ) {
    super(
      outcome === "rejected"
        ? "The server rejected the attendance update."
        : "The attendance save outcome is unknown.",
    );
    this.name = "AttendanceSaveError";
  }
}

function mapRegisterStatus(
  row: AttendanceSessionDetailResponse["rows"][number] | undefined,
): AttendanceRegisterStatus {
  if (row?.status === "PRESENT") return "present";
  if (row?.status === "ABSENT") return "absent";
  if (row?.status === "LATE") return "late";
  if (row?.present === true) return "present";
  if (row?.present === false) return "absent";
  return "unknown";
}

export function mapTimingStatus(
  startsAt: string,
  endsAt: string,
): SessionTimingStatus {
  const now = Date.now();
  const startMs = new Date(startsAt).getTime();
  const endMs = new Date(endsAt).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return "upcoming";
  if (now < startMs) return "upcoming";
  if (now <= endMs) return "live";
  return "completed";
}

function toIsoDateRange(daysAhead: number) {
  const from = new Date();
  from.setHours(0, 0, 0, 0);

  const to = new Date(from);
  to.setDate(to.getDate() + daysAhead);
  to.setHours(23, 59, 59, 999);

  return { from: from.toISOString(), to: to.toISOString() };
}

export async function fetchAttendanceSessionSummaries(params?: {
  fromIso?: string;
  toIso?: string;
  daysAhead?: number;
}): Promise<AttendanceSessionSummary[]> {
  const range =
    params?.fromIso && params?.toIso
      ? { from: params.fromIso, to: params.toIso }
      : toIsoDateRange(params?.daysAhead ?? 7);

  const query = new URLSearchParams({
    from: range.from,
    to: range.to,
  });

  const response = await apiClient.request<AttendanceSessionSummaryResponse[]>(
    `/attendance/session-summaries?${query.toString()}`,
    { method: "GET" },
  );

  return response.map((item) => ({
    ...item,
    timingStatus: mapTimingStatus(item.startsAt, item.endsAt),
  }));
}

export async function fetchAttendanceSessionDetail(
  sessionId: string,
): Promise<AttendanceSessionDetail> {
  const response = await apiClient.request<AttendanceSessionDetailResponse>(
    `/attendance/session/${encodeURIComponent(sessionId)}`,
    { method: "GET" },
  );

  return mapAttendanceSessionDetail(response);
}

export async function saveAttendanceSession(
  sessionId: string,
  rows: SaveAttendanceRow[],
): Promise<AttendanceSessionDetail> {
  let response: AttendanceSessionDetailResponse;
  try {
    response = await apiClient.request<AttendanceSessionDetailResponse>(
      `/attendance/session/${encodeURIComponent(sessionId)}`,
      {
        method: "PUT",
        body: JSON.stringify({
          rows: rows.map((row) => ({
            childId: row.childId,
            status: row.status,
            ...(row.correctionReason === undefined
              ? {}
              : { correctionReason: row.correctionReason.trim() }),
          })),
        }),
      },
    );
  } catch (cause) {
    if (
      cause instanceof ApiError &&
      cause.status >= 400 &&
      cause.status < 500
    ) {
      throw new AttendanceSaveError("rejected", cause.status);
    }
    throw new AttendanceSaveError(
      "unknown",
      cause instanceof ApiError ? cause.status : null,
    );
  }

  return mapAttendanceSessionDetail(response);
}

function mapAttendanceSessionDetail(
  response: AttendanceSessionDetailResponse,
): AttendanceSessionDetail {
  const rowByChild = new Map(response.rows.map((row) => [row.childId, row]));
  const childStatusRows = response.children.map((child) => {
    const attendanceRow = rowByChild.get(child.id);
    return {
      attendanceId: attendanceRow?.id ?? null,
      childId: child.id,
      childName: child.displayName,
      status: mapRegisterStatus(attendanceRow),
    };
  });

  const summary = childStatusRows.reduce(
    (acc, row) => {
      acc[row.status] += 1;
      return acc;
    },
    { present: 0, absent: 0, late: 0, unknown: 0 },
  );

  const total = childStatusRows.length;
  const marked = summary.present + summary.absent + summary.late;
  const progressStatus: AttendanceSessionDetail["progressStatus"] =
    total > 0 && marked >= total
      ? "completed"
      : marked > 0
        ? "in_progress"
        : "not_started";

  return {
    ...response,
    childStatusRows,
    summary,
    progressStatus,
    timingStatus: mapTimingStatus(
      response.session.startsAt,
      response.session.endsAt,
    ),
  };
}
