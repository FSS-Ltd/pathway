import {
  API_BASE_URL,
  apiFetch,
  buildAuthHeaders,
  isUsingMockApi,
} from "./api-client";

export interface StudentHomeworkAssignment {
  id: string;
  title: string;
  instructions: string;
  dueAt: string;
  submission: null | {
    id: string;
    status: "DRAFT" | "SUBMITTED" | "RETURNED" | "COMPLETED";
    draftText: string;
    version: number;
    versions: Array<{
      id: string;
      number: number;
      text: string;
      late: boolean;
      submittedAt: string;
      evidence: null | {
        id: string;
        fileName: string;
        mimeType: string;
        status: "CLEAN";
      };
      review: null | {
        decision: "RETURNED" | "COMPLETED";
        feedback: string;
        releasedAt: string | null;
      };
    }>;
  };
}

export interface StudentHomeworkList {
  submissionsEnabled: boolean;
  assignments: StudentHomeworkAssignment[];
}

async function homeworkRequest<T>(
  siteId: string,
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  if (isUsingMockApi())
    throw new Error("Homework is unavailable in mock mode.");
  let response: Response;
  try {
    response = await apiFetch(
      `${API_BASE_URL}/ace/student/sites/${encodeURIComponent(siteId)}/homework${path}`,
      {
        method,
        headers: buildAuthHeaders(),
        credentials: "include",
        cache: "no-store",
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal,
      },
    );
  } catch {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    throw new Error("Connection lost. Check your connection and try again.");
  }
  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? "This homework is no longer available to your account."
        : response.status === 503
          ? "Homework submissions are unavailable right now."
          : response.status === 401 || response.status === 403
            ? "Your student access could not be verified. Sign in again and retry."
            : "Homework could not be saved. Please try again.",
    );
  }
  return response.json() as Promise<T>;
}

export function fetchStudentHomework(siteId: string, signal?: AbortSignal) {
  return homeworkRequest<StudentHomeworkList>(
    siteId,
    "",
    "GET",
    undefined,
    signal,
  );
}

export function saveStudentHomeworkDraft(
  siteId: string,
  assignmentId: string,
  text: string,
) {
  return homeworkRequest(
    siteId,
    `/${encodeURIComponent(assignmentId)}/draft`,
    "PATCH",
    { text },
  );
}

export function submitStudentHomework(
  siteId: string,
  assignmentId: string,
  input: { text: string; evidenceId?: string; idempotencyKey: string },
) {
  return homeworkRequest(
    siteId,
    `/${encodeURIComponent(assignmentId)}/submit`,
    "POST",
    input,
  );
}

export async function uploadStudentHomeworkEvidence(
  siteId: string,
  assignmentId: string,
  file: File,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  const sha256 = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const intent = await homeworkRequest<{ id: string; uploadUrl: string }>(
    siteId,
    `/${encodeURIComponent(assignmentId)}/evidence-intents`,
    "POST",
    {
      fileName: file.name,
      mimeType: file.type,
      byteLength: file.size,
      sha256,
    },
  );
  let uploaded: Response;
  try {
    uploaded = await fetch(intent.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type, "x-upsert": "false" },
      body: file,
    });
  } catch {
    throw new Error("Evidence upload was interrupted. Try uploading again.");
  }
  if (!uploaded.ok)
    throw new Error("Evidence upload failed. Please try again.");
  const checked = await homeworkRequest<{
    id: string;
    status: "CLEAN" | "REJECTED";
  }>(
    siteId,
    `/${encodeURIComponent(assignmentId)}/evidence-intents/${encodeURIComponent(intent.id)}/complete`,
    "POST",
  );
  if (checked.status !== "CLEAN") {
    throw new Error(
      "Evidence did not pass the safety check. Choose another file.",
    );
  }
  return checked.id;
}
