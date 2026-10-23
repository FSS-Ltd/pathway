import type { FinanceChargeProjection } from "./finance-settlement.projection";
export type FinanceChargeMatch =
  | "MATCHED"
  | "MISMATCH"
  | "UNMATCHED_MONEY"
  | "OBSERVED";
export function matchFinanceCharge(
  charge: Omit<FinanceChargeProjection, "account">,
  operation: { amountMinor: bigint; currency: string } | null,
): FinanceChargeMatch {
  if (operation)
    return operation.amountMinor === BigInt(charge.amount) &&
      operation.currency === charge.currency
      ? "MATCHED"
      : "MISMATCH";
  return charge.paid && charge.captured && charge.status === "succeeded"
    ? "UNMATCHED_MONEY"
    : "OBSERVED";
}
