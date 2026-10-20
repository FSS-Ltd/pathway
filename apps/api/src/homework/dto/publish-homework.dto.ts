import { z } from "zod";

export const publishHomeworkSchema = z.object({
  version: z.number().int().positive(),
});

export type PublishHomeworkDto = z.infer<typeof publishHomeworkSchema>;

export const scheduleHomeworkSchema = publishHomeworkSchema.extend({
  scheduledAt: z.string().datetime({ offset: true }),
});

export type ScheduleHomeworkDto = z.infer<typeof scheduleHomeworkSchema>;

export const cancelHomeworkSchema = publishHomeworkSchema.extend({
  reason: z.string().trim().min(3).max(500),
});

export type CancelHomeworkDto = z.infer<typeof cancelHomeworkSchema>;
