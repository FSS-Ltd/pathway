import {
  API_BASE_URL,
  buildAuthHeaders,
  isUsingMockApi,
  paceRequestError,
} from "./api-client";

export type PaceDiagnosticResult = {
  id: string;
  enrollmentId: string;
  level: number;
  outcome: "PASS" | "FAIL";
  recordedAt: string;
  recordedBy: { id: string; displayName: string };
  retraction: {
    id: string;
    reason: string;
    retractedAt: string;
    retractedBy: { id: string; displayName: string };
  } | null;
};

export type PaceDiagnosticPage = {
  selection: {
    child: { id: string; displayName: string };
    subject: { id: string; name: string };
  };
  items: PaceDiagnosticResult[];
  nextCursor: string | null;
};

export type PaceDiagnosticHistoryQuery = {
  childId: string;
  subjectId: string;
  includeRetracted: boolean;
  cursor?: string;
  signal?: AbortSignal;
};

export async function fetchPaceDiagnosticHistory({
  childId,
  subjectId,
  includeRetracted,
  cursor,
  signal,
}: PaceDiagnosticHistoryQuery): Promise<PaceDiagnosticPage> {
  if (isUsingMockApi()) {
    return {
      selection: {
        child: { id: childId, displayName: "Selected child" },
        subject: { id: subjectId, name: "Selected subject" },
      },
      items: [],
      nextCursor: null,
    };
  }

  const params = new URLSearchParams({ childId, subjectId, limit: "50" });
  if (includeRetracted) params.set("includeRetracted", "true");
  if (cursor) params.set("cursor", cursor);
  const response = await fetch(
    `${API_BASE_URL}/ace/pace/diagnostics?${params.toString()}`,
    {
      headers: buildAuthHeaders(),
      credentials: "include",
      cache: "no-store",
      signal,
    },
  );
  if (!response.ok) throw await paceRequestError(response);
  return response.json() as Promise<PaceDiagnosticPage>;
}
