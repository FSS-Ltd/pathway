import {
  ADDON_PRICES,
  calculateCartTotals,
  mergeBillingPrices,
} from "../lib/buy-now-pricing";

describe("Learning module pricing", () => {
  it("includes the Learning module in a monthly checkout total", () => {
    const totals = calculateCartTotals({
      planCode: "STARTER_49_MONTHLY",
      frequency: "monthly",
      learningModule: true,
    });

    expect(ADDON_PRICES.MODULE_LEARNING_MONTHLY.amountMajor).toBe(29);
    expect(totals.totalMajor).toBe(78);
    expect(totals.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Learning module", amountMajor: 29 }),
      ]),
    );
  });

  it("uses the live Learning price returned by the billing endpoint", () => {
    const { addonPrices } = mergeBillingPrices([
      {
        code: "MODULE_LEARNING_YEARLY",
        unitAmount: 29000,
        interval: "year",
      },
    ]);

    expect(addonPrices.MODULE_LEARNING_YEARLY).toMatchObject({
      amountMajor: 290,
      label: "Learning module",
    });
  });
});
