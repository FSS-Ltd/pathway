import { z } from "zod";

const uuid = z.string().uuid();
const date = z.coerce.date();

export const createSubjectSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    category: z.string().trim().min(1).max(120).optional(),
    color: z.string().trim().min(1).max(32).optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .strict();

export const createLearningLogSchema = z
  .object({
    childId: uuid,
    subjectId: uuid.optional(),
    activityDate: date,
    minutes: z.number().int().positive().max(24 * 60).optional(),
    title: z.string().trim().min(1).max(240),
    description: z.string().trim().min(1).max(10_000).optional(),
  })
  .strict();

export const createEvidenceSchema = z
  .object({
    childId: uuid,
    learningLogId: uuid.optional(),
    title: z.string().trim().min(1).max(240),
    storageKey: z.string().trim().min(1).max(1_024),
    mimeType: z.string().trim().min(1).max(255),
    byteSize: z.number().int().nonnegative(),
    capturedAt: date.optional(),
  })
  .strict();

export const createReportBundleSchema = z
  .object({
    childId: uuid.optional(),
    periodStart: date,
    periodEnd: date,
  })
  .strict()
  .superRefine(({ periodStart, periodEnd }, context) => {
    if (periodEnd < periodStart) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["periodEnd"],
        message: "periodEnd must not be before periodStart",
      });
    }
  });

export type CreateSubjectDto = z.infer<typeof createSubjectSchema>;
export type CreateLearningLogDto = z.infer<typeof createLearningLogSchema>;
export type CreateEvidenceDto = z.infer<typeof createEvidenceSchema>;
export type CreateReportBundleDto = z.infer<
  typeof createReportBundleSchema
>;
