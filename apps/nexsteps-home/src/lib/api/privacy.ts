import { apiClient } from "./http";

// Matches DataExportRequest/AccountDeletionRequest returned by
// apps/api/src/privacy/privacy.controller.ts.
export type DataExportKind = "FAMILY_DATA" | "REPORT_ARCHIVE";
export type DataExportStatus = "PENDING" | "GENERATING" | "READY" | "FAILED";

export type DataExportRequest = {
  id: string;
  tenantId: string;
  requestedById: string;
  kind: DataExportKind;
  status: DataExportStatus;
  storageKey: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AccountDeletionRequest = {
  id: string;
  tenantId: string;
  requestedById: string;
  reason: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export function listExports() {
  return apiClient.request<DataExportRequest[]>("/privacy/exports");
}

// POST /privacy/exports is synchronous - the response is already READY (or
// throws) by the time this resolves, matching PrivacyService.requestExport's
// shape (no PENDING window to poll for).
export function requestExport(kind: DataExportKind) {
  return apiClient.request<DataExportRequest>("/privacy/exports", {
    method: "POST",
    body: JSON.stringify({ kind }),
  });
}

export function requestDeletion(reason?: string) {
  return apiClient.request<AccountDeletionRequest>("/privacy/deletion-requests", {
    method: "POST",
    body: JSON.stringify(reason ? { reason } : {}),
  });
}
