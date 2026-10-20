import {
  API_BASE_URL,
  apiFetch,
  buildAuthHeaders,
  isUsingMockApi,
} from "./api-client";

export interface HomeworkReviewQueueItem {
  assignmentId: string;
  assignmentTitle: string;
  submissionId: string;
  versionId: string;
  version: number;
  studentName: string;
  text: string;
  submittedAt: string;
  late: boolean;
  evidence: { id: string; fileName: string; mimeType: string } | null;
  review: { id: string; releasedAt: string | null } | null;
}

async function reviewRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  if (isUsingMockApi())
    throw new Error("Homework reviews are unavailable in mock mode.");
  const response = await apiFetch(
    `${API_BASE_URL}/ace/homework/reviews${path}`,
    {
      method,
      headers: buildAuthHeaders(),
      credentials: "include",
      cache: "no-store",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal,
    },
  );
  if (!response.ok)
    throw new Error(`Homework review request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

export const fetchHomeworkReviewQueue = (signal?: AbortSignal) =>
  reviewRequest<{ reviewsEnabled: boolean; items: HomeworkReviewQueueItem[] }>(
    "",
    "GET",
    undefined,
    signal,
  );

export const submitHomeworkReview = (input: {
  versionId: string;
  decision: "RETURNED" | "COMPLETED";
  feedback: string;
  staffNote: string;
  idempotencyKey: string;
}) => reviewRequest("", "POST", input);

export const releaseHomeworkReview = (reviewId: string) =>
  reviewRequest(`/${encodeURIComponent(reviewId)}/release`, "POST");
