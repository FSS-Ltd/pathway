import { z } from "zod";

const nonNegativeVersion = z.number().int().min(0);

const behaviourCategorySchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a lowercase category code"),
    label: z.string().trim().min(1).max(120),
    type: z.enum(["MERIT", "DEMERIT", "GENERAL"]),
    visibility: z.enum(["GENERAL", "SENSITIVE"]),
    isActive: z.boolean(),
    isSerious: z.boolean(),
    sortOrder: z.number().int().min(0),
  })
  .strict()
  .superRefine((category, context) => {
    if (category.isSerious && category.type !== "DEMERIT") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["isSerious"],
        message: "Only Demerit categories can be serious",
      });
    }
  });

const demeritPolicySchema = z
  .object({
    windowDays: z.number().int().positive(),
    stageOneThreshold: z.number().int().positive(),
    stageTwoThreshold: z.number().int().positive(),
    stageThreeThreshold: z.number().int().positive(),
    seriousMisconductStage: z.number().int().min(1).max(3),
  })
  .strict()
  .superRefine((policy, context) => {
    if (policy.stageTwoThreshold <= policy.stageOneThreshold) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["stageTwoThreshold"],
        message: "stageTwoThreshold must be greater than stageOneThreshold",
      });
    }
    if (policy.stageThreeThreshold <= policy.stageTwoThreshold) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["stageThreeThreshold"],
        message: "stageThreeThreshold must be greater than stageTwoThreshold",
      });
    }
  });

export const updateBehaviourPolicySchema = z
  .object({
    reason: z.string().trim().min(1).max(1_000),
    expectedCategoryVersion: nonNegativeVersion,
    expectedDemeritPolicyVersion: nonNegativeVersion,
    categories: z.array(behaviourCategorySchema).min(1).max(200),
    demeritPolicy: demeritPolicySchema,
  })
  .strict()
  .superRefine((policy, context) => {
    const codes = new Set<string>();
    const sortOrders = new Set<number>();

    policy.categories.forEach((category, index) => {
      if (codes.has(category.code)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["categories", index, "code"],
          message: "Category codes must be unique",
        });
      }
      if (sortOrders.has(category.sortOrder)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["categories", index, "sortOrder"],
          message: "Category sort orders must be unique",
        });
      }
      codes.add(category.code);
      sortOrders.add(category.sortOrder);
    });
  });

export type UpdateBehaviourPolicyDto = z.infer<
  typeof updateBehaviourPolicySchema
>;
export type BehaviourCategoryDto =
  UpdateBehaviourPolicyDto["categories"][number];
