import { Module } from "@pathway/db";
import {
  DeclaredCapacityStripePriceError,
  isDeclaredCapacityAddonTrialReady,
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
    STORAGE_100GB_MONTHLY: {
      priceId: "price_storage100month",
      unitAmountPence: 149,
    },
    STORAGE_100GB_YEARLY: {
      priceId: "price_storage100year",
      unitAmountPence: 1_599,
    },
    STORAGE_200GB_MONTHLY: {
      priceId: "price_storage200month",
      unitAmountPence: 249,
    },
    STORAGE_200GB_YEARLY: {
      priceId: "price_storage200year",
      unitAmountPence: 2_499,
    },
    STORAGE_1TB_MONTHLY: {
      priceId: "price_storage1tbmonth",
      unitAmountPence: 599,
    },
    STORAGE_1TB_YEARLY: {
      priceId: "price_storage1tbyear",
      unitAmountPence: 5_999,
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

  it.each([
    ["100", "month", "STORAGE_100GB_MONTHLY", 149, "price_storage100month"],
    ["200", "year", "STORAGE_200GB_YEARLY", 2_499, "price_storage200year"],
    ["1000", "month", "STORAGE_1TB_MONTHLY", 599, "price_storage1tbmonth"],
  ] as const)(
    "adds the mapped %s GB %s storage Price to the server quote",
    (storageChoice, interval, priceCode, amountPence, priceId) => {
      const quote = quoteDeclaredCapacityWithStripePrices(
        { declaredCapacity: 74, interval },
        prices,
        { storageChoice },
      );

      expect(quote).toMatchObject({
        kind: "priced",
        storageChoice,
        subtotalPence: (interval === "month" ? 14_800 : 148_000) + amountPence,
      });
      if (quote.kind !== "priced") return;
      expect(quote.lines).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            component: "STORAGE",
            priceCode,
            priceId,
            quantity: 1,
            unitAmountPence: amountPence,
          }),
        ]),
      );
    },
  );

  it("fails closed when the selected storage interval has no mapped Stripe Price", () => {
    const pricesMissingStorageYearly = { ...prices };
    Reflect.deleteProperty(pricesMissingStorageYearly, "STORAGE_100GB_YEARLY");

    expect(() =>
      quoteDeclaredCapacityWithStripePrices(
        { declaredCapacity: 74, interval: "year" },
        pricesMissingStorageYearly,
        { storageChoice: "100" },
      ),
    ).toThrow(new DeclaredCapacityStripePriceError("STORAGE_100GB_YEARLY"));
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

  it("checks approved add-on prices independently from the base subscription prices", () => {
    process.env.DECLARED_CAPACITY_APPROVED_ADDON_MODULES = "FINANCE";
    process.env.DECLARED_CAPACITY_DELIVERED_ADDON_MODULES = "FINANCE";

    expect(
      isDeclaredCapacityAddonTrialReady(Module.FINANCE, {
        MODULE_FINANCE_MONTHLY: prices.MODULE_FINANCE_MONTHLY,
        MODULE_FINANCE_YEARLY: prices.MODULE_FINANCE_YEARLY,
      }),
    ).toBe(true);
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
