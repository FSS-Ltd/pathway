import { z } from "zod";

export const financeCaseListSchema = z.object({
  status: z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED"]).optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export const financeCaseActionSchema = z.object({
  expectedLastSeenAt: z.string().datetime(),
  reason: z.string().trim().min(3).max(500),
  requestId: z.string().uuid(),
  evidenceId: z.string().uuid().optional(),
});
export type FinanceCaseAction = z.infer<typeof financeCaseActionSchema>;
export type FinanceCaseList = z.infer<typeof financeCaseListSchema>;
