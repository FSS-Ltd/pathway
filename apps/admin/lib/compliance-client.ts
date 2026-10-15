import type {
  ComplianceRecordInput,
  CompliancePersonnelRecord,
  ComplianceRecordPage,
  ComplianceRevisionPage,
  CompliancePeoplePage,
  ComplianceRecordKind,
} from "@pathway/types";
import { apiFetch, API_BASE_URL } from "./api-client";
import { apiErrorFromResponse } from "./api-transport";

async function request<T>(
  path: string,
  signal: AbortSignal,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await apiFetch(`${API_BASE_URL}/compliance${path}`, {
    method,
    signal,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok)
    throw await apiErrorFromResponse(
      response,
      "Unable to update or load the compliance register.",
    );
  return response.json();
}
export const complianceClient = {
  list(
    signal: AbortSignal,
    filters: {
      cursor?: string;
      kind?: ComplianceRecordKind;
      includeArchived?: boolean;
    } = {},
  ): Promise<ComplianceRecordPage> {
    const query = new URLSearchParams();
    if (filters.cursor) query.set("cursor", filters.cursor);
    if (filters.kind) query.set("kind", filters.kind);
    if (filters.includeArchived) query.set("includeArchived", "true");
    return request(`/checks?${query}`, signal);
  },
  get: (id: string, signal: AbortSignal): Promise<CompliancePersonnelRecord> =>
    request(`/checks/${encodeURIComponent(id)}`, signal),
  save: (
    input: ComplianceRecordInput,
    signal: AbortSignal,
    record?: CompliancePersonnelRecord,
  ): Promise<CompliancePersonnelRecord> =>
    request(
      record ? `/checks/${encodeURIComponent(record.id)}` : "/checks",
      signal,
      record ? "PATCH" : "POST",
      record ? { ...input, expectedVersion: record.version } : input,
    ),
  archive: (
    record: CompliancePersonnelRecord,
    signal: AbortSignal,
  ): Promise<CompliancePersonnelRecord> =>
    request(
      `/checks/${encodeURIComponent(record.id)}/archive`,
      signal,
      "POST",
      { expectedVersion: record.version },
    ),
  history: (
    id: string,
    signal: AbortSignal,
    cursor?: string,
  ): Promise<ComplianceRevisionPage> =>
    request(
      `/checks/${encodeURIComponent(id)}/history${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
      signal,
    ),
  people: (query: string, signal: AbortSignal): Promise<CompliancePeoplePage> =>
    request(`/people?query=${encodeURIComponent(query)}`, signal),
};
