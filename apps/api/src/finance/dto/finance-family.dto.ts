import { z } from "zod";

export const financeFamilyInvoiceListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().uuid().optional(),
  })
  .strict();

export type FinanceFamilyInvoiceListQuery = z.infer<
  typeof financeFamilyInvoiceListQuerySchema
>;
