import {
  projectFinanceBalanceTransaction,
  projectFinancePayout,
} from "./finance-settlement.projection";
import { payoutCoverageSchema } from "./finance-settlement.repository";
import { settlementDigest } from "./finance-settlement-prepare";
import type {
  FinanceSettlementReportInput,
  FinanceSettlementReport,
} from "./finance-settlement-report.types";

const FRESH_FOR_MS = 36 * 60 * 60 * 1000;

/** Freshness describes saved reads; earliest historical coverage remains explicitly unproven. */
export function projectFinanceSettlementReport(
  input: FinanceSettlementReportInput,
): FinanceSettlementReport {
  const scope = {
    stripeAccountId: input.connection.accountId,
    livemode: input.connection.livemode,
  };
  const fees = new Map<string, bigint>();
  const observationTimes: number[] = [];
  for (const row of input.balanceEvidence) {
    const facts = projectFinanceBalanceTransaction(scope, row.facts);
    fees.set(
      facts.currency,
      (fees.get(facts.currency) ?? 0n) + BigInt(facts.fee),
    );
    observationTimes.push(row.observedAt.getTime());
  }
  const payouts = input.payoutEvidence.map((row) => {
    const facts = projectFinancePayout(scope, row.payoutFacts);
    const coverage = payoutCoverageSchema.parse(row.coverage);
    if (coverage.payoutDigest !== settlementDigest(facts))
      throw new Error(
        "Payout report evidence does not match its fixed observation",
      );
    observationTimes.push(row.updatedAt.getTime());
    return {
      id: facts.id,
      amountMinor: String(facts.amount),
      currency: facts.currency,
      createdAt: new Date(facts.created * 1000).toISOString(),
      arrivalAt: new Date(facts.arrival_date * 1000).toISOString(),
      status: facts.status,
      balanceTransactionId: facts.balance_transaction,
      reconciliationStatus: coverage.status,
      complete: coverage.complete,
      netMinor: coverage.netMinor,
    };
  });
  for (const stream of input.streams)
    if (stream.lastSucceededAt)
      observationTimes.push(stream.lastSucceededAt.getTime());
  const latest = observationTimes.length ? Math.max(...observationTimes) : null;
  return {
    status: "CONNECTED",
    source: "PERSISTED_RECONCILIATION",
    context: input.connection,
    fetchedAt: latest === null ? null : new Date(latest).toISOString(),
    freshness: reportFreshness(input),
    periodStartCoverage: "UNPROVEN",
    truncated: input.truncated,
    coverage: input.streams.map((row) => ({
      stream: row.stream,
      completedThrough: row.completedThrough?.toISOString() ?? null,
      lastSucceededAt: row.lastSucceededAt?.toISOString() ?? null,
      lastError: row.lastError,
    })),
    feesByCurrency: [...fees]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currency, amount]) => ({
        currency,
        amountMinor: amount.toString(),
      })),
    payouts,
  };
}

function reportFreshness(
  input: FinanceSettlementReportInput,
): FinanceSettlementReport["freshness"] {
  const streams = ["balanceTransactions", "payouts"].map((name) =>
    input.streams.find((row) => row.stream === name),
  );
  if (streams.some((row) => !row?.lastSucceededAt || !row.completedThrough))
    return "NOT_SYNCED";
  if (
    input.truncated ||
    streams.some((row) => row?.lastError || row?.windowFrom || row?.windowTo)
  )
    return "INCOMPLETE";
  if (
    streams.some(
      (row) =>
        row?.lastSucceededAt &&
        input.generatedAt.getTime() - row.lastSucceededAt.getTime() >
          FRESH_FOR_MS,
    )
  )
    return "STALE";
  if (
    streams.some(
      (row) =>
        (row?.completedThrough && row.completedThrough < input.periodEnd) ||
        (row?.lastSucceededAt && row.lastSucceededAt > input.generatedAt),
    )
  )
    return "INCOMPLETE";
  return "CURRENT";
}
