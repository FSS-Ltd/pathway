import type { Prisma } from "@pathway/db";
import {
  financeStatementSnapshotSchema,
  type FinanceStatementSnapshot,
} from "./finance-statement-snapshot-schema";

export type FinanceStatementRecord = Prisma.FinanceStatementGetPayload<
  Record<string, never>
>;

export function financeStatementDateKey(value: string | Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const values = new Map(parts.map(({ type, value: part }) => [type, part]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

export function toFinanceStatementView(statement: FinanceStatementRecord) {
  const snapshot = financeStatementSnapshotSchema.parse(statement.snapshot);
  return {
    id: statement.id,
    kind: statement.kind,
    status: statement.status,
    payerAccountId: statement.payerAccountId,
    periodStart: statement.periodStart.toISOString(),
    periodEnd: statement.periodEnd.toISOString(),
    generatedAt: statement.generatedAt.toISOString(),
    ledgerCutoffAt: statement.ledgerCutoffAt.toISOString(),
    readyAt: statement.readyAt?.toISOString() ?? null,
    currency: snapshot.currency,
    payerName: snapshot.payerName,
    legalEntityName: snapshot.legalEntityName,
    totals: snapshot.totals,
    documentSha256: statement.documentSha256,
    documentSizeBytes: statement.documentSizeBytes,
    lineCount: snapshot.lines.length,
  };
}

export function toFinanceStatementPdfInput(snapshot: FinanceStatementSnapshot) {
  const inclusivePeriodEnd = new Date(
    new Date(snapshot.periodEnd).getTime() - 1,
  ).toISOString();
  return {
    title: `Statement ${financeStatementDateKey(snapshot.periodStart)} to ${financeStatementDateKey(inclusivePeriodEnd)}`,
    legalEntityName: snapshot.legalEntityName,
    payerName: snapshot.payerName,
    reference: "Family account",
    generatedAt: snapshot.generatedAt,
    ledgerCutoffAt: snapshot.ledgerCutoffAt,
    periodStart: snapshot.periodStart,
    periodEnd: inclusivePeriodEnd,
    currency: snapshot.currency,
    totals: [
      {
        label: "Opening balance",
        amountMinor: snapshot.totals.openingBalanceMinor,
      },
      {
        label: "Charges issued",
        amountMinor: snapshot.totals.chargesIssuedMinor,
      },
      {
        label: "Credits issued",
        amountMinor: `-${snapshot.totals.creditsIssuedMinor}`,
      },
      {
        label: "Allocated receipts",
        amountMinor: `-${snapshot.totals.allocatedReceiptsMinor}`,
      },
      { label: "Reversals", amountMinor: snapshot.totals.reversalsMinor },
      {
        label: "Closing balance",
        amountMinor: snapshot.totals.closingBalanceMinor,
        emphasized: true,
      },
      {
        label: "Unapplied funds",
        amountMinor: snapshot.totals.unappliedFundsMinor,
      },
      {
        label: "Processing funds",
        amountMinor: snapshot.totals.processingFundsMinor,
      },
    ],
    lines: snapshot.lines.map((line) => ({
      date: line.date,
      description: `${line.reference} · ${line.description}`,
      amountMinor: line.amountMinor,
    })),
  };
}
