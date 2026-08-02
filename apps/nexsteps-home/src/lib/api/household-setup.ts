import { apiClient } from "./http";

export type WeekdayLabel = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

export type HouseholdSetupStatus = {
  learningDays: string[];
  setupCompletedAt: string | null;
};

export function getStatus(token?: string) {
  return apiClient.request<HouseholdSetupStatus>("/household-setup/status", {
    method: "GET",
    token,
  });
}

export function updateLearningDays(days: WeekdayLabel[]) {
  return apiClient.request<HouseholdSetupStatus>("/household-setup/learning-days", {
    method: "PATCH",
    body: JSON.stringify({ days }),
  });
}

export function completeSetup() {
  return apiClient.request<HouseholdSetupStatus>("/household-setup/complete", {
    method: "POST",
  });
}
