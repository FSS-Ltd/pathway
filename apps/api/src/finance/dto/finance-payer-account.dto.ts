import { z } from "zod";
import { financeIdempotencyKeySchema } from "./finance-invoice.dto";

export const financePayerAccountListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(100),
    cursor: z.string().uuid().optional(),
  })
  .strict();

export const financePayerAccountCreateSchema = z
  .object({
    displayName: z.string().trim().min(1).max(255),
  })
  .strict();

export const financePayerAccountIdempotencyKeySchema =
  financeIdempotencyKeySchema;

export type FinancePayerAccountCreateInput = z.infer<
  typeof financePayerAccountCreateSchema
>;
export type FinancePayerAccountListQuery = z.infer<
  typeof financePayerAccountListQuerySchema
>;
