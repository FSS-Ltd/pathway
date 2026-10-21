import {
  API_BASE_URL,
  apiFetch,
  buildAuthHeaders,
  isUsingMockApi,
} from "./api-client";

export type FaithAudience =
  | { type: "ALL_ACTIVE_STUDENTS" }
  | { type: "AGE_BAND"; ageBandIds: string[] };

export type FaithPayload = {
  body: string;
  sourceLabel?: string;
  sourceUrl?: string;
  reflectionPrompt?: string;
};

export type FaithDraft = {
  id: string;
  updatedAt: string;
  title: string;
  contentPayload: FaithPayload | null;
  audience: FaithAudience | null;
  needsReview: boolean;
  status: "DRAFT" | "PUBLISHED";
  scheduledAt: string | null;
  scheduleFailureReason: string | null;
};

export type FaithContent = {
  id: string;
  title: string;
  latestVersionId: string | null;
  latestVersionNumber: number;
  withdrawnAt: string | null;
  publishedNeedsReview: boolean;
  drafts: FaithDraft[];
  publishedVersion: {
    id: string;
    title: string;
    contentPayload: FaithPayload;
    audience: FaithAudience;
  } | null;
};

export type FaithList = {
  items: FaithContent[];
  nextCursor: string | null;
  siteLead: boolean;
  authoringEnabled: boolean;
  publicationEnabled: boolean;
};

export type FaithOptions = {
  ageBands: Array<{
    id: string;
    name: string;
    minimumAge: number;
    maximumAge: number;
  }>;
};

export type FaithDraftInput = {
  faithContentId?: string;
  title: string;
  contentPayload: FaithPayload;
  audience: FaithAudience;
};

export type FaithReflection = {
  id: string;
  studentName?: string;
  text: string;
  submittedAt: string;
  moderationStatus: "PENDING" | "APPROVED" | "REJECTED";
  visibility: "AUTHOR_AND_STAFF" | "RELEASED_GUARDIANS";
  guardianReleasedAt: string | null;
};

export type FaithReflectionList = {
  items: FaithReflection[];
  nextCursor: string | null;
};

export class FaithRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "FaithRequestError";
  }
}

async function faithRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  if (isUsingMockApi())
    throw new Error("Faith content is unavailable in mock mode.");
  const response = await apiFetch(`${API_BASE_URL}/ace/faith${path}`, {
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
        : `Faith request failed: ${response.status}`;
    throw new FaithRequestError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const fetchFaithContent = (signal?: AbortSignal, cursor?: string) =>
  faithRequest<FaithList>(
    cursor
      ? `/content?limit=50&cursor=${encodeURIComponent(cursor)}`
      : "/content",
    "GET",
    undefined,
    signal,
  );
export const fetchFaithOptions = (signal?: AbortSignal) =>
  faithRequest<FaithOptions>("/options", "GET", undefined, signal);
export const fetchFaithSettings = (signal?: AbortSignal) =>
  faithRequest<{
    displayLabel: string;
    reflectionsEnabled: boolean;
    reflectionFeatureAvailable: boolean;
  }>("/settings", "GET", undefined, signal);
export const fetchFaithReflections = (
  contentId: string,
  signal?: AbortSignal,
  cursor?: string,
) =>
  faithRequest<FaithReflectionList>(
    `/content/${encodeURIComponent(contentId)}/reflections?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    "GET",
    undefined,
    signal,
  );
export const moderateFaithReflection = (
  contentId: string,
  reflectionId: string,
  decision: "APPROVED" | "REJECTED",
) =>
  faithRequest<unknown>(
    `/content/${encodeURIComponent(contentId)}/reflections/${encodeURIComponent(reflectionId)}/moderate`,
    "POST",
    { decision },
  );
export const releaseFaithReflection = (
  contentId: string,
  reflectionId: string,
) =>
  faithRequest<unknown>(
    `/content/${encodeURIComponent(contentId)}/reflections/${encodeURIComponent(reflectionId)}/release`,
    "POST",
  );
export const createFaithDraft = (input: FaithDraftInput) =>
  faithRequest<unknown>("/content", "POST", input);
export const updateFaithDraft = (
  contentId: string,
  draftId: string,
  input: FaithDraftInput,
  expectedUpdatedAt: string,
) =>
  faithRequest<unknown>(
    `/content/${encodeURIComponent(contentId)}/drafts/${encodeURIComponent(draftId)}`,
    "PATCH",
    {
      title: input.title,
      contentPayload: input.contentPayload,
      audience: input.audience,
      expectedUpdatedAt,
    },
  );
export const publishFaithDraft = (
  contentId: string,
  draftId: string,
  expectedVersionId: string | null,
) =>
  faithRequest<unknown>(
    `/content/${encodeURIComponent(contentId)}/publish`,
    "POST",
    {
      draftId,
      expectedVersionId,
    },
  );
export const scheduleFaithDraft = (
  contentId: string,
  draftId: string,
  expectedVersionId: string | null,
  scheduledAt: string,
) =>
  faithRequest<unknown>(
    `/content/${encodeURIComponent(contentId)}/schedule`,
    "POST",
    {
      draftId,
      expectedVersionId,
      scheduledAt,
    },
  );
export const cancelFaithSchedule = (contentId: string, draftId: string) =>
  faithRequest<unknown>(
    `/content/${encodeURIComponent(contentId)}/cancel-schedule`,
    "POST",
    {
      draftId,
    },
  );
export const withdrawFaithContent = (
  contentId: string,
  expectedVersionId: string,
) =>
  faithRequest<unknown>(
    `/content/${encodeURIComponent(contentId)}/withdraw`,
    "POST",
    {
      expectedVersionId,
    },
  );
export const updateFaithSettings = (
  displayLabel: string,
  reflectionsEnabled?: boolean,
) =>
  faithRequest<{ displayLabel: string; reflectionsEnabled: boolean }>(
    "/settings",
    "PATCH",
    {
      displayLabel,
      ...(reflectionsEnabled === undefined ? {} : { reflectionsEnabled }),
    },
  );
