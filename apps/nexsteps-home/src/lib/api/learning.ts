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

export type CreateLearningLogInput = {
  childId: string;
  subjectId?: string;
  activityId?: string;
  activityDate: string;
  minutes?: number;
  title: string;
  description?: string;
};

export function createLearningLog(input: CreateLearningLogInput) {
  return apiClient.request<LearningLog>("/learning/logs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
