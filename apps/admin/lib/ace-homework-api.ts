import {
  API_BASE_URL,
  apiFetch,
  buildAuthHeaders,
  isUsingMockApi,
} from "./api-client";

export type HomeworkStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "NEEDS_REVIEW"
  | "PUBLISHED"
  | "CANCELLED";
export interface HomeworkAssignment {
  id: string;
  title: string;
  instructions: string;
  academicYearId: string;
  yearBandId: string;
  subjectId: string;
  dueAt: string;
  status: HomeworkStatus;
  version: number;
  scheduledAt: string | null;
  scheduleFailureReason: string | null;
  publishedAt: string | null;
  cancelledAt: string | null;
}
export interface HomeworkOptions {
  academicYears: Array<{
    id: string;
    name: string;
    startsOn: string;
    endsOn: string;
  }>;
  yearBands: Array<{ id: string; name: string }>;
  subjects: Array<{ id: string; name: string }>;
  publicationEnabled: boolean;
}
export interface HomeworkDraft {
  title: string;
  instructions: string;
  academicYearId: string;
  yearBandId: string;
  subjectId: string;
  dueAt: string;
}

export class HomeworkRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "HomeworkRequestError";
  }
}

async function homeworkRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  if (isUsingMockApi())
    throw new Error("Homework assignments are unavailable in mock mode.");
  const response = await apiFetch(
    `${API_BASE_URL}/ace/homework/assignments${path}`,
    {
      method,
      headers: buildAuthHeaders(),
      credentials: "include",
      cache: "no-store",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal,
    },
  );
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "message" in payload &&
      typeof payload.message === "string"
        ? payload.message
        : `Homework request failed: ${response.status}`;
    throw new HomeworkRequestError(message, response.status);
  }
  return response.json() as Promise<T>;
}

export const fetchHomeworkAssignments = (signal?: AbortSignal) =>
  homeworkRequest<HomeworkAssignment[]>("", "GET", undefined, signal);
export const fetchHomeworkOptions = (signal?: AbortSignal) =>
  homeworkRequest<HomeworkOptions>("/options", "GET", undefined, signal);
export const createHomeworkAssignment = (draft: HomeworkDraft) =>
  homeworkRequest<HomeworkAssignment>("", "POST", draft);
export const updateHomeworkAssignment = (
  id: string,
  draft: HomeworkDraft,
  version: number,
) =>
  homeworkRequest<HomeworkAssignment>(`/${encodeURIComponent(id)}`, "PATCH", {
    ...draft,
    version,
  });
export const publishHomeworkAssignment = (id: string, version: number) =>
  homeworkRequest<HomeworkAssignment>(
    `/${encodeURIComponent(id)}/publish`,
    "POST",
    { version },
  );
export const scheduleHomeworkAssignment = (
  id: string,
  version: number,
  scheduledAt: string,
) =>
  homeworkRequest<HomeworkAssignment>(
    `/${encodeURIComponent(id)}/schedule`,
    "POST",
    { version, scheduledAt },
  );
export const cancelHomeworkAssignment = (
  id: string,
  version: number,
  reason: string,
) =>
  homeworkRequest<HomeworkAssignment>(
    `/${encodeURIComponent(id)}/cancel`,
    "POST",
    { version, reason },
  );
