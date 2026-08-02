import { apiClient } from "./http";

export type Subject = {
  id: string;
  tenantId: string;
  name: string;
  category: string | null;
  color: string | null;
  isActive: boolean;
  sortOrder: number | null;
};

export type LearningLog = {
  id: string;
  tenantId: string;
  childId: string;
  subjectId: string | null;
  activityId: string | null;
  activityDate: string;
  minutes: number | null;
  title: string;
  description: string | null;
};

export function listSubjects() {
  return apiClient.request<Subject[]>("/learning/subjects", { method: "GET" });
}

export function createSubject(input: { name: string }) {
  return apiClient.request<Subject>("/learning/subjects", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type CreateLearningLogInput = {
  childId: string;
  subjectId?: string;
  activityId?: string;
  activityDate: string;
  minutes?: number;
  title: string;
  description?: string;
};

export function listLearningLogs() {
  return apiClient.request<LearningLog[]>("/learning/logs", { method: "GET" });
}

export function getLearningLog(id: string) {
  return apiClient.request<LearningLog>(`/learning/logs/${id}`, { method: "GET" });
}

export function createLearningLog(input: CreateLearningLogInput) {
  return apiClient.request<LearningLog>("/learning/logs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type Evidence = {
  id: string;
  tenantId: string;
  childId: string;
  learningLogId: string | null;
  title: string;
  storageKey: string;
  mimeType: string;
  byteSize: number;
  capturedAt: string | null;
  uploadedByUserId: string;
  createdAt: string;
};

export function listEvidence() {
  return apiClient.request<Evidence[]>("/learning/evidence", { method: "GET" });
}

export function getEvidence(id: string) {
  return apiClient.request<Evidence>(`/learning/evidence/${id}`, { method: "GET" });
}

export type ReportBundleStatus = "PENDING" | "READY" | "FAILED";

export type ReportBundle = {
  id: string;
  tenantId: string;
  childId: string | null;
  requestedByUserId: string;
  periodStart: string;
  periodEnd: string;
  status: ReportBundleStatus;
  storageKey: string | null;
  failureReason: string | null;
  createdAt: string;
  completedAt: string | null;
};

export function listReportBundles() {
  return apiClient.request<ReportBundle[]>("/learning/report-bundles", { method: "GET" });
}

export function getReportBundle(id: string) {
  return apiClient.request<ReportBundle>(`/learning/report-bundles/${id}`, { method: "GET" });
}

export type CreateReportBundleInput = {
  childId?: string;
  periodStart: string;
  periodEnd: string;
};

export function createReportBundle(input: CreateReportBundleInput) {
  return apiClient.request<ReportBundle>("/learning/report-bundles", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function downloadReportBundleText(id: string) {
  return apiClient.requestText(`/learning/report-bundles/${id}/download`, { method: "GET" });
}
