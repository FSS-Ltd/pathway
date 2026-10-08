import {
  API_BASE_URL,
  apiFetch,
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

export type RecordPaceDiagnosticInput = {
  childId: string;
  subjectId: string;
  level: number;
  outcome: "PASS" | "FAIL";
};

export type RetractPaceDiagnosticInput = { reason: string };

export type PaceDiagnosticCommandResult = { id: string; recordedAt: string };

export type PaceDiagnosticRetractionResult = {
  id: string;
  resultId: string;
  retractedAt: string;
};

export async function recordPaceDiagnostic(
  input: RecordPaceDiagnosticInput,
): Promise<PaceDiagnosticCommandResult> {
  return diagnosticCommand<PaceDiagnosticCommandResult>(
    "/ace/pace/diagnostics",
    input,
  );
}

export async function retractPaceDiagnostic(
  resultId: string,
  input: RetractPaceDiagnosticInput,
): Promise<PaceDiagnosticRetractionResult> {
  return diagnosticCommand<PaceDiagnosticRetractionResult>(
    `/ace/pace/diagnostics/${encodeURIComponent(resultId)}/retraction`,
    input,
  );
}

async function diagnosticCommand<T>(
  path: string,
  body: RecordPaceDiagnosticInput | RetractPaceDiagnosticInput,
): Promise<T> {
  if (isUsingMockApi()) {
    throw new Error("PACE diagnostic changes are not available in mock mode.");
  }
  const response = await apiFetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await paceRequestError(response);
  return response.json() as Promise<T>;
}

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
  const response = await apiFetch(
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
