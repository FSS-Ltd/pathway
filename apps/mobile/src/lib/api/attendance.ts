import { apiClient } from "@/lib/api/client";

export type AttendanceSessionProgress = "not_started" | "in_progress" | "complete";
export type SessionTimingStatus = "upcoming" | "live" | "completed";

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

type AttendanceSessionDetailResponse = {
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
    timestamp?: string;
  }>;
};

export type AttendanceRegisterStatus = "present" | "absent" | "unknown";

export type AttendanceSessionDetail = AttendanceSessionDetailResponse & {
  childStatusRows: Array<{
    childId: string;
    childName: string;
    status: AttendanceRegisterStatus;
  }>;
  summary: {
    present: number;
    absent: number;
    unknown: number;
  };
  progressStatus: "not_started" | "in_progress" | "completed";
  timingStatus: SessionTimingStatus;
};

function mapRegisterStatus(present: boolean | null): AttendanceRegisterStatus {
  if (present === true) return "present";
  if (present === false) return "absent";
  return "unknown";
}

export function mapTimingStatus(startsAt: string, endsAt: string): SessionTimingStatus {
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
  const range = params?.fromIso && params?.toIso
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

  const presentByChild = new Map(response.rows.map((row) => [row.childId, row.present]));
  const childStatusRows = response.children.map((child) => {
    const status = mapRegisterStatus(presentByChild.get(child.id) ?? null);
    return {
      childId: child.id,
      childName: child.displayName,
      status,
    };
  });

  const summary = childStatusRows.reduce(
    (acc, row) => {
      acc[row.status] += 1;
      return acc;
    },
    { present: 0, absent: 0, unknown: 0 },
  );

  const total = childStatusRows.length;
  const marked = summary.present + summary.absent;
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
    timingStatus: mapTimingStatus(response.session.startsAt, response.session.endsAt),
  };
}
