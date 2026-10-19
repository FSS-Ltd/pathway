import { z } from "zod";

const isoDateTimeWithOffset = z.string().datetime({ offset: true });
const periodFields = {
  periodStart: isoDateTimeWithOffset,
  periodEnd: isoDateTimeWithOffset,
};
const periodWindow = (
  value: { periodStart: string; periodEnd: string },
  context: z.RefinementCtx,
) => {
  const start = new Date(value.periodStart);
  const end = new Date(value.periodEnd);
  if (end <= start) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["periodEnd"],
      message: "Statement end must follow its start",
    });
  }
  if (end.getTime() > Date.now()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["periodEnd"],
      message: "Statement end cannot be in the future",
    });
  }
  if (end.getTime() - start.getTime() > 366 * 24 * 60 * 60 * 1000) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["periodEnd"],
      message: "Statement periods cannot exceed 366 days",
    });
  }
};

export const financeStatementRequestSchema = z
  .object({ payerAccountId: z.string().uuid(), ...periodFields })
  .strict()
  .superRefine(periodWindow);

export const financePayerStatementRequestSchema = z
  .object(periodFields)
  .strict()
  .superRefine(periodWindow);

export const financeStatementListQuerySchema = z
  .object({
    payerAccountId: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const financeStatementMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use a month in YYYY-MM format");

export const financeStatementMonthEndJobSchema = z
  .object({ month: financeStatementMonthSchema })
  .strict();

export const financeStatementIdSchema = z.string().uuid();

export type FinanceStatementRequestInput = z.infer<
  typeof financeStatementRequestSchema
>;
export type FinancePayerStatementRequestInput = z.infer<
  typeof financePayerStatementRequestSchema
>;
export type FinanceStatementListQuery = z.infer<
  typeof financeStatementListQuerySchema
>;
