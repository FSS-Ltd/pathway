import { UnprocessableEntityException } from "@nestjs/common";
import {
  getFinanceCollectionAmountEligibility,
  type FinanceCollectionAmountEligibility,
  type FinanceCollectionMethod,
} from "@pathway/platform/finance-collection-amount";
import type { FinanceCurrency } from "@pathway/platform";
import { formatFinanceMoney } from "./finance-currency-format";

export function financeCollectionAmountMessage(
  method: FinanceCollectionMethod,
  currency: FinanceCurrency,
  eligibility: Extract<FinanceCollectionAmountEligibility, { eligible: false }>,
): string {
  if (eligibility.reason === "UNSUPPORTED_CURRENCY") {
    return "Bacs collection supports GBP invoices only.";
  }
  const label = method === "card" ? "Card payments" : "Bacs collections";
  if (eligibility.reason === "BELOW_MINIMUM") {
    return `${label} require at least ${formatFinanceMoney(eligibility.minimumMinor.toString(), currency)}. Choose another payment method for this amount.`;
  }
  return `${label} support up to ${formatFinanceMoney(eligibility.maximumMinor.toString(), currency)} per collection in NexSteps. Choose another payment method for this amount.`;
}

export function assertFinanceCollectionAmount(input: {
  method: FinanceCollectionMethod;
  currency: FinanceCurrency;
  amountMinor: bigint;
}): void {
  const eligibility = getFinanceCollectionAmountEligibility(input);
  if (eligibility.eligible) return;
  throw new UnprocessableEntityException({
    code: "FINANCE_COLLECTION_AMOUNT_UNSUPPORTED",
    method: input.method,
    reason: eligibility.reason,
    minimumMinor: eligibility.minimumMinor.toString(),
    maximumMinor: eligibility.maximumMinor.toString(),
    message: financeCollectionAmountMessage(
      input.method,
      input.currency,
      eligibility,
    ),
  });
}
