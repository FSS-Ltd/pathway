import { z } from "zod";

export const financeStripeConnectionStartSchema = z.object({
  legalEntityName: z.string().trim().min(1).max(255).optional(),
});

export type FinanceStripeConnectionStartInput = z.infer<
  typeof financeStripeConnectionStartSchema
>;
