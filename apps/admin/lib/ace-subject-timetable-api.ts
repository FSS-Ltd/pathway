import {
  API_BASE_URL,
  apiFetch,
  buildAuthHeaders,
  isUsingMockApi,
} from "./api-client";

export type TimetableDay =
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY"
  | "SUNDAY";

export interface TimetableSlot {
  id: string;
  kind: "LESSON" | "BREAK";
  label: string;
  startMinutes: number;
  endMinutes: number;
  position: number;
}

export interface TimetableSchedule {
  id: string;
  updatedAt: string;
  teachingDays: TimetableDay[];
  slots: TimetableSlot[];
}

export interface HeadTimetableSetup {
  academicYears: Array<{
    id: string;
    name: string;
    periods: Array<{
      id: string;
      name: string;
      startsOn: string;
      endsOn: string;
    }>;
  }>;
  yearBands: Array<{ id: string; name: string }>;
}

export interface HeadTimetableScheduleResponse {
  period: { id: string; name: string; startsOn: string; endsOn: string };
  yearBand: { id: string; name: string };
  schedule: TimetableSchedule | null;
}

export interface HeadTimetableRoster {
  items: Array<{
    id: string;
    firstName: string;
    lastName: string;
    status: "NOT_STARTED" | "DRAFT" | "PUBLISHED";
    draftVersion: number | null;
    publicationId: string | null;
    publishedAt: string | null;
  }>;
  nextCursor: string | null;
}

export interface HeadTimetableDraft {
  schedule: TimetableSchedule | null;
  draft: {
    id: string;
    version: number;
    entries: Array<{ day: TimetableDay; slotId: string; subjectId: string }>;
  } | null;
  publications: Array<{
    id: string;
    publishedAt: string;
    withdrawnAt: string | null;
  }>;
  eligibleSubjects: Array<{ id: string; name: string; color: string | null }>;
}

export class HeadTimetableRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "HeadTimetableRequestError";
  }
}

const BASE = `${API_BASE_URL}/ace/subject-timetable`;

async function timetableRequest<T>(
  path: string,
  options: {
    method?: "GET" | "PUT" | "POST";
    body?: unknown;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  if (isUsingMockApi()) {
    throw new Error("Subject timetable is unavailable in mock mode.");
  }
  const response = await apiFetch(`${BASE}${path}`, {
    method: options.method ?? "GET",
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
    ...(options.body !== undefined
      ? { body: JSON.stringify(options.body) }
      : {}),
    signal: options.signal,
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message =
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof body.message === "string"
        ? body.message
        : `Subject timetable request failed: ${response.status}`;
    throw new HeadTimetableRequestError(message, response.status);
  }
  return response.json() as Promise<T>;
}

function bandPath(periodId: string, yearBandId: string): string {
  return `/periods/${encodeURIComponent(periodId)}/year-bands/${encodeURIComponent(yearBandId)}`;
}

function childPath(
  periodId: string,
  yearBandId: string,
  childId: string,
): string {
  return `${bandPath(periodId, yearBandId)}/children/${encodeURIComponent(childId)}`;
}

export function fetchHeadTimetableSetup(
  signal?: AbortSignal,
): Promise<HeadTimetableSetup> {
  return timetableRequest("/setup", { signal });
}

export function fetchHeadTimetableSchedule(
  periodId: string,
  yearBandId: string,
  signal?: AbortSignal,
): Promise<HeadTimetableScheduleResponse> {
  return timetableRequest(`${bandPath(periodId, yearBandId)}/schedule`, {
    signal,
  });
}

export function saveHeadTimetableSchedule(
  periodId: string,
  yearBandId: string,
  input: {
    expectedUpdatedAt: string | null;
    teachingDays: TimetableDay[];
    slots: Array<{
      id?: string;
      kind: TimetableSlot["kind"];
      label: string;
      startMinutes: number;
      endMinutes: number;
    }>;
    reason: string;
  },
): Promise<TimetableSchedule> {
  return timetableRequest(`${bandPath(periodId, yearBandId)}/schedule`, {
    method: "PUT",
    body: input,
  });
}

export function fetchHeadTimetableRoster(
  periodId: string,
  yearBandId: string,
  cursor?: string,
  signal?: AbortSignal,
): Promise<HeadTimetableRoster> {
  const query = new URLSearchParams({
    limit: "25",
    ...(cursor ? { cursor } : {}),
  });
  return timetableRequest(`${bandPath(periodId, yearBandId)}/roster?${query}`, {
    signal,
  });
}

export function fetchHeadTimetableDraft(
  periodId: string,
  yearBandId: string,
  childId: string,
  signal?: AbortSignal,
): Promise<HeadTimetableDraft> {
  return timetableRequest(`${childPath(periodId, yearBandId, childId)}/draft`, {
    signal,
  });
}

export function saveHeadTimetableDraft(
  periodId: string,
  yearBandId: string,
  childId: string,
  input: {
    scheduleId: string;
    scheduleUpdatedAt: string;
    expectedVersion: number;
    entries: Array<{ day: TimetableDay; slotId: string; subjectId: string }>;
    reason: string;
  },
): Promise<NonNullable<HeadTimetableDraft["draft"]>> {
  return timetableRequest(`${childPath(periodId, yearBandId, childId)}/draft`, {
    method: "PUT",
    body: input,
  });
}

export function publishHeadTimetable(
  periodId: string,
  yearBandId: string,
  childId: string,
  input: {
    expectedVersion: number;
    scheduleUpdatedAt: string;
    acknowledgeUnassigned: boolean;
    reason: string;
  },
): Promise<{
  publication: { id: string; publishedAt: string };
  unassignedLessonCount: number;
}> {
  return timetableRequest(
    `${childPath(periodId, yearBandId, childId)}/publish`,
    {
      method: "POST",
      body: input,
    },
  );
}

export function withdrawHeadTimetable(
  periodId: string,
  childId: string,
  input: { publicationId: string; reason: string },
): Promise<{ withdrawnAt: string }> {
  return timetableRequest(
    `/periods/${encodeURIComponent(periodId)}/children/${encodeURIComponent(childId)}/withdraw`,
    { method: "POST", body: input },
  );
}
