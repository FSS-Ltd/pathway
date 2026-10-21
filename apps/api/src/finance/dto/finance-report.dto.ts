import { z } from "zod";

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const financeReportTypeSchema = z.enum([
  "receivables-ageing",
  "receipts-allocation",
  "exceptions",
  "payout-reconciliation",
]);

export const financeReportFiltersSchema = z
  .object({
    from: dateKey,
    to: dateKey,
    asOf: dateKey,
  })
  .strict()
  .superRefine((value, context) => {
    const start = parseDateKey(value.from);
    const end = parseDateKey(value.to);
    const asOf = parseDateKey(value.asOf);
    if (!start || !end || !asOf) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Report dates must be valid calendar dates",
      });
      return;
    }
    if (value.from > value.to) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["to"],
        message: "The report end date must be on or after its start date",
      });
    }
    if ((end.getTime() - start.getTime()) / 86_400_000 > 366) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["to"],
        message: "Report periods cannot exceed 367 calendar days",
      });
    }
  });

export type FinanceReportType = z.infer<typeof financeReportTypeSchema>;
export type FinanceReportFilters = z.infer<typeof financeReportFiltersSchema>;

function parseDateKey(value: string): Date | null {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
    ? null
    : parsed;
}
