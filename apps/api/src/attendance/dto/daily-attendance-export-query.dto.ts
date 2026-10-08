import { z } from "zod";
import { isDateOnly } from "../../ace-settings/dto/academic-calendar.dto";

export const MAX_DAILY_EXPORT_DAYS = 31;

export const dailyAttendanceExportQuerySchema = z
  .object({
    from: z
      .string()
      .refine(isDateOnly, "Use a valid start date in YYYY-MM-DD format"),
    to: z
      .string()
      .refine(isDateOnly, "Use a valid end date in YYYY-MM-DD format"),
    childId: z.string().uuid().optional(),
  })
  .strict()
  .superRefine(({ from, to }, context) => {
    if (!isDateOnly(from) || !isDateOnly(to)) return;
    const days =
      (Date.parse(`${to}T00:00:00.000Z`) -
        Date.parse(`${from}T00:00:00.000Z`)) /
        86_400_000 +
      1;
    if (days < 1 || days > MAX_DAILY_EXPORT_DAYS) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["to"],
        message: `Date range must span 1 to ${MAX_DAILY_EXPORT_DAYS} days`,
      });
    }
  });

export type DailyAttendanceExportQuery = z.infer<
  typeof dailyAttendanceExportQuerySchema
>;
