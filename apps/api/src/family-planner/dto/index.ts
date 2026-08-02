import { z } from "zod";

const uuid = z.string().uuid();
const date = z.coerce.date();

export const createActivitySchema = z
  .object({
    childId: uuid,
    title: z.string().trim().min(1).max(240),
    scheduledAt: date,
    durationMinutes: z.number().int().positive().max(24 * 60).optional(),
    subjectIds: z.array(uuid).max(20).optional(),
    planNotes: z.string().trim().min(1).max(10_000).optional(),
    resourcesNote: z.string().trim().min(1).max(10_000).optional(),
  })
  .strict();

export const createTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(240),
    assignedToUserId: uuid.optional(),
    dueAt: date.optional(),
    priority: z.enum(["LOW", "NORMAL", "IMPORTANT"]).optional(),
  })
  .strict();

export const createCalendarItemSchema = z
  .object({
    title: z.string().trim().min(1).max(240),
    who: z.string().trim().min(1).max(240).optional(),
    scheduledAt: date,
    location: z.string().trim().min(1).max(240).optional(),
  })
  .strict();

export type CreateActivityDto = z.infer<typeof createActivitySchema>;
export type CreateTaskDto = z.infer<typeof createTaskSchema>;
export type CreateCalendarItemDto = z.infer<typeof createCalendarItemSchema>;
