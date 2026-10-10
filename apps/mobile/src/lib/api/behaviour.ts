import { ApiError, apiClient } from "./client";

export type BehaviourType = "MERIT" | "DEMERIT" | "GENERAL";
export type BehaviourVisibility = "GENERAL" | "SENSITIVE";

export type BehaviourCategory = {
  code: string;
  label: string;
  type: BehaviourType;
  visibility: BehaviourVisibility;
  isActive: boolean;
  isSerious: boolean;
  sortOrder: number;
};

export type BehaviourPolicyResponse = {
  categoryVersion: number;
  categories: BehaviourCategory[];
  demeritPolicy: {
    id: string;
    version: number;
    windowDays: number;
    stageOneThreshold: number;
    stageTwoThreshold: number;
    stageThreeThreshold: number;
    seriousMisconductStage: number;
    effectiveFrom: string;
    effectiveTo: string | null;
  } | null;
};

export type BehaviourEntry = {
  id: string;
  childId: string;
  category: string;
  categoryPolicyVersion: number | null;
  categoryIsSerious: boolean | null;
  type: BehaviourType;
  visibility: BehaviourVisibility;
  pointsDelta: number;
  occurredAt: string;
  recordedByUserId: string;
  reason: string;
  note: string | null;
  correctsBehaviourEntryId: string | null;
  createdAt: string;
};

export type BehaviourCommandInput = {
  idempotencyKey: string;
  childId: string;
  category: string;
  type: BehaviourType;
  visibility: BehaviourVisibility;
  pointsDelta: number;
  occurredAt: string;
  reason: string;
  note?: string;
};

export type BehaviourCommandResponse = {
  entry: BehaviourEntry;
  duplicate: boolean;
};

export type BehaviourHistoryResponse = {
  items: BehaviourEntry[];
};

export type BehaviourHistoryQuery = {
  childId?: string;
  type?: BehaviourType;
  occurredFrom?: string;
  occurredTo?: string;
  limit?: number;
};

export type DemeritStatus = {
  childId: string;
  date: string;
  policyVersion: number;
  stage: number;
  stageLabel: string;
  action: "none" | "review" | "notify" | "head-review";
  requiresNote: boolean;
  headReview: boolean;
  manualStage: number | null;
  manualExpiresAt: string | null;
};

export type DemeritOverrideInput = {
  childId: string;
  stage: number;
  expectedPolicyVersion: number;
  reason: string;
  idempotencyKey: string;
};

export type DemeritOverrideResponse = {
  id: string;
  stage: number;
  expiresAt: string;
  duplicate: boolean;
};

export type BehaviourReviewRequest = {
  id: string;
  childId: string;
  behaviourEntryId: string | null;
  demeritStageOverrideId: string | null;
  kind: "SITE" | "HEAD";
  stage: number;
  policyVersion: number;
  requestedAt: string;
};

export type BehaviourReviewResponse = {
  items: BehaviourReviewRequest[];
  nextCursor: string | null;
};

export type BehaviourPermissionResponse = {
  orgId: string;
  tenantId: string | null;
  permissions: string[];
};

export type BehaviourChild = {
  id: string;
  displayName: string;
};

type BehaviourChildApiItem = {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
};

export class BehaviourApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly code: string | null,
  ) {
    super(message);
    this.name = "BehaviourApiError";
  }
}

export function fetchBehaviourPermissions(): Promise<BehaviourPermissionResponse> {
  return apiClient.request<BehaviourPermissionResponse>(
    "/access/users/me/permissions",
    { method: "GET" },
  );
}

export async function fetchBehaviourChildren(): Promise<BehaviourChild[]> {
  const children = await apiClient.request<BehaviourChildApiItem[]>(
    "/children",
    { method: "GET" },
  );
  return children.map((child) => ({
    id: child.id,
    displayName:
      child.preferredName?.trim() ||
      `${child.firstName} ${child.lastName}`.trim() ||
      "Learner",
  }));
}

export function fetchBehaviourPolicy(): Promise<BehaviourPolicyResponse> {
  return apiClient.request<BehaviourPolicyResponse>("/ace/behaviour/policy", {
    method: "GET",
  });
}

export function fetchBehaviourHistory(
  query: BehaviourHistoryQuery = {},
): Promise<BehaviourHistoryResponse> {
  return apiClient.request<BehaviourHistoryResponse>(
    `/ace/behaviour${historyQueryString(query)}`,
    { method: "GET" },
  );
}

export function fetchDemeritStatus(
  childId: string,
  date: string,
): Promise<DemeritStatus | null> {
  return apiClient.request<DemeritStatus | null>(
    `/ace/behaviour/children/${encodeURIComponent(childId)}/demerit-status?date=${encodeURIComponent(date)}`,
    { method: "GET" },
  );
}

export function createDemeritOverride(
  input: DemeritOverrideInput,
): Promise<DemeritOverrideResponse> {
  return apiClient.request<DemeritOverrideResponse>(
    "/ace/behaviour/demerit-overrides",
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function fetchBehaviourReviewRequests(
  childId: string,
  cursor?: string,
): Promise<BehaviourReviewResponse> {
  const params = new URLSearchParams({ childId, limit: "10" });
  if (cursor) params.set("cursor", cursor);
  return apiClient.request<BehaviourReviewResponse>(
    `/ace/behaviour/review-requests?${params.toString()}`,
    { method: "GET" },
  );
}

export function fetchBehaviourReviewFact(
  requestId: string,
): Promise<{ entry: BehaviourEntry }> {
  return apiClient.request<{ entry: BehaviourEntry }>(
    `/ace/behaviour/review-requests/${encodeURIComponent(requestId)}/fact`,
    { method: "GET" },
  );
}

export function recordBehaviour(
  input: BehaviourCommandInput,
): Promise<BehaviourCommandResponse> {
  return apiClient.request<BehaviourCommandResponse>("/ace/behaviour", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function correctBehaviour(
  entryId: string,
  input: BehaviourCommandInput,
): Promise<BehaviourCommandResponse> {
  return apiClient.request<BehaviourCommandResponse>(
    `/ace/behaviour/${encodeURIComponent(entryId)}/corrections`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function toBehaviourApiError(error: unknown): BehaviourApiError {
  if (error instanceof BehaviourApiError) return error;
  if (error instanceof ApiError) {
    const body = parseErrorBody(error.body);
    return new BehaviourApiError(
      body.message || "Unable to complete this behaviour request.",
      error.status,
      body.code,
    );
  }
  return new BehaviourApiError(
    error instanceof Error && error.message
      ? error.message
      : "Unable to complete this behaviour request.",
    null,
    null,
  );
}

function historyQueryString(query: BehaviourHistoryQuery): string {
  const params = new URLSearchParams();
  if (query.childId) params.set("childId", query.childId);
  if (query.type) params.set("type", query.type);
  if (query.occurredFrom) params.set("occurredFrom", query.occurredFrom);
  if (query.occurredTo) params.set("occurredTo", query.occurredTo);
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

function parseErrorBody(value: string): {
  message: string;
  code: string | null;
} {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      return { message: "", code: null };
    }
    return {
      message:
        "message" in parsed && typeof parsed.message === "string"
          ? parsed.message.trim()
          : "",
      code:
        "code" in parsed && typeof parsed.code === "string"
          ? parsed.code
          : null,
    };
  } catch {
    return { message: "", code: null };
  }
}
