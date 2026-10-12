import { z } from "zod";
import { isDateOnly } from "../../ace-settings/dto/academic-calendar.dto";

const idempotencyKey = z.string().trim().min(1).max(128);
const childId = z.string().uuid();
const category = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a lowercase category code");
const type = z.enum(["MERIT", "DEMERIT", "GENERAL"]);
const visibility = z.enum(["GENERAL", "SENSITIVE"]);
const pointsDelta = z.number().int().min(-10_000).max(10_000);
const occurredAt = z.string().datetime({ offset: true });
const reason = z.string().trim().min(1).max(1_000);
const note = z.string().trim().min(1).max(4_000).optional();

const behaviourEntryFields = {
  idempotencyKey,
  childId,
  category,
  type,
  visibility,
  pointsDelta,
  occurredAt,
  reason,
  note,
};

function enforceTypeDelta(
  value: { type: z.infer<typeof type>; pointsDelta: number },
  context: z.RefinementCtx,
): void {
  const isValid =
    (value.type === "MERIT" && value.pointsDelta > 0) ||
    (value.type === "DEMERIT" && value.pointsDelta < 0) ||
    (value.type === "GENERAL" && value.pointsDelta === 0);
  if (!isValid) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["pointsDelta"],
      message:
        "Merit points must be positive, Demerit points negative, and General points zero",
    });
  }
}

export const createBehaviourEntrySchema = z
  .object(behaviourEntryFields)
  .strict()
  .superRefine(enforceTypeDelta);

const behaviourBatchRowSchema = z
  .object({
    category,
    type,
    visibility,
    pointsDelta,
    reason,
    note,
    quantity: z.number().int().min(1).max(50),
  })
  .strict()
  .superRefine(enforceTypeDelta);

export const createBehaviourBatchSchema = z
  .object({
    idempotencyKey,
    childIds: z.array(childId).min(1).max(50),
    occurredAt,
    entries: z.array(behaviourBatchRowSchema).min(1).max(50),
  })
  .strict()
  .superRefine((batch, context) => {
    if (new Set(batch.childIds).size !== batch.childIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["childIds"],
        message: "Learners must be unique",
      });
    }
    const factCount =
      batch.childIds.length *
      batch.entries.reduce((total, entry) => total + entry.quantity, 0);
    if (factCount > 50) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entries"],
        message: "A batch can create at most 50 behaviour facts",
      });
    }
  });

export const behaviourCorrectionSchema = z
  .object({
    ...behaviourEntryFields,
    // Older mobile clients retain the original command shape.
    correctionReason: reason.optional(),
  })
  .strict()
  .superRefine(enforceTypeDelta);

export const behaviourRetractionSchema = z
  .object({ idempotencyKey, reason })
  .strict();

const listLimit = z
  .string()
  .regex(/^(?:[1-9]|[1-9]\d|100)$/)
  .transform(Number)
  .optional();

export const behaviourListQuerySchema = z
  .object({
    childId: childId.optional(),
    type: type.optional(),
    visibility: z.enum(["GENERAL", "SENSITIVE", "ALL"]).optional(),
    occurredFrom: occurredAt.optional(),
    occurredTo: occurredAt.optional(),
    limit: listLimit,
    cursor: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,512}$/)
      .optional(),
  })
  .strict()
  .superRefine((query, context) => {
    if (
      query.occurredFrom &&
      query.occurredTo &&
      Date.parse(query.occurredFrom) > Date.parse(query.occurredTo)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["occurredTo"],
        message: "occurredTo must not be earlier than occurredFrom",
      });
    }
  });

export const behaviourTrendsQuerySchema = z
  .object({
    from: z
      .string()
      .refine(isDateOnly, "Use a valid date in YYYY-MM-DD format"),
    to: z.string().refine(isDateOnly, "Use a valid date in YYYY-MM-DD format"),
    bucket: z.enum(["daily", "weekly", "monthly"]),
    visibility: z.enum(["GENERAL", "SENSITIVE", "ALL"]),
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

export type CreateBehaviourEntryDto = z.infer<
  typeof createBehaviourEntrySchema
>;
export type CreateBehaviourBatchDto = z.infer<
  typeof createBehaviourBatchSchema
>;
export type BehaviourCorrectionDto = z.infer<typeof behaviourCorrectionSchema>;
export type BehaviourRetractionDto = z.infer<typeof behaviourRetractionSchema>;
export type BehaviourListQuery = z.infer<typeof behaviourListQuerySchema>;
export type BehaviourTrendsQuery = z.infer<typeof behaviourTrendsQuerySchema>;
