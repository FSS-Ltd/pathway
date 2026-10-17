import { z } from "zod";

const amountMinorSchema = z
  .string()
  .regex(/^[1-9]\d*$/, "Use a positive integer amount in pence");

const isoDateTimeSchema = z.string().datetime({ offset: true });
const bankTransactionReferenceSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine(
    (reference) => !containsControlCharacters(reference),
    "Remove control characters from the bank transaction reference",
  );

export const financeTransferNoticeSchema = z
  .object({
    amountMinor: amountMinorSchema,
    declaredTransferredAt: isoDateTimeSchema,
  })
  .strict();

export const financeManualReceiptRequestSchema = z
  .object({
    payerAccountId: z.string().uuid(),
    transferNoticeId: z.string().uuid().optional(),
    bankTransactionReference: bankTransactionReferenceSchema,
    amountMinor: amountMinorSchema,
    receivedAt: isoDateTimeSchema,
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export const financeManualReceiptDecisionSchema = z
  .object({ reason: z.string().trim().min(1).max(500) })
  .strict();

export const financeManualReceiptRequestListQuerySchema = z
  .object({
    status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const financeTransferNoticeListQuerySchema = z
  .object({ limit: z.coerce.number().int().min(1).max(100).default(50) })
  .strict();

export type FinanceTransferNoticeInput = z.infer<
  typeof financeTransferNoticeSchema
>;
export type FinanceManualReceiptRequestInput = z.infer<
  typeof financeManualReceiptRequestSchema
>;
export type FinanceManualReceiptDecisionInput = z.infer<
  typeof financeManualReceiptDecisionSchema
>;
export type FinanceManualReceiptRequestListQuery = z.infer<
  typeof financeManualReceiptRequestListQuerySchema
>;
export type FinanceTransferNoticeListQuery = z.infer<
  typeof financeTransferNoticeListQuerySchema
>;

function containsControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint < 0x20 || codePoint === 0x7f);
  });
}
