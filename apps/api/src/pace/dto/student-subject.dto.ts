import { z } from "zod";

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

export function isDateOnly(value: string): boolean {
  if (!dateOnlyPattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export const createStudentSubjectSchema = z
  .object({
    subjectId: z.string().uuid(),
    startsOn: z
      .string()
      .refine(isDateOnly, "Use a valid date in YYYY-MM-DD format"),
    startingPace: z.number().int(),
    currentPace: z.number().int(),
    targetPace: z.number().int(),
    reason: z.string().trim().min(1).max(1_000),
    replacesEnrollmentId: z.string().uuid().optional(),
  })
  .strict();

export type CreateStudentSubjectDto = z.infer<
  typeof createStudentSubjectSchema
>;
