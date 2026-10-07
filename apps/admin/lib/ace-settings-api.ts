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
