import { z } from "zod";

const nonNegativeVersion = z.number().int().min(0);

export const pacePolicyChangeSchema = z
  .object({
    selfTestPassingScore: z.number().int().min(0).max(100),
    paceTestPassingScore: z.number().int().min(0).max(100),
    maxAssessmentsPerDay: z.number().int().positive(),
    allowSamePaceSameDay: z.boolean(),
  })
  .strict();

export const demeritPolicyChangeSchema = z
  .object({
    windowDays: z.number().int().positive(),
    stageOneThreshold: z.number().int().positive(),
    stageTwoThreshold: z.number().int().positive(),
    stageThreeThreshold: z.number().int().positive(),
    seriousMisconductStage: z.number().int().min(1).max(3),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.stageTwoThreshold <= value.stageOneThreshold) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["stageTwoThreshold"],
        message: "stageTwoThreshold must be greater than stageOneThreshold",
      });
    }
    if (value.stageThreeThreshold <= value.stageTwoThreshold) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["stageThreeThreshold"],
        message: "stageThreeThreshold must be greater than stageTwoThreshold",
      });
    }
  });

const communityFeatureChangeSchema = z
  .object({
    enabled: z.boolean(),
    expectedUpdatedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();

export const updateAceSettingsSchema = z
  .object({
    reason: z.string().trim().min(1).max(1_000),
    expectedPacePolicyVersion: nonNegativeVersion,
    expectedDemeritPolicyVersion: nonNegativeVersion,
    pacePolicy: pacePolicyChangeSchema.optional(),
    demeritPolicy: demeritPolicyChangeSchema.optional(),
    features: z
      .object({
        "ace.student_community": communityFeatureChangeSchema,
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.pacePolicy && !value.demeritPolicy && !value.features) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one ACE setting must be changed",
      });
    }
  });

export type UpdateAceSettingsDto = z.infer<typeof updateAceSettingsSchema>;
