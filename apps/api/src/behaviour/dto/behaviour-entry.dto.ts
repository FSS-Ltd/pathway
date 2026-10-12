import { z } from "zod";

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

export const behaviourCorrectionSchema = z
  .object(behaviourEntryFields)
  .strict()
  .superRefine(enforceTypeDelta);

const listLimit = z
  .string()
  .regex(/^(?:[1-9]|[1-9]\d|100)$/)
  .transform(Number)
  .optional();

export const behaviourListQuerySchema = z
  .object({
    childId: childId.optional(),
    type: type.optional(),
    occurredFrom: occurredAt.optional(),
    occurredTo: occurredAt.optional(),
    limit: listLimit,
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

export type CreateBehaviourEntryDto = z.infer<
  typeof createBehaviourEntrySchema
>;
export type BehaviourCorrectionDto = z.infer<typeof behaviourCorrectionSchema>;
export type BehaviourListQuery = z.infer<typeof behaviourListQuerySchema>;
