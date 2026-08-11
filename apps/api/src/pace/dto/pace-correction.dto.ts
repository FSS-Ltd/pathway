import { z } from "zod";

const scopedPaceCommandFields = {
  childId: z.string().uuid(),
  subjectId: z.string().uuid(),
  reason: z.string().trim().min(1).max(1_000),
};

export const paceAssessmentCorrectionSchema = z
  .object({
    ...scopedPaceCommandFields,
    paceNumber: z.number().int(),
    assessmentType: z.enum(["SelfTest", "FinalTest"]),
    score: z.number().int().min(0).max(100),
    assessedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const pacePolicyOverrideSchema = z
  .object({
    ...scopedPaceCommandFields,
    policyCode: z.enum([
      "score-below-threshold",
      "daily-limit",
      "duplicate-self-test",
      "same-pace-same-day",
      "progression-blocked",
      "override-required",
    ]),
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type PaceAssessmentCorrectionDto = z.infer<
  typeof paceAssessmentCorrectionSchema
>;

export type PacePolicyOverrideDto = z.infer<typeof pacePolicyOverrideSchema>;
