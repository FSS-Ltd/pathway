import { z } from "zod";

const positiveAmountMinorSchema = z
  .string()
  .regex(/^[1-9]\d*$/, "Use a positive integer amount in currency minor units");

export const financeReceiptListQuerySchema = z
  .object({
    status: z.enum(["PROCESSING", "CONFIRMED", "FAILED"]).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const financeReceiptAllocationSchema = z
  .object({
    invoiceId: z.string().uuid(),
    amountMinor: positiveAmountMinorSchema,
  })
  .strict();

export const financeReceiptReversalSchema = z
  .object({
    amountMinor: positiveAmountMinorSchema,
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export type FinanceReceiptListQuery = z.infer<
  typeof financeReceiptListQuerySchema
>;
export type FinanceReceiptAllocationInput = z.infer<
  typeof financeReceiptAllocationSchema
>;
export type FinanceReceiptReversalInput = z.infer<
  typeof financeReceiptReversalSchema
>;
