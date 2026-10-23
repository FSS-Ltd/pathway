import { getFinanceCollectionAmountEligibility } from "../finance-collection-amount";
import type { FinanceCurrency } from "../finance-currencies";

const cardMinima: Array<[FinanceCurrency, bigint]> = [
  ["GBP", 30n],
  ["EUR", 50n],
  ["CZK", 1500n],
  ["DKK", 250n],
  ["HUF", 17500n],
  ["PLN", 200n],
  ["RON", 200n],
  ["SEK", 300n],
];

describe("NexSteps supported Finance collection amounts", () => {
  it.each(cardMinima)(
    "uses the same-currency card minimum for %s",
    (currency, minimumMinor) => {
      expect(
        getFinanceCollectionAmountEligibility({
          method: "card",
          currency,
          amountMinor: minimumMinor - 1n,
        }),
      ).toMatchObject({
        eligible: false,
        reason: "BELOW_MINIMUM",
        minimumMinor,
      });
      expect(
        getFinanceCollectionAmountEligibility({
          method: "card",
          currency,
          amountMinor: minimumMinor,
        }),
      ).toMatchObject({ eligible: true, minimumMinor });
      expect(
        getFinanceCollectionAmountEligibility({
          method: "card",
          currency,
          amountMinor: 99_999_999n,
        }),
      ).toMatchObject({ eligible: true });
      expect(
        getFinanceCollectionAmountEligibility({
          method: "card",
          currency,
          amountMinor: 100_000_000n,
        }),
      ).toMatchObject({ eligible: false, reason: "ABOVE_MAXIMUM" });
    },
  );

  it.each([1n, 29n, 1_000_000n])(
    "accepts Bacs GBP %s without borrowing the card minimum",
    (amountMinor) => {
      expect(
        getFinanceCollectionAmountEligibility({
          method: "bacs",
          currency: "GBP",
          amountMinor,
        }),
      ).toEqual({ eligible: true, minimumMinor: 1n, maximumMinor: 1_000_000n });
    },
  );

  it.each([-1n, 0n, 1_000_001n, 9_223_372_036_854_775_807n])(
    "rejects unsupported Bacs amount %s exactly as bigint",
    (amountMinor) => {
      expect(
        getFinanceCollectionAmountEligibility({
          method: "bacs",
          currency: "GBP",
          amountMinor,
        }),
      ).toMatchObject({
        eligible: false,
        reason: amountMinor < 1n ? "BELOW_MINIMUM" : "ABOVE_MAXIMUM",
      });
    },
  );

  it("keeps Bacs unavailable outside GBP", () => {
    expect(
      getFinanceCollectionAmountEligibility({
        method: "bacs",
        currency: "EUR",
        amountMinor: 100n,
      }),
    ).toMatchObject({ eligible: false, reason: "UNSUPPORTED_CURRENCY" });
  });
});
