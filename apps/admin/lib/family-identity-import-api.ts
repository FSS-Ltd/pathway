import {
  API_BASE_URL,
  apiFetch,
  buildAuthHeaders,
  isUsingMockApi,
} from "./api-client";
import { apiErrorFromResponse } from "./api-transport";
import type { FamilyImportRow } from "./family-identity-import";

export type FamilyImportResult = {
  rowNumber: number;
  status: "invited" | "existing" | "failed";
  message: string;
};

export async function importFamilyIdentityRows(
  rows: FamilyImportRow[],
): Promise<FamilyImportResult[]> {
  if (isUsingMockApi()) throw new Error("Family invitations require the API.");
  const response = await apiFetch(`${API_BASE_URL}/family-identity-import`, {
    method: "POST",
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify({ rows }),
  });
  if (!response.ok) {
    throw await apiErrorFromResponse(response, "Unable to import invitations.");
  }
  return response.json() as Promise<FamilyImportResult[]>;
}
