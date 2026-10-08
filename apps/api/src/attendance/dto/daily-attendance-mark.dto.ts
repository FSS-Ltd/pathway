import { z } from "zod";

export const dailyAttendanceMarkSchema = z
  .object({
    status: z.enum(["PRESENT", "ABSENT", "LATE"]),
    absenceReason: z
      .enum(["SICK", "HOLIDAY", "NOT_SCHEDULED", "EXCUSED", "UNEXCUSED"])
      .nullable()
      .optional(),
    correctionReason: z.string().trim().min(1).max(1_000).optional(),
  })
  .strict()
  .refine((mark) => mark.status !== "ABSENT" || Boolean(mark.absenceReason), {
    path: ["absenceReason"],
    message: "An absence reason is required",
  });

export type DailyAttendanceMark = z.infer<typeof dailyAttendanceMarkSchema>;
