import { z } from "zod";
import { FINANCE_CURRENCIES } from "@pathway/platform";

const signedMinorUnitSchema = z.string().regex(/^-?(?:0|[1-9]\d*)$/);
const nonNegativeMinorUnitSchema = z.string().regex(/^(?:0|[1-9]\d*)$/);

export const financeStatementLineSchema = z.object({
  date: z.string().datetime(),
  reference: z.string(),
  description: z.string(),
  amountMinor: signedMinorUnitSchema,
});

export const financeStatementSnapshotSchema = z.object({
  version: z.literal(1),
  currency: z.enum(FINANCE_CURRENCIES),
  payerName: z.string(),
  legalEntityName: z.string(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  generatedAt: z.string().datetime(),
  ledgerCutoffAt: z.string().datetime(),
  totals: z.object({
    openingBalanceMinor: signedMinorUnitSchema,
    chargesIssuedMinor: nonNegativeMinorUnitSchema,
    creditsIssuedMinor: nonNegativeMinorUnitSchema,
    allocatedReceiptsMinor: nonNegativeMinorUnitSchema,
    reversalsMinor: signedMinorUnitSchema,
    closingBalanceMinor: signedMinorUnitSchema,
    unappliedFundsMinor: nonNegativeMinorUnitSchema,
    processingFundsMinor: nonNegativeMinorUnitSchema,
  }),
  lines: z.array(financeStatementLineSchema),
});

export type FinanceStatementSnapshot = z.infer<
  typeof financeStatementSnapshotSchema
>;
export type FinanceStatementLine = z.infer<typeof financeStatementLineSchema>;
export type FinanceStatementScope = { tenantId: string; orgId: string };
