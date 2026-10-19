import { z } from "zod";

const quantitySchema = z
  .string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/, "Use up to three decimal places");

const amountMinorSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d*)$/, "Use an integer amount in currency minor units");

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date in YYYY-MM-DD format")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  }, "Use a valid calendar date");

const invoiceLineSchema = z
  .object({
    description: z.string().trim().min(1).max(200),
    quantity: quantitySchema,
    unitAmountMinor: amountMinorSchema,
    taxRateBasisPoints: z.number().int().min(0).max(100_000),
  })
  .strict();

export const financeInvoiceDraftSchema = z
  .object({
    payerAccountId: z.string().uuid(),
    dueDate: dateOnlySchema.nullable(),
    lines: z.array(invoiceLineSchema).min(1).max(100),
  })
  .strict();

export const financeInvoiceListQuerySchema = z
  .object({
    status: z.enum(["DRAFT", "IN_REVIEW", "ISSUED", "VOID"]).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const financeInvoiceIdSchema = z.string().uuid();

export const financeRequestChangesSchema = z
  .object({ reason: z.string().trim().min(1).max(500) })
  .strict();

export const financeVoidInvoiceSchema = z
  .object({ reason: z.string().trim().min(1).max(500) })
  .strict();

export const financeIdempotencyKeySchema = z
  .string()
  .trim()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/, "Invalid Idempotency-Key header");

export type FinanceInvoiceDraftInput = z.infer<
  typeof financeInvoiceDraftSchema
>;
export type FinanceInvoiceListQuery = z.infer<
  typeof financeInvoiceListQuerySchema
>;
export type FinanceRequestChangesInput = z.infer<
  typeof financeRequestChangesSchema
>;
export type FinanceVoidInvoiceInput = z.infer<typeof financeVoidInvoiceSchema>;
