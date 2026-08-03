import { apiClient } from "./http";

export type PlanningPreferences = {
  weekStartsOn: "Mon" | "Sun";
  defaultActivityDurationMinutes: number;
  dailyPlanningLimit: number;
  timeFormat: "12h" | "24h";
  language: string;
};

export type NotificationPreferences = {
  todaySummary: boolean;
  activityReminders: boolean;
  tasksDue: boolean;
  communityHellos: boolean;
  channelActivity: boolean;
  meetupsNearby: boolean;
  quietHours: { start: string; end: string; enabled: boolean };
};

export function getPlanningPreferences() {
  return apiClient.request<PlanningPreferences>("/household-setup/planning-preferences");
}

export function updatePlanningPreferences(input: Partial<PlanningPreferences>) {
  return apiClient.request<PlanningPreferences>("/household-setup/planning-preferences", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function getNotificationPreferences() {
  return apiClient.request<NotificationPreferences>("/household-setup/notification-preferences");
}

export function updateNotificationPreferences(input: Partial<NotificationPreferences>) {
  return apiClient.request<NotificationPreferences>("/household-setup/notification-preferences", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
