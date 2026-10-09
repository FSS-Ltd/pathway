import {
  API_BASE_URL,
  apiFetch,
  buildAuthHeaders,
  isUsingMockApi,
} from "./api-client";
import type { FamilyTimetableScope } from "./family-timetable-api";

export interface FamilySubjectTimetablePeriod {
  periodId: string;
  publicationId: string;
  periodName: string;
  periodStartsOn: string;
  periodEndsOn: string;
  publishedAt: string;
}

export interface FamilySubjectTimetableList {
  siteId: string;
  childId: string;
  childName: string;
  items: FamilySubjectTimetablePeriod[];
}

export interface FamilySubjectTimetable extends FamilySubjectTimetablePeriod {
  siteId: string;
  childId: string;
  childName: string;
  timezone: string | null;
  yearBandName: string;
  entries: Array<{
    day: string;
    slotPosition: number;
    slotKind: "LESSON" | "BREAK";
    slotLabel: string;
    startMinutes: number;
    endMinutes: number;
    subjectName: string | null;
    subjectColor: string | null;
  }>;
}

function familySubjectPath(scope: FamilyTimetableScope): string {
  const site = encodeURIComponent(scope.siteId);
  return scope.kind === "student"
    ? `/ace/student/sites/${site}/subject-timetable`
    : `/ace/parent/sites/${site}/children/${encodeURIComponent(scope.childId)}/subject-timetable`;
}

async function readFamilySubjectTimetable<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  if (isUsingMockApi()) {
    throw new Error("Subject timetable is unavailable in mock mode.");
  }
  const response = await apiFetch(`${API_BASE_URL}${path}`, {
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    throw new Error(
      response.status === 404 || response.status === 403
        ? "Subject timetable is not available for this account."
        : "Subject timetable could not be loaded. Please try again.",
    );
  }
  return response.json() as Promise<T>;
}

export function fetchFamilySubjectTimetablePeriods(
  scope: FamilyTimetableScope,
  signal?: AbortSignal,
): Promise<FamilySubjectTimetableList> {
  return readFamilySubjectTimetable(familySubjectPath(scope), signal);
}

export function fetchFamilySubjectTimetable(
  scope: FamilyTimetableScope,
  periodId: string,
  signal?: AbortSignal,
): Promise<FamilySubjectTimetable> {
  return readFamilySubjectTimetable(
    `${familySubjectPath(scope)}/${encodeURIComponent(periodId)}`,
    signal,
  );
}
