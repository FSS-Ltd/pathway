import { z } from "zod";
import { isDateOnly } from "../../ace-settings/dto/academic-calendar.dto";

export const familyDailyAttendanceQuerySchema = z
  .object({
    from: z
      .string()
      .refine(isDateOnly, "Use a valid date in YYYY-MM-DD format"),
    to: z.string().refine(isDateOnly, "Use a valid date in YYYY-MM-DD format"),
  })
  .strict()
  .refine(({ from, to }) => from <= to, {
    message: "from must be on or before to",
    path: ["to"],
  })
  .refine(
    ({ from, to }) =>
      (Date.parse(`${to}T00:00:00.000Z`) -
        Date.parse(`${from}T00:00:00.000Z`)) /
        86_400_000 <
      366,
    { message: "Select at most 366 days", path: ["to"] },
  );

export type FamilyDailyAttendanceQuery = z.infer<
  typeof familyDailyAttendanceQuerySchema
>;
