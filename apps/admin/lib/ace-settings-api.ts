import { API_BASE_URL, buildAuthHeaders, isUsingMockApi } from "./api-client";

export type AcePacePolicy = {
  id: string;
  version: number;
  selfTestPassingScore: number;
  paceTestPassingScore: number;
  maxAssessmentsPerDay: number;
  allowSamePaceSameDay: boolean;
  effectiveFrom: string;
};

export type AceSettings = {
  timezone: string;
  pacePolicy: AcePacePolicy | null;
  demeritPolicy: { version: number } | null;
};

export type AcePacePolicyChange = Pick<
  AcePacePolicy,
  | "selfTestPassingScore"
  | "paceTestPassingScore"
  | "maxAssessmentsPerDay"
  | "allowSamePaceSameDay"
>;

export type UpdateAcePacePolicyInput = {
  reason: string;
  expectedPacePolicyVersion: number;
  expectedDemeritPolicyVersion: number;
  pacePolicy: AcePacePolicyChange;
};

export type AceSubject = {
  id: string;
  name: string;
  isActive: boolean;
};

export type AceSubjectChange = { name: string; reason: string };

export class AceSettingsRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AceSettingsRequestError";
  }
}

export async function fetchAceSettings(
  signal?: AbortSignal,
): Promise<AceSettings> {
  if (isUsingMockApi()) {
    return { timezone: "Europe/London", pacePolicy: null, demeritPolicy: null };
  }
  const response = await fetch(`${API_BASE_URL}/ace/settings`, {
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw await settingsRequestError(response);
  return response.json() as Promise<AceSettings>;
}

export async function updateAcePacePolicy(
  input: UpdateAcePacePolicyInput,
): Promise<AceSettings> {
  if (isUsingMockApi()) {
    throw new Error("ACE settings changes are not available in mock mode.");
  }
  const response = await fetch(`${API_BASE_URL}/ace/settings`, {
    method: "PUT",
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await settingsRequestError(response);
  return response.json() as Promise<AceSettings>;
}

export async function fetchAceSubjects(
  signal?: AbortSignal,
): Promise<AceSubject[]> {
  if (isUsingMockApi()) return [];
  const response = await fetch(`${API_BASE_URL}/ace/subjects`, {
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw await settingsRequestError(response);
  return response.json() as Promise<AceSubject[]>;
}

export function createAceSubject(input: AceSubjectChange): Promise<AceSubject> {
  return writeAceSubject("", "POST", input);
}

export function renameAceSubject(
  id: string,
  input: AceSubjectChange,
): Promise<AceSubject> {
  return writeAceSubject(`/${encodeURIComponent(id)}`, "PATCH", input);
}

export function deactivateAceSubject(
  id: string,
  reason: string,
): Promise<AceSubject> {
  return writeAceSubject(`/${encodeURIComponent(id)}/deactivate`, "POST", {
    reason,
  });
}

async function writeAceSubject(
  path: string,
  method: "POST" | "PATCH",
  input: AceSubjectChange | { reason: string },
): Promise<AceSubject> {
  if (isUsingMockApi()) {
    throw new Error("ACE subject changes are not available in mock mode.");
  }
  const response = await fetch(`${API_BASE_URL}/ace/subjects${path}`, {
    method,
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await settingsRequestError(response);
  return response.json() as Promise<AceSubject>;
}

async function settingsRequestError(
  response: Response,
): Promise<AceSettingsRequestError> {
  const body: unknown = await response.json().catch(() => null);
  const message =
    typeof body === "object" &&
    body !== null &&
    "message" in body &&
    typeof body.message === "string" &&
    body.message.trim()
      ? body.message
      : `ACE settings request failed: ${response.status}`;
  return new AceSettingsRequestError(message, response.status);
}
