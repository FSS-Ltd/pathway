import { ApiError, apiClient } from "./client";
import { parsePaceErrorBody, type PacePolicyCode } from "./pace-policy";

export type PaceTrackStatus =
  | "AHEAD"
  | "ON_TRACK"
  | "AT_RISK"
  | "BEHIND"
  | "BLOCKED";

export type PaceRosterItem = {
  child: { id: string; displayName: string };
  group: { id: string; name: string } | null;
  subject: { id: string; name: string };
  currentPace: number;
  targetPace: number;
  status: PaceTrackStatus | null;
  currentLevel: number;
  rebuiltAt: string | null;
};

export type PaceRosterResponse = {
  items: PaceRosterItem[];
  nextCursor: string | null;
};

export type PaceAssessmentInput = {
  idempotencyKey: string;
  childId: string;
  subjectId: string;
  paceNumber: number;
  assessmentType: "SelfTest" | "FinalTest";
  score: number;
  assessedAt: string;
  reason: string;
};

export type PaceAssessmentResponse = {
  assessment: {
    id: string;
    childId: string;
    subjectId: string;
    paceNumber: number;
    assessmentType: "SelfTest" | "FinalTest";
    score: number;
    result: "passed" | "failed";
    assessedOn: string;
  };
  progress: {
    currentPace: number;
    targetPace: number;
    completedPaces: number;
    trackStatus: PaceTrackStatus;
    blockCode: string | null;
    lastAssessmentId: string | null;
    rebuiltAt: string;
  };
  policy?: {
    decision: "allow" | "warn" | "block";
    code: PacePolicyCode;
  };
  duplicate: boolean;
};

export class PaceApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly policyCode: PacePolicyCode | null,
  ) {
    super(message);
    this.name = "PaceApiError";
  }
}

export async function fetchPaceRoster(): Promise<PaceRosterResponse> {
  const items: PaceRosterItem[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  do {
    const page = await fetchPaceRosterPage(cursor);
    items.push(...page.items);
    cursor = page.nextCursor ?? undefined;
    if (cursor && seenCursors.has(cursor)) {
      throw new PaceApiError(
        "PACE roster pagination returned a repeated cursor.",
        null,
        null,
      );
    }
    if (cursor) seenCursors.add(cursor);
  } while (cursor);

  return { items, nextCursor: null };
}

export function recordPaceAssessment(
  input: PaceAssessmentInput,
): Promise<PaceAssessmentResponse> {
  return apiClient.request<PaceAssessmentResponse>("/ace/pace/assessments", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function toPaceApiError(error: unknown): PaceApiError {
  if (error instanceof PaceApiError) return error;
  if (error instanceof ApiError) {
    const parsed = parsePaceErrorBody(parseJson(error.body));
    return new PaceApiError(
      parsed.message ?? "Unable to record this PACE assessment.",
      error.status,
      parsed.policyCode,
    );
  }

  return new PaceApiError(
    error instanceof Error && error.message
      ? error.message
      : "Unable to record this PACE assessment.",
    null,
    null,
  );
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function fetchPaceRosterPage(cursor?: string): Promise<PaceRosterResponse> {
  const query = new URLSearchParams({ limit: "50" });
  if (cursor) query.set("cursor", cursor);

  return apiClient.request<PaceRosterResponse>(
    `/ace/pace/roster?${query.toString()}`,
    { method: "GET" },
  );
}
