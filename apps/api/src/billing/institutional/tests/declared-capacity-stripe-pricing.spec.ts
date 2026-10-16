import { Module } from "@pathway/db";
import {
  DeclaredCapacityStripePriceError,
  quoteDeclaredCapacityWithStripePrices,
} from "../declared-capacity-stripe-pricing";

describe("declared-capacity Stripe quotes", () => {
  const originalApprovedModules =
    process.env.DECLARED_CAPACITY_APPROVED_ADDON_MODULES;
  const originalDeliveredModules =
    process.env.DECLARED_CAPACITY_DELIVERED_ADDON_MODULES;
  const prices = {
    DECLARED_CAPACITY_BASE_MONTHLY: {
      priceId: "price_monthbase",
      unitAmountPence: 7_400,
    },
    DECLARED_CAPACITY_BASE_YEARLY: {
      priceId: "price_yearbase",
      unitAmountPence: 74_000,
    },
    DECLARED_CAPACITY_CHILD_MONTHLY: {
      priceId: "price_monthchild",
      unitAmountPence: 100,
    },
    DECLARED_CAPACITY_CHILD_YEARLY: {
      priceId: "price_yearchild",
      unitAmountPence: 1_000,
    },
    MODULE_FINANCE_MONTHLY: {
      priceId: "price_monthfinance",
      unitAmountPence: 2_000,
    },
    MODULE_FINANCE_YEARLY: {
      priceId: "price_yearfinance",
      unitAmountPence: 20_000,
    },
  };

  afterAll(() => {
    if (originalApprovedModules === undefined) {
      delete process.env.DECLARED_CAPACITY_APPROVED_ADDON_MODULES;
    } else {
      process.env.DECLARED_CAPACITY_APPROVED_ADDON_MODULES =
        originalApprovedModules;
    }
    if (originalDeliveredModules === undefined) {
      delete process.env.DECLARED_CAPACITY_DELIVERED_ADDON_MODULES;
    } else {
      process.env.DECLARED_CAPACITY_DELIVERED_ADDON_MODULES =
        originalDeliveredModules;
    }
  });

  it("freezes configured base prices and explicitly selected payable modules", () => {
    process.env.DECLARED_CAPACITY_APPROVED_ADDON_MODULES = "FINANCE";
    process.env.DECLARED_CAPACITY_DELIVERED_ADDON_MODULES = "FINANCE";
    const quote = quoteDeclaredCapacityWithStripePrices(
      { declaredCapacity: 75, interval: "month" },
      prices,
      { paidModules: [Module.FINANCE], trialModules: [] },
    );

    expect(quote).toMatchObject({
      kind: "priced",
      planCode: "DECLARED_CAPACITY_GROWTH_MONTHLY",
      subtotalPence: 16_900,
      paidModules: [Module.FINANCE],
    });
    if (quote.kind !== "priced") return;
    expect(quote.lines.map((line) => line.priceId)).toEqual([
      "price_monthbase",
      "price_monthchild",
      "price_monthfinance",
    ]);
  });

  it("stores trial selections without adding charge lines", () => {
    process.env.DECLARED_CAPACITY_APPROVED_ADDON_MODULES = "FINANCE";
    process.env.DECLARED_CAPACITY_DELIVERED_ADDON_MODULES = "FINANCE";
    const quote = quoteDeclaredCapacityWithStripePrices(
      { declaredCapacity: 0, interval: "year" },
      prices,
      { trialModules: [Module.FINANCE] },
    );

    expect(quote).toMatchObject({
      kind: "priced",
      subtotalPence: 74_000,
      trialModules: [Module.FINANCE],
    });
    if (quote.kind !== "priced") return;
    expect(quote.lines).toHaveLength(2);
    expect(quote.lines.map((line) => line.quantity)).toEqual([1, 0]);
  });

  it("requires both approved intervals before a module can be selected for a trial", () => {
    process.env.DECLARED_CAPACITY_APPROVED_ADDON_MODULES = "FINANCE";
    process.env.DECLARED_CAPACITY_DELIVERED_ADDON_MODULES = "FINANCE";
    const pricesMissingAnnual = { ...prices };
    Reflect.deleteProperty(pricesMissingAnnual, "MODULE_FINANCE_YEARLY");

    expect(() =>
      quoteDeclaredCapacityWithStripePrices(
        { declaredCapacity: 75, interval: "month" },
        pricesMissingAnnual,
        { trialModules: [Module.FINANCE] },
      ),
    ).toThrow(DeclaredCapacityStripePriceError);
  });

  it("allows an approved pay-now module at the selected interval when the other interval is unavailable", () => {
    process.env.DECLARED_CAPACITY_APPROVED_ADDON_MODULES = "FINANCE";
    process.env.DECLARED_CAPACITY_DELIVERED_ADDON_MODULES = "FINANCE";
    const pricesMissingAnnual = { ...prices };
    Reflect.deleteProperty(pricesMissingAnnual, "MODULE_FINANCE_YEARLY");

    expect(
      quoteDeclaredCapacityWithStripePrices(
        { declaredCapacity: 75, interval: "month" },
        pricesMissingAnnual,
        { paidModules: [Module.FINANCE] },
      ),
    ).toMatchObject({ kind: "priced", paidModules: [Module.FINANCE] });
  });
});
