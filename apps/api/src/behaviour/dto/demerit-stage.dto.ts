import { z } from "zod";

const childId = z.string().uuid();
const localDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) =>
      !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
      new Date(`${value}T00:00:00Z`).toISOString().startsWith(value),
    "Invalid date",
  );

export const demeritStatusQuerySchema = z.object({ date: localDate }).strict();

export const demeritOverrideSchema = z
  .object({
    childId,
    stage: z.number().int().min(1).max(3),
    expectedPolicyVersion: z.number().int().positive(),
    reason: z.string().trim().min(1).max(1_000),
    idempotencyKey: z.string().trim().min(1).max(128),
  })
  .strict();

export const reviewRequestsQuerySchema = z
  .object({
    childId: childId.optional(),
    cursor: z.string().uuid().optional(),
    limit: z
      .string()
      .regex(/^(?:[1-9]|[1-9]\d|100)$/)
      .transform(Number)
      .optional(),
  })
  .strict();

export type DemeritOverrideDto = z.infer<typeof demeritOverrideSchema>;
export type ReviewRequestsQuery = z.infer<typeof reviewRequestsQuerySchema>;
