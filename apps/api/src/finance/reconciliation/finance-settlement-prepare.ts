import { createHash } from "node:crypto";
import type { FinanceReconciliationScope } from "../stripe/finance-stripe-reconciliation.provider";
import {
  projectFinanceBalanceTransaction,
  type FinancePayoutProjection,
  type FinanceBalanceTransactionProjection,
} from "./finance-settlement.projection";

export interface FinancePayoutConstituentsReader {
  listPage(
    scope: FinanceReconciliationScope,
    payoutId: string,
    options: { startingAfter?: string; pageSize?: number },
  ): Promise<{ data: unknown[]; nextCursor: string | null }>;
}
export type FinancePayoutCoverageStatus =
  | "INCOMPLETE"
  | "MANUAL_UNSUPPORTED"
  | "CURRENCY_MISMATCH"
  | "PAYOUT_PENDING"
  | "MATCHED"
  | "DIFFERENCE";
export interface FinancePayoutCoverage {
  payoutDigest: string;
  cutoff: string;
  nextCursor: string | null;
  complete: boolean;
  status: FinancePayoutCoverageStatus;
  count: number;
  netMinor: string;
  currencies: string[];
}
export interface FinancePreparedPayoutSettlement extends FinancePayoutCoverage {
  previousDigest: string | null;
  constituents: Omit<FinanceBalanceTransactionProjection, "account">[];
}
export function settlementDigest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/** Bounded provider reads; pass persisted incomplete coverage to resume its fixed observation. */
export async function prepareFinancePayoutSettlement(
  provider: FinancePayoutConstituentsReader,
  scope: FinanceReconciliationScope,
  payout: Omit<FinancePayoutProjection, "account">,
  options: {
    maxPages?: number;
    previous?: FinancePayoutCoverage;
    observedAt?: Date;
  } = {},
): Promise<FinancePreparedPayoutSettlement> {
  const maxPages = options.maxPages ?? 1;
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 10)
    throw new Error("Invalid settlement page bound");
  const payoutDigest = settlementDigest(payout);
  const previous = options.previous;
  if (
    previous &&
    (previous.payoutDigest !== payoutDigest ||
      previous.complete ||
      previous.status !== "INCOMPLETE" ||
      !previous.nextCursor)
  )
    throw new Error("Payout continuation does not match its fixed observation");
  let nextCursor = previous?.nextCursor ?? null;
  let net = BigInt(previous?.netMinor ?? "0");
  let count = previous?.count ?? 0;
  const currencies = new Set(previous?.currencies ?? []);
  const constituents: FinancePreparedPayoutSettlement["constituents"] = [];
  const seen = new Set<string>(nextCursor ? [nextCursor] : []);
  const cutoff =
    previous?.cutoff ?? (options.observedAt ?? new Date()).toISOString();
  const previousDigest = previous ? settlementDigest(previous) : null;
  if (!payout.automatic)
    return {
      payoutDigest,
      previousDigest,
      cutoff,
      nextCursor: null,
      complete: false,
      status: "MANUAL_UNSUPPORTED",
      count: 0,
      netMinor: "0",
      currencies: [],
      constituents,
    };
  for (let page = 0; page < maxPages; page++) {
    const result = await provider.listPage(scope, payout.id, {
      ...(nextCursor ? { startingAfter: nextCursor } : {}),
      pageSize: 25,
    });
    if (
      result.data.length > 25 ||
      (result.nextCursor && result.data.length === 0)
    )
      throw new Error("Invalid payout constituent page");
    for (const raw of result.data) {
      const row = projectFinanceBalanceTransaction(scope, raw);
      if (seen.has(row.id) || row.id === payout.balance_transaction)
        throw new Error("Payout constituent identity conflicts");
      seen.add(row.id);
      currencies.add(row.currency);
      if (row.currency === payout.currency) net += BigInt(row.net);
      count++;
      constituents.push(row);
    }
    if (
      result.nextCursor &&
      result.nextCursor !== constituents[constituents.length - 1]?.id
    )
      throw new Error("Invalid payout constituent cursor");
    nextCursor = result.nextCursor;
    if (!nextCursor) break;
  }
  const complete = nextCursor === null;
  const status: FinancePayoutCoverageStatus = !complete
    ? "INCOMPLETE"
    : currencies.size > 1 ||
        (currencies.size === 1 && !currencies.has(payout.currency))
      ? "CURRENCY_MISMATCH"
      : payout.status !== "paid"
        ? "PAYOUT_PENDING"
        : net === BigInt(payout.amount)
          ? "MATCHED"
          : "DIFFERENCE";
  return {
    payoutDigest,
    previousDigest,
    cutoff,
    nextCursor,
    complete,
    status,
    count,
    netMinor: net.toString(),
    currencies: [...currencies].sort(),
    constituents,
  };
}
