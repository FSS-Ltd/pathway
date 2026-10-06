import { z } from "zod";

export const attendanceHistoryQuerySchema = z
  .object({
    limit: z
      .string()
      .regex(/^(?:[1-9]|[1-4]\d|50)$/)
      .transform(Number)
      .optional(),
    cursor: z.string().min(1).max(512).optional(),
  })
  .strict();

export type AttendanceHistoryQuery = z.infer<
  typeof attendanceHistoryQuerySchema
>;
