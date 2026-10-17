import {
  calculateDeclaredCapacityQuote,
  calculateMappedInstitutionalQuote,
  declaredCapacityPlanCode,
  DECLARED_CAPACITY_PRICING_VERSION,
  INSTITUTIONAL_MAPPED_PRICING_VERSION,
  INSTITUTIONAL_PRICING_VERSION,
} from "@pathway/pricing";
import { stripeItemsForSnapshot } from "../institutional-stripe-line-items";
import { quoteDeclaredCapacityWithStripePrices } from "../declared-capacity-stripe-pricing";

const priceMap = {
  INSTITUTIONAL_STARTER_MONTHLY: "price_starter",
  INSTITUTIONAL_GROWTH_MONTHLY: "price_growth",
  INSTITUTIONAL_CHILD_UP_TO_100_MONTHLY: "price_first",
  INSTITUTIONAL_CHILD_101_TO_250_MONTHLY: "price_second",
};

const starter = {
  planCode: "INSTITUTIONAL_STARTER_MONTHLY",
  pricingVersion: INSTITUTIONAL_PRICING_VERSION,
  enrolledChildren: 0,
  subtotalPence: 4_900,
  includedModules: [],
  paidModules: [],
};

describe("institutional Stripe line items", () => {
  it("uses the frozen declared-capacity monthly and yearly lines", () => {
    for (const [declaredCapacity, interval, expectedPlan, expectedAmount] of [
      [0, "month", "DECLARED_CAPACITY_STARTER_MONTHLY", 7_400],
      [75, "month", "DECLARED_CAPACITY_GROWTH_MONTHLY", 14_900],
      [150, "year", "DECLARED_CAPACITY_PROFESSIONAL_YEARLY", 224_000],
    ] as const) {
      const quote = calculateDeclaredCapacityQuote({
        declaredCapacity,
        interval,
      });
      expect(quote.kind).toBe("priced");
      if (quote.kind !== "priced") continue;
      const snapshot = {
        planCode: declaredCapacityPlanCode(quote.tier, interval),
        pricingVersion: DECLARED_CAPACITY_PRICING_VERSION,
        enrolledChildren: null,
        declaredCapacity,
        subtotalPence: quote.totalPence,
        includedModules: [],
        paidModules: [],
        lines: quote.lines.map((line) => ({
          ...line,
          priceId: `price_${line.priceCode.toLowerCase().replaceAll("_", "")}`,
          currency: "GBP" as const,
        })),
      };
      expect(snapshot.planCode).toBe(expectedPlan);
      expect(snapshot.subtotalPence).toBe(expectedAmount);
      expect(stripeItemsForSnapshot(snapshot, {})).toEqual(
        quote.lines
          .filter((line) => line.quantity > 0)
          .map((line) => ({
            price: `price_${line.priceCode.toLowerCase().replaceAll("_", "")}`,
            quantity: line.quantity,
          })),
      );
    }
  });

  it("uses accepted V2 Price IDs and amounts after the map changes", () => {
    const quote = calculateMappedInstitutionalQuote({
      planCode: "INSTITUTIONAL_STARTER_MONTHLY",
      enrolledChildren: 25,
      storageChoice: "none",
      prices: {
        STARTER_49_MONTHLY: {
          priceId: "price_accepted",
          unitAmountPence: 5700,
        },
        INSTITUTIONAL_CHILD_UP_TO_100_MONTHLY: {
          priceId: "price_first",
          unitAmountPence: 175,
        },
        INSTITUTIONAL_CHILD_101_TO_250_MONTHLY: {
          priceId: "price_second",
          unitAmountPence: 99,
        },
      },
    });
    expect(quote.kind).toBe("priced");
    if (quote.kind !== "priced") return;
    const mapped = {
      ...starter,
      pricingVersion: INSTITUTIONAL_MAPPED_PRICING_VERSION,
      subtotalPence: 5700,
      enrolledChildren: 25,
      lines: quote.lines,
    };
    expect(
      stripeItemsForSnapshot(mapped, { STARTER_49_MONTHLY: "price_new" }),
    ).toEqual([{ price: "price_accepted", quantity: 1 }]);
    expect(() =>
      stripeItemsForSnapshot(
        {
          ...mapped,
          lines: [{ ...mapped.lines[0], subtotalPence: 5701 }],
        },
        {},
      ),
    ).toThrow("INVALID_INSTITUTIONAL_SNAPSHOT");
  });

  it("retains a selected storage Price in frozen declared-capacity renewals", () => {
    const quote = quoteDeclaredCapacityWithStripePrices(
      { declaredCapacity: 1, interval: "month" },
      {
        DECLARED_CAPACITY_BASE_MONTHLY: {
          priceId: "price_capacitybase",
          unitAmountPence: 7_400,
        },
        DECLARED_CAPACITY_CHILD_MONTHLY: {
          priceId: "price_capacitychild",
          unitAmountPence: 100,
        },
        DECLARED_CAPACITY_BASE_YEARLY: {
          priceId: "price_capacitybaseyear",
          unitAmountPence: 74_000,
        },
        DECLARED_CAPACITY_CHILD_YEARLY: {
          priceId: "price_capacitychildyear",
          unitAmountPence: 1_000,
        },
        STORAGE_100GB_MONTHLY: {
          priceId: "price_storage100",
          unitAmountPence: 149,
        },
      },
      { storageChoice: "100" },
    );
    if (quote.kind !== "priced") throw new Error("Expected priced quote");

    expect(
      stripeItemsForSnapshot(
        {
          planCode: quote.planCode,
          pricingVersion: DECLARED_CAPACITY_PRICING_VERSION,
          enrolledChildren: null,
          declaredCapacity: quote.declaredCapacity,
          subtotalPence: quote.subtotalPence,
          includedModules: [],
          paidModules: [],
          lines: quote.lines,
        },
        {},
      ),
    ).toEqual([
      { price: "price_capacitybase", quantity: 1 },
      { price: "price_capacitychild", quantity: 1 },
      { price: "price_storage100", quantity: 1 },
    ]);
  });

  it("keeps the base charge when the count is zero", () => {
    expect(stripeItemsForSnapshot(starter, priceMap)).toEqual([
      { price: "price_starter", quantity: 1 },
    ]);
  });

  it("uses both non-zero child bands at 250", () => {
    expect(
      stripeItemsForSnapshot(
        { ...starter, enrolledChildren: 250, subtotalPence: 23_650 },
        priceMap,
      ),
    ).toEqual([
      { price: "price_starter", quantity: 1 },
      { price: "price_first", quantity: 75 },
      { price: "price_second", quantity: 150 },
    ]);
  });

  it("rejects stale amounts, unknown counts, and over-250 quotes", () => {
    expect(() =>
      stripeItemsForSnapshot({ ...starter, enrolledChildren: 26 }, priceMap),
    ).toThrow("INVALID_INSTITUTIONAL_SNAPSHOT");
    expect(() =>
      stripeItemsForSnapshot({ ...starter, enrolledChildren: null }, priceMap),
    ).toThrow("INVALID_INSTITUTIONAL_SNAPSHOT");
    expect(() =>
      stripeItemsForSnapshot({ ...starter, enrolledChildren: 251 }, priceMap),
    ).toThrow("INVALID_INSTITUTIONAL_SNAPSHOT");
  });
});
