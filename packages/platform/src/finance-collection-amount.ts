import type { FinanceCurrency } from "./finance-currencies";

export type FinanceCollectionMethod = "card" | "bacs";
export type FinanceCollectionAmountReason =
  | "BELOW_MINIMUM"
  | "ABOVE_MAXIMUM"
  | "UNSUPPORTED_CURRENCY";

interface FinanceCollectionAmountBounds {
  minimumMinor: bigint;
  maximumMinor: bigint;
}

export type FinanceCollectionAmountEligibility = FinanceCollectionAmountBounds &
  (
    | { eligible: true }
    | { eligible: false; reason: FinanceCollectionAmountReason }
  );

const cardMinimumMinor = {
  GBP: 30n,
  EUR: 50n,
  CZK: 1500n,
  DKK: 250n,
  HUF: 17500n,
  PLN: 200n,
  RON: 200n,
  SEK: 300n,
} satisfies Record<FinanceCurrency, bigint>;

/** NexSteps supported collection bounds, not universal processor maxima or
 * account-specific approval. Bacs retains its own £0.01 minimum and conservative
 * £10,000 product limit; card's supported maximum is eight minor-unit digits.
 * These limits never change invoice debt or manual receipt amounts.
 */
export function getFinanceCollectionAmountEligibility(input: {
  method: FinanceCollectionMethod;
  currency: FinanceCurrency;
  amountMinor: bigint;
}): FinanceCollectionAmountEligibility {
  const bounds =
    input.method === "card"
      ? {
          minimumMinor: cardMinimumMinor[input.currency],
          maximumMinor: 99_999_999n,
        }
      : { minimumMinor: 1n, maximumMinor: 1_000_000n };
  if (input.method === "bacs" && input.currency !== "GBP") {
    return { ...bounds, eligible: false, reason: "UNSUPPORTED_CURRENCY" };
  }
  if (input.amountMinor < bounds.minimumMinor) {
    return { ...bounds, eligible: false, reason: "BELOW_MINIMUM" };
  }
  if (input.amountMinor > bounds.maximumMinor) {
    return { ...bounds, eligible: false, reason: "ABOVE_MAXIMUM" };
  }
  return { ...bounds, eligible: true };
}
