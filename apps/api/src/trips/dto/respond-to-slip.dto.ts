import { z } from "zod";
import { tripSlipIdSchema } from "../trip-slip.dto";

const answerSchema = z
  .object({
    questionId: tripSlipIdSchema,
    answer: z.string().trim().min(1).max(1000),
  })
  .strict();

export const respondToSlipSchema = z
  .object({
    childId: tripSlipIdSchema,
    expectedVersionId: tripSlipIdSchema,
    expectedVersionHash: z.string().regex(/^[a-f0-9]{64}$/),
    decision: z.enum(["ACCEPTED", "DECLINED"]),
    typedName: z.string().trim().min(1).max(160),
    signatureAcknowledged: z.literal(true),
    answers: z
      .array(answerSchema)
      .max(20)
      .refine(
        (answers) =>
          new Set(answers.map((answer) => answer.questionId)).size ===
          answers.length,
        { message: "Answer each question once" },
      ),
    idempotencyKey: tripSlipIdSchema,
  })
  .strict();

export type RespondToSlipInput = z.infer<typeof respondToSlipSchema>;
