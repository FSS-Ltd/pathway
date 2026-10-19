import { z } from "zod";

export const financeRefundRequestSchema = z
  .object({
    amountMinor: z.string().regex(/^(?:0|[1-9]\d*)$/),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export const financeRefundDecisionSchema = z
  .object({ reason: z.string().trim().min(1).max(500) })
  .strict();

export const financeManualRefundConfirmationSchema = z
  .object({
    bankTransactionReference: z.string().trim().min(1).max(255),
  })
  .strict();

export const financeManualRefundReturnRequestSchema = z
  .object({
    bankTransactionReference: z.string().trim().min(1).max(255),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export const financeRefundListQuerySchema = z
  .object({
    status: z
      .enum([
        "PENDING",
        "REJECTED",
        "APPROVED",
        "SUBMITTED",
        "CONFIRMED",
        "FAILED",
        "RETURNED",
      ])
      .optional(),
    receiptId: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export type FinanceRefundRequestInput = z.infer<
  typeof financeRefundRequestSchema
>;
export type FinanceRefundDecisionInput = z.infer<
  typeof financeRefundDecisionSchema
>;
export type FinanceManualRefundConfirmationInput = z.infer<
  typeof financeManualRefundConfirmationSchema
>;
export type FinanceManualRefundReturnRequestInput = z.infer<
  typeof financeManualRefundReturnRequestSchema
>;
export type FinanceRefundListQuery = z.infer<
  typeof financeRefundListQuerySchema
>;
