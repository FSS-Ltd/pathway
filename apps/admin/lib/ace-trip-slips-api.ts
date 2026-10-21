import {
  API_BASE_URL,
  apiFetch,
  buildAuthHeaders,
  isUsingMockApi,
} from "./api-client";

import type {
  FamilySlip,
  FamilySlipDetail,
  StaffSlipList,
  StaffSlipDetail,
  SlipResponseSummary,
  TripDraft,
  StaffTrip,
  SlipDraftInput,
} from "./ace-trip-slips-types";
export type {
  SlipQuestion,
  FamilySlip,
  FamilySlipDetail,
  StaffSlipList,
  StaffSlipDetail,
  SlipResponseSummary,
  TripDraft,
  StaffTrip,
  SlipDraftInput,
} from "./ace-trip-slips-types";

export class TripSlipRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TripSlipRequestError";
  }
}

async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  if (isUsingMockApi())
    throw new Error("Trip permission slips are unavailable in mock mode.");
  const response = await apiFetch(`${API_BASE_URL}${path}`, {
    method,
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal,
  });
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "message" in payload &&
      typeof payload.message === "string"
        ? payload.message
        : `Trip permission-slip request failed: ${response.status}`;
    throw new TripSlipRequestError(message, response.status);
  }
  return response.json() as Promise<T>;
}

const staffPath = (siteId: string) =>
  `/school/sites/${encodeURIComponent(siteId)}`;
const familyPath = (siteId: string, childId: string) =>
  `/ace/family/sites/${encodeURIComponent(siteId)}/children/${encodeURIComponent(childId)}`;

export const fetchFamilySlips = (
  siteId: string,
  childId: string,
  signal?: AbortSignal,
  cursor?: string,
) =>
  request<{ items: FamilySlip[]; nextCursor: string | null }>(
    `${familyPath(siteId, childId)}/permission-slips?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    "GET",
    undefined,
    signal,
  );

export const fetchFamilySlip = (
  siteId: string,
  childId: string,
  slipId: string,
  signal?: AbortSignal,
) =>
  request<FamilySlipDetail>(
    `${familyPath(siteId, childId)}/permission-slips/${encodeURIComponent(slipId)}`,
    "GET",
    undefined,
    signal,
  );

export const respondToFamilySlip = (
  siteId: string,
  slipId: string,
  body: {
    childId: string;
    expectedVersionId: string;
    expectedVersionHash: string;
    decision: "ACCEPTED" | "DECLINED";
    typedName: string;
    signatureAcknowledged: true;
    answers: Array<{ questionId: string; answer: string }>;
    idempotencyKey: string;
  },
) =>
  request<{ id: string; decision: string; respondedAt: string }>(
    `/ace/family/sites/${encodeURIComponent(siteId)}/permission-slips/${encodeURIComponent(slipId)}/respond`,
    "POST",
    body,
  );

export const fetchStaffSlips = (
  siteId: string,
  signal?: AbortSignal,
  cursor?: string,
) =>
  request<StaffSlipList>(
    `${staffPath(siteId)}/permission-slips?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    "GET",
    undefined,
    signal,
  );
export const fetchStaffTrips = (
  siteId: string,
  signal?: AbortSignal,
  cursor?: string,
) =>
  request<{ items: StaffTrip[]; nextCursor: string | null }>(
    `${staffPath(siteId)}/trips?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    "GET",
    undefined,
    signal,
  );
export const fetchSlipAudienceOptions = (
  siteId: string,
  signal?: AbortSignal,
) =>
  request<{
    children: Array<{ id: string; name: string }>;
    limitReached: boolean;
    publicationEnabled: boolean;
    witnesses: Array<{ id: string; name: string }>;
  }>(
    `${staffPath(siteId)}/permission-slips/audience-options`,
    "GET",
    undefined,
    signal,
  );
export const fetchStaffSlip = (
  siteId: string,
  slipId: string,
  signal?: AbortSignal,
) =>
  request<StaffSlipDetail>(
    `${staffPath(siteId)}/permission-slips/${encodeURIComponent(slipId)}`,
    "GET",
    undefined,
    signal,
  );
export const fetchStaffSlipResponses = (
  siteId: string,
  slipId: string,
  signal?: AbortSignal,
) =>
  request<SlipResponseSummary>(
    `${staffPath(siteId)}/permission-slips/${encodeURIComponent(slipId)}/responses`,
    "GET",
    undefined,
    signal,
  );
export const createTrip = (siteId: string, draft: Omit<TripDraft, "id">) =>
  request<TripDraft>(`${staffPath(siteId)}/trips`, "POST", draft);
export const createSlip = (
  siteId: string,
  tripId: string,
  draft: SlipDraftInput,
) =>
  request<{ id: string; versions: Array<{ id: string }> }>(
    `${staffPath(siteId)}/permission-slips`,
    "POST",
    { ...draft, tripId },
  );
export const publishSlip = (
  siteId: string,
  slipId: string,
  versionId: string,
) =>
  request<StaffSlipDetail>(
    `${staffPath(siteId)}/permission-slips/${encodeURIComponent(slipId)}/publish`,
    "POST",
    { expectedVersionId: versionId },
  );
export const recordPhysicalSlipResponse = (
  siteId: string,
  slipId: string,
  body: {
    childId: string;
    expectedVersionId: string;
    expectedVersionHash: string;
    decision: "ACCEPTED" | "DECLINED";
    source: "PHYSICAL" | "TELEPHONE";
    reason: string;
    witnessUserId: string;
  },
) =>
  request<{ id: string; decision: string; recordedAt: string }>(
    `${staffPath(siteId)}/permission-slips/${encodeURIComponent(slipId)}/exceptions`,
    "POST",
    body,
  );
