import { z } from "zod";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isDateOnly(value: string): boolean {
  if (!DATE_ONLY_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

const dateOnlySchema = z
  .string()
  .refine(isDateOnly, "Use a valid date in YYYY-MM-DD format");

const academicPeriodSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    startsOn: dateOnlySchema,
    endsOn: dateOnlySchema,
  })
  .strict()
  .superRefine((period, context) => {
    if (period.endsOn < period.startsOn) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endsOn"],
        message: "A period must end on or after its start date",
      });
    }
  });

export const createAcademicYearSchema = z
  .object({
    reason: z.string().trim().min(1).max(1_000),
    name: z.string().trim().min(1).max(200),
    startsOn: dateOnlySchema,
    endsOn: dateOnlySchema,
    periods: z.array(academicPeriodSchema).min(1),
  })
  .strict()
  .superRefine((year, context) => {
    if (year.endsOn < year.startsOn) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endsOn"],
        message: "An academic year must end on or after its start date",
      });
    }
  });

export type CreateAcademicYearDto = z.infer<typeof createAcademicYearSchema>;
