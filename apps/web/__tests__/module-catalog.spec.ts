import { MODULE_CAPABILITIES } from "../../../packages/platform/src/capability-maps";
import {
  MODULE_CATALOG,
  moduleImagePath,
  type WebModule,
} from "../lib/module-catalog";
import {
  calculateCartTotals,
  mergeBillingPrices,
} from "../lib/buy-now-pricing";

describe("module catalogue", () => {
  it("covers every platform module", () => {
    expect(Object.keys(MODULE_CATALOG).sort()).toEqual(
      Object.keys(MODULE_CAPABILITIES).sort(),
    );
  });

  it("uses complete metadata and exact interval price codes for every module", () => {
    for (const [module, entry] of Object.entries(MODULE_CATALOG) as [
      WebModule,
      (typeof MODULE_CATALOG)[WebModule],
    ][]) {
      const slug = module.toLowerCase().replace(/_/g, "-");

      expect(entry.description).not.toBe("");
      expect(entry.imageAlt).not.toBe("");
      expect(entry.imagePath).toBe(moduleImagePath(module));
      expect(entry.imagePath).toBe(`/configurator/modules/${slug}.png`);
      expect(entry.imagePath).toMatch(/^\/configurator\/modules\/[a-z0-9-]+\.png$/);
      expect(entry.priceCodes).toEqual({
        monthly: `MODULE_${module}_MONTHLY`,
        yearly: `MODULE_${module}_YEARLY`,
      });
    }
  });

  it("keeps legacy Learning selections equivalent to selected modules", () => {
    const legacyTotals = calculateCartTotals({
      planCode: "STARTER_49_MONTHLY",
      frequency: "monthly",
      learningModule: true,
    });
    const selectedModuleTotals = calculateCartTotals({
      planCode: "STARTER_49_MONTHLY",
      frequency: "monthly",
      selectedModules: ["LEARNING"],
    });

    expect(legacyTotals).toEqual(selectedModuleTotals);
    expect(legacyTotals.totalMajor).toBe(78);
    expect(legacyTotals.lines).toContainEqual({
      label: "Learning module",
      amountMajor: 29,
    });
  });

  it("charges Learning once when both legacy and selected-module inputs include it", () => {
    const totals = calculateCartTotals({
      planCode: "STARTER_49_MONTHLY",
      frequency: "monthly",
      learningModule: true,
      selectedModules: ["LEARNING"],
    });

    expect(totals.totalMajor).toBe(78);
    expect(totals.lines.filter((line) => line.label === "Learning module")).toHaveLength(1);
  });

  it("does not charge an unmapped selected module", () => {
    const baselineTotals = calculateCartTotals({
      planCode: "STARTER_49_MONTHLY",
      frequency: "monthly",
    });
    const totals = calculateCartTotals({
      planCode: "STARTER_49_MONTHLY",
      frequency: "monthly",
      selectedModules: ["FINANCE"],
    });

    expect(totals).toEqual(baselineTotals);
  });

  it("uses live non-Learning module prices in cart totals", () => {
    const { modulePrices } = mergeBillingPrices([
      {
        code: "MODULE_FINANCE_MONTHLY",
        unitAmount: 1900,
        interval: "month",
      },
    ]);
    const totals = calculateCartTotals(
      {
        planCode: "STARTER_49_MONTHLY",
        frequency: "monthly",
        selectedModules: ["FINANCE"],
      },
      { modulePrices },
    );

    expect(modulePrices.MODULE_FINANCE_MONTHLY).toEqual({
      amountMajor: 19,
      label: "Finance module",
      stripePriceId: "",
    });
    expect(totals.totalMajor).toBe(68);
    expect(totals.lines).toContainEqual({ label: "Finance module", amountMajor: 19 });
  });
});
