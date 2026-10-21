import { z } from "zod";

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-01$/, "Use the first day of a month")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Use a valid calendar month");

const lineSchema = z
  .object({
    description: z.string().trim().min(1).max(200),
    quantity: z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/),
    unitAmountMinor: z.string().regex(/^(?:0|[1-9]\d*)$/),
    taxRateBasisPoints: z.number().int().min(0).max(100_000),
  })
  .strict();

export const financeRecurringInvoiceTemplateSchema = z
  .object({
    payerAccountId: z.string().uuid(),
    firstPeriodStart: dateOnlySchema,
    dayOfMonth: z.number().int().min(1).max(31),
    dueDays: z.number().int().min(1).max(90).default(14),
    lines: z.array(lineSchema).min(1).max(100),
  })
  .strict();

export const financeRecurringInvoiceTemplateStatusSchema = z
  .object({ status: z.enum(["ACTIVE", "PAUSED", "CANCELLED"]) })
  .strict();

export const financeRecurringInvoiceTemplateIdSchema = z.string().uuid();

export type FinanceRecurringInvoiceTemplateDraft = z.infer<
  typeof financeRecurringInvoiceTemplateSchema
>;
