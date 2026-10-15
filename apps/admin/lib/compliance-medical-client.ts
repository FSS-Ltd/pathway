import type {
  ComplianceMedicalRecord,
  ComplianceMedicalPage,
  ComplianceMedicalUpdate,
} from "@pathway/types";
import { readableMedicalRecord } from "./medical-read";
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
  list: async (
    signal: AbortSignal,
    cursor?: string,
  ): Promise<ComplianceMedicalPage> => {
    const page = await request<ComplianceMedicalPage>(
      cursor ? `?cursor=${encodeURIComponent(cursor)}` : "",
      signal,
    );
    return { ...page, items: page.items.map(readableMedicalRecord) };
  },
  get: async (
    id: string,
    signal: AbortSignal,
  ): Promise<ComplianceMedicalRecord> =>
    readableMedicalRecord(
      await request<ComplianceMedicalRecord>(
        `/${encodeURIComponent(id)}`,
        signal,
      ),
    ),
  save: async (
    id: string,
    input: ComplianceMedicalUpdate,
    signal: AbortSignal,
  ): Promise<ComplianceMedicalRecord> =>
    readableMedicalRecord(
      await request<ComplianceMedicalRecord>(
        `/${encodeURIComponent(id)}`,
        signal,
        input,
      ),
    ),
};
