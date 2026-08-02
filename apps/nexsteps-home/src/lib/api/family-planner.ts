import { apiClient } from "./http";

export type Activity = {
  id: string;
  tenantId: string;
  childId: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number | null;
  subjectIds: string[];
  planNotes: string | null;
  resourcesNote: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type TaskPriority = "LOW" | "NORMAL" | "IMPORTANT";

export type FamilyTask = {
  id: string;
  tenantId: string;
  title: string;
  assignedToUserId: string | null;
  dueAt: string | null;
  priority: TaskPriority;
  completedAt: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type CalendarItem = {
  id: string;
  tenantId: string;
  title: string;
  who: string | null;
  scheduledAt: string;
  location: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateActivityInput = {
  childId: string;
  title: string;
  scheduledAt: string;
  durationMinutes?: number;
  subjectIds?: string[];
  planNotes?: string;
  resourcesNote?: string;
};

export function listActivities() {
  return apiClient.request<Activity[]>("/family-planner/activities", { method: "GET" });
}

export function createActivity(input: CreateActivityInput) {
  return apiClient.request<Activity>("/family-planner/activities", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type CreateTaskInput = {
  title: string;
  assignedToUserId?: string;
  dueAt?: string;
  priority?: TaskPriority;
};

export function listTasks() {
  return apiClient.request<FamilyTask[]>("/family-planner/tasks", { method: "GET" });
}

export function createTask(input: CreateTaskInput) {
  return apiClient.request<FamilyTask>("/family-planner/tasks", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function completeTask(id: string) {
  return apiClient.request<FamilyTask>(`/family-planner/tasks/${id}/complete`, {
    method: "POST",
  });
}

export type CreateCalendarItemInput = {
  title: string;
  who?: string;
  scheduledAt: string;
  location?: string;
};

export function listCalendarItems() {
  return apiClient.request<CalendarItem[]>("/family-planner/calendar-items", { method: "GET" });
}

export function createCalendarItem(input: CreateCalendarItemInput) {
  return apiClient.request<CalendarItem>("/family-planner/calendar-items", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
