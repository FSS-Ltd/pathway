import { z } from "zod";

export const planningPreferencesSchema = z
  .object({
    weekStartsOn: z.enum(["Mon", "Sun"]).optional(),
    defaultActivityDurationMinutes: z.number().int().min(5).max(240).optional(),
    dailyPlanningLimit: z.number().int().min(1).max(10).optional(),
    timeFormat: z.enum(["12h", "24h"]).optional(),
    language: z.string().min(2).max(10).optional(),
  })
  .strict();
export type PlanningPreferencesDto = z.infer<typeof planningPreferencesSchema>;

export const notificationPreferencesSchema = z
  .object({
    todaySummary: z.boolean().optional(),
    activityReminders: z.boolean().optional(),
    tasksDue: z.boolean().optional(),
    communityHellos: z.boolean().optional(),
    channelActivity: z.boolean().optional(),
    meetupsNearby: z.boolean().optional(),
    quietHours: z
      .object({ start: z.string(), end: z.string(), enabled: z.boolean() })
      .optional(),
  })
  .strict();
export type NotificationPreferencesDto = z.infer<typeof notificationPreferencesSchema>;

export const PLANNING_PREFERENCES_DEFAULTS: Required<PlanningPreferencesDto> = {
  weekStartsOn: "Mon",
  defaultActivityDurationMinutes: 45,
  dailyPlanningLimit: 2,
  timeFormat: "24h",
  language: "en-GB",
};

export const NOTIFICATION_PREFERENCES_DEFAULTS: Required<NotificationPreferencesDto> = {
  todaySummary: true,
  activityReminders: true,
  tasksDue: true,
  communityHellos: true,
  channelActivity: true,
  meetupsNearby: false,
  quietHours: { start: "20:30", end: "07:30", enabled: true },
};
