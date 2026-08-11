import { z } from "zod";

export const createPaceAssessmentSchema = z
  .object({
    idempotencyKey: z.string().trim().min(1).max(128),
    childId: z.string().uuid(),
    subjectId: z.string().uuid(),
    paceNumber: z.number().int(),
    assessmentType: z.enum(["SelfTest", "FinalTest"]),
    score: z.number().int().min(0).max(100),
    assessedAt: z.string().datetime({ offset: true }),
    reason: z.string().trim().min(1).max(1_000),
  })
  .strict();

export type CreatePaceAssessmentDto = z.infer<
  typeof createPaceAssessmentSchema
>;
