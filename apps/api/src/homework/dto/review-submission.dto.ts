import { z } from "zod";

export const reviewSubmissionSchema = z
  .object({
    versionId: z.string().uuid(),
    decision: z.enum(["RETURNED", "COMPLETED"]),
    feedback: z.string().trim().max(2000),
    staffNote: z.string().trim().max(2000),
    idempotencyKey: z.string().uuid(),
  })
  .strict()
  .refine(
    (value) => value.decision !== "RETURNED" || value.feedback.length > 0,
    {
      message: "Feedback is required when returning homework",
      path: ["feedback"],
    },
  );

export type ReviewSubmissionDto = z.infer<typeof reviewSubmissionSchema>;
