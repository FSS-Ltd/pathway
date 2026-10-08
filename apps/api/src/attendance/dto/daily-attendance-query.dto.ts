import { z } from "zod";
import { isDateOnly } from "../../ace-settings/dto/academic-calendar.dto";

export const dailyAttendanceQuerySchema = z
  .object({
    date: z
      .string()
      .refine(isDateOnly, "Use a valid date in YYYY-MM-DD format"),
    bandId: z.string().trim().min(1).max(128).optional(),
    page: z.coerce.number().int().min(1).max(1_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export type DailyAttendanceQuery = z.infer<typeof dailyAttendanceQuerySchema>;
