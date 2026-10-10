import {
  API_BASE_URL,
  apiFetch,
  buildAuthHeaders,
  isUsingMockApi,
} from "./api-client";
import { apiErrorFromResponse } from "./api-transport";

export type StaffNoticeSummary = {
  id: string;
  title: string;
  audience: "STAFF" | "PARENTS_AND_STAFF";
  historical: boolean;
  publishedAt: string;
  expiresAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
};

export type StaffNoticeDetail = StaffNoticeSummary & { body: string };
export type StaffNoticePage = {
  items: StaffNoticeSummary[];
  nextCursor: string | null;
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (isUsingMockApi()) {
    throw new Error("Site notices are unavailable in mock mode.");
  }
  const response = await apiFetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    throw await apiErrorFromResponse(response, "Unable to load site notices.");
  }
  return response.json() as Promise<T>;
}

export function fetchStaffNotices(
  cursor?: string,
  signal?: AbortSignal,
): Promise<StaffNoticePage> {
  const query = new URLSearchParams({ limit: "25" });
  if (cursor) query.set("cursor", cursor);
  return request(`/ace/notices?${query}`, { signal });
}

export function fetchStaffNotice(
  id: string,
  signal?: AbortSignal,
): Promise<StaffNoticeDetail> {
  return request(`/ace/notices/${encodeURIComponent(id)}`, { signal });
}

export function markStaffNoticeRead(id: string): Promise<{ readAt: string }> {
  return request(`/ace/notices/${encodeURIComponent(id)}/read`, {
    method: "POST",
  });
}

export type ParentNoticeSummary = Pick<
  StaffNoticeSummary,
  "id" | "title" | "publishedAt" | "expiresAt" | "deliveredAt" | "readAt"
>;
export type ParentNoticeDetail = ParentNoticeSummary & { body: string };
export type ParentNoticePage = {
  items: ParentNoticeSummary[];
  nextCursor: string | null;
};

function parentNoticePath(siteId: string): string {
  return `/ace/parent/sites/${encodeURIComponent(siteId)}/notices`;
}

export function fetchParentNotices(
  siteId: string,
  cursor?: string,
  signal?: AbortSignal,
): Promise<ParentNoticePage> {
  const query = new URLSearchParams({ limit: "25" });
  if (cursor) query.set("cursor", cursor);
  return request(`${parentNoticePath(siteId)}?${query}`, { signal });
}

export function fetchParentNotice(
  siteId: string,
  id: string,
  signal?: AbortSignal,
): Promise<ParentNoticeDetail> {
  return request(`${parentNoticePath(siteId)}/${encodeURIComponent(id)}`, {
    signal,
  });
}

export function markParentNoticeRead(
  siteId: string,
  id: string,
): Promise<{ readAt: string }> {
  return request(`${parentNoticePath(siteId)}/${encodeURIComponent(id)}/read`, {
    method: "POST",
  });
}

export type NoticeAudience = "PARENTS" | "STAFF" | "PARENTS_AND_STAFF";
export type NoticeDraftInput = {
  title: string;
  body: string;
  audience: NoticeAudience;
  expiresAt: string | null;
};
export type NoticeDraft = NoticeDraftInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
};
export type NoticeAudiencePreview = {
  recipientCount: number;
  audienceVersion: string;
  updatedAt: string;
};

export function createNoticeDraft(
  input: NoticeDraftInput,
): Promise<NoticeDraft> {
  return request("/ace/notices/drafts", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function fetchNoticeDraft(id: string): Promise<NoticeDraft> {
  return request(`/ace/notices/drafts/${encodeURIComponent(id)}`);
}

export function updateNoticeDraft(
  id: string,
  input: NoticeDraftInput,
  expectedUpdatedAt: string,
): Promise<NoticeDraft> {
  return request(`/ace/notices/drafts/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ ...input, expectedUpdatedAt }),
  });
}

export function previewNoticeAudience(
  id: string,
): Promise<NoticeAudiencePreview> {
  return request(
    `/ace/notices/drafts/${encodeURIComponent(id)}/audience-preview`,
  );
}

export function publishNotice(
  id: string,
  preview: NoticeAudiencePreview,
): Promise<{ id: string; publishedAt: string; recipientCount: number }> {
  return request(`/ace/notices/${encodeURIComponent(id)}/publish`, {
    method: "POST",
    body: JSON.stringify({
      expectedUpdatedAt: preview.updatedAt,
      expectedAudienceVersion: preview.audienceVersion,
    }),
  });
}

export function withdrawNotice(
  id: string,
  reason: string,
): Promise<{ id: string; withdrawnAt: string }> {
  return request(`/ace/notices/${encodeURIComponent(id)}/withdraw`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}
