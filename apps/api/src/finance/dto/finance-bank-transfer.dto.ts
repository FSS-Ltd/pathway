import { z } from "zod";

export const financeBankTransferChangeSchema = z
  .object({
    accountHolderName: z.string().trim().min(1).max(100),
    sortCode: z
      .string()
      .trim()
      .regex(/^(?:\d{6}|\d{2}-\d{2}-\d{2})$/),
    accountNumber: z
      .string()
      .trim()
      .regex(/^\d{8}$/),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export const financeBankTransferDecisionSchema = z
  .object({ reason: z.string().trim().min(1).max(500) })
  .strict();

export const financeBankTransferChangeListQuerySchema = z
  .object({
    status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export type FinanceBankTransferChangeInput = z.infer<
  typeof financeBankTransferChangeSchema
>;
export type FinanceBankTransferDecisionInput = z.infer<
  typeof financeBankTransferDecisionSchema
>;
export type FinanceBankTransferChangeListQuery = z.infer<
  typeof financeBankTransferChangeListQuerySchema
>;
