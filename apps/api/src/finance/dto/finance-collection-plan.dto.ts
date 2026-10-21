import { z } from "zod";

export const financeCollectionPlanDraftSchema = z.object({
  payerAccountId: z.string().uuid(),
  mandateId: z.string().uuid(),
  instalmentCount: z.number().int().min(1).max(12),
  firstDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type FinanceCollectionPlanDraft = z.infer<
  typeof financeCollectionPlanDraftSchema
>;
