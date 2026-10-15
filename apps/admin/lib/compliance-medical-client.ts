import type {
  ComplianceMedicalRecord,
  ComplianceMedicalPage,
  ComplianceMedicalUpdate,
} from "@pathway/types";
import { apiFetch, API_BASE_URL } from "./api-client";
import { apiErrorFromResponse } from "./api-transport";
async function request<T>(
  path: string,
  signal: AbortSignal,
  input?: ComplianceMedicalUpdate,
): Promise<T> {
  const response = await apiFetch(`${API_BASE_URL}/compliance/medical${path}`, {
    signal,
    cache: "no-store",
    method: input ? "PATCH" : "GET",
    headers: input ? { "Content-Type": "application/json" } : undefined,
    body: input ? JSON.stringify(input) : undefined,
  });
  if (!response.ok)
    throw await apiErrorFromResponse(
      response,
      "Medical information could not be loaded or saved.",
    );
  return response.json();
}
export const complianceMedicalClient = {
  list: (
    signal: AbortSignal,
    cursor?: string,
  ): Promise<ComplianceMedicalPage> =>
    request(cursor ? `?cursor=${encodeURIComponent(cursor)}` : "", signal),
  get: (id: string, signal: AbortSignal): Promise<ComplianceMedicalRecord> =>
    request(`/${encodeURIComponent(id)}`, signal),
  save: (
    id: string,
    input: ComplianceMedicalUpdate,
    signal: AbortSignal,
  ): Promise<ComplianceMedicalRecord> =>
    request(`/${encodeURIComponent(id)}`, signal, input),
};
