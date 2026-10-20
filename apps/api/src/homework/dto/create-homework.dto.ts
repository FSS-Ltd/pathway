import { z } from "zod";

export const homeworkAssignmentIdSchema = z.string().uuid();

export const createHomeworkSchema = z.object({
  title: z.string().trim().min(1).max(160),
  instructions: z.string().trim().min(1).max(10000),
  academicYearId: z.string().uuid(),
  yearBandId: z.string().uuid(),
  subjectId: z.string().uuid(),
  dueAt: z.string().datetime({ offset: true }),
});

export type CreateHomeworkDto = z.infer<typeof createHomeworkSchema>;

export const updateHomeworkSchema = createHomeworkSchema.extend({
  version: z.number().int().positive(),
});

export type UpdateHomeworkDto = z.infer<typeof updateHomeworkSchema>;
