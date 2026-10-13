import { calculateMappedInstitutionalQuote } from "@pathway/pricing";
import { quoteFromFrozenInstitutionalPrices } from "../institutional-frozen-pricing";

const accepted = calculateMappedInstitutionalQuote({
  planCode: "INSTITUTIONAL_STARTER_YEARLY",
  enrolledChildren: 26,
  storageChoice: "none",
  prices: {
    STARTER_49_YEARLY: { priceId: "price_base", unitAmountPence: 51_000 },
    INSTITUTIONAL_CHILD_UP_TO_100_YEARLY: {
      priceId: "price_first",
      unitAmountPence: 1_234,
    },
    INSTITUTIONAL_CHILD_101_TO_250_YEARLY: {
      priceId: "price_second",
      unitAmountPence: 812,
    },
  },
});

describe("frozen institutional renewal prices", () => {
  it("reuses accepted annual Price IDs and unit amounts when the census changes", () => {
    expect(accepted.kind).toBe("priced");
    if (accepted.kind !== "priced") return;
    const renewal = quoteFromFrozenInstitutionalPrices(accepted, 101);
    expect(renewal).toMatchObject({
      kind: "priced",
      subtotalPence: 144_362,
      lines: [
        { priceId: "price_base", quantity: 1, unitAmountPence: 51_000 },
        { priceId: "price_first", quantity: 75, unitAmountPence: 1_234 },
        { priceId: "price_second", quantity: 1, unitAmountPence: 812 },
      ],
    });
  });

  it("rejects changed snapshot amounts", () => {
    expect(accepted.kind).toBe("priced");
    if (accepted.kind !== "priced") return;
    expect(() =>
      quoteFromFrozenInstitutionalPrices(
        {
          ...accepted,
          lines: [
            { ...accepted.lines[0], unitAmountPence: 1 },
            ...accepted.lines.slice(1),
          ],
        },
        101,
      ),
    ).toThrow("INVALID_FROZEN_INSTITUTIONAL_PRICE");
  });

  it("retains the selected storage Price across annual renewal", () => {
    const withStorage = calculateMappedInstitutionalQuote({
      planCode: "INSTITUTIONAL_STARTER_YEARLY",
      enrolledChildren: 26,
      storageChoice: "200",
      prices: {
        STARTER_49_YEARLY: { priceId: "price_base", unitAmountPence: 51_000 },
        INSTITUTIONAL_CHILD_UP_TO_100_YEARLY: {
          priceId: "price_first",
          unitAmountPence: 1_234,
        },
        INSTITUTIONAL_CHILD_101_TO_250_YEARLY: {
          priceId: "price_second",
          unitAmountPence: 812,
        },
        STORAGE_200GB_YEARLY: {
          priceId: "price_storage",
          unitAmountPence: 2_499,
        },
      },
    });
    expect(withStorage.kind).toBe("priced");
    if (withStorage.kind !== "priced") return;
    expect(quoteFromFrozenInstitutionalPrices(withStorage, 26)).toMatchObject({
      kind: "priced",
      subtotalPence: 54_733,
    });
  });
});
