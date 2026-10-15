import type {
  TrackerProfile,
  TrackerProfileInput,
  TrackerJurisdiction,
  TrackerChecklist,
  TrackerSignal,
  TrackerAttestationInput,
  TrackerAttestation,
  TrackerEvidenceInput,
  TrackerEvidence,
  TrackerEvidencePage,
  TrackerHistoryPage,
  TrackerHistoryRequirementPage,
} from "@pathway/types";
import { apiFetch, API_BASE_URL } from "./api-client";
import { apiErrorFromResponse } from "./api-transport";
const base = `${API_BASE_URL}/compliance/tracker`;
async function request<T>(
  path: string,
  signal: AbortSignal,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const response = await apiFetch(`${base}${path}`, {
    signal,
    cache: "no-store",
    method: body === undefined ? "GET" : method,
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok)
    throw await apiErrorFromResponse(
      response,
      "The tracker request failed. Your draft has been kept; retry or refresh the latest record.",
    );
  return response.json();
}
const query = (id: string, cursor?: string) =>
  `?requirementId=${encodeURIComponent(id)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
export const trackerClient = {
  jurisdictions: (signal: AbortSignal): Promise<TrackerJurisdiction[]> =>
    request("/jurisdictions", signal),
  checklist: (signal: AbortSignal): Promise<TrackerChecklist> =>
    request("/checklist", signal),
  signals: (signal: AbortSignal): Promise<TrackerSignal[]> =>
    request("/signals", signal),
  profile: (signal: AbortSignal): Promise<TrackerProfile | null> =>
    request("/profile", signal),
  saveProfile: (
    profile: TrackerProfileInput,
    expectedVersion: number,
    signal: AbortSignal,
  ): Promise<TrackerProfile> =>
    request("/profile", signal, { profile, expectedVersion }, "PUT"),
  attest: (
    input: TrackerAttestationInput,
    signal: AbortSignal,
  ): Promise<TrackerAttestation> => request("/attestations", signal, input),
  retained: (
    signal: AbortSignal,
    cursor?: string,
  ): Promise<TrackerHistoryRequirementPage> =>
    request(
      `/history/requirements${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
      signal,
    ),
  history: (
    id: string,
    signal: AbortSignal,
    cursor?: string,
  ): Promise<TrackerHistoryPage> =>
    request(`/history${query(id, cursor)}`, signal),
  evidence: (
    id: string,
    signal: AbortSignal,
    cursor?: string,
  ): Promise<TrackerEvidencePage> =>
    request(`/evidence${query(id, cursor)}`, signal),
  upload: (
    input: TrackerEvidenceInput,
    signal: AbortSignal,
  ): Promise<TrackerEvidence> => request("/evidence", signal, input),
  archive: (id: string, signal: AbortSignal): Promise<TrackerEvidence> =>
    request(`/evidence/${encodeURIComponent(id)}/archive`, signal, {}),
};
export async function downloadTrackerEvidence(
  id: string,
  signal: AbortSignal,
): Promise<void> {
  const response = await apiFetch(
    `${base}/evidence/${encodeURIComponent(id)}/file`,
    { signal, cache: "no-store" },
  );
  if (!response.ok)
    throw await apiErrorFromResponse(
      response,
      "Evidence could not be downloaded.",
    );
  const blob = await response.blob();
  if (signal.aborted) return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "compliance-evidence.pdf";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
