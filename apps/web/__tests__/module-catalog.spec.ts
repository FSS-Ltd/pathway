import {
  MODULE_CAPABILITIES,
  VERTICAL_CAPABILITIES,
} from "../../../packages/platform/src/capability-maps";
import { VERTICAL_OPTIONS } from "@pathway/types";
import {
  MODULE_CATALOG,
  VERTICAL_FEATURES,
  moduleImagePath,
  optionDelta,
  type WebModule,
} from "../lib/module-catalog";
import {
  ADDON_PRICES,
  calculateConfiguratorCartTotals,
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
      expect(entry.imagePath).toMatch(
        /^\/configurator\/modules\/[a-z0-9-]+\.png$/,
      );
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
    expect(
      totals.lines.filter((line) => line.label === "Learning module"),
    ).toHaveLength(1);
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
    expect(totals.lines).toContainEqual({
      label: "Finance module",
      amountMajor: 19,
    });
  });

  it("charges only paid optional modules for configured plans", () => {
    const { modulePrices } = mergeBillingPrices([
      {
        code: "MODULE_LEARNING_MONTHLY",
        unitAmount: 2900,
        interval: "month",
      },
    ]);

    const total = calculateCartTotals(
      {
        planCode: "GROWTH_99_MONTHLY",
        frequency: "monthly",
        selectedModules: ["LEARNING"],
      },
      { modulePrices },
    );

    expect(total.totalMajor).toBe(128);
    expect(total.lines).toEqual([
      { label: "£99 / month", amountMajor: 99 },
      { label: "Learning module", amountMajor: 29 },
    ]);
  });

  it("does not use published module fallbacks in configurator totals", () => {
    const selection = {
      planCode: "STARTER_49_MONTHLY" as const,
      frequency: "monthly" as const,
      selectedModules: ["LEARNING" as const],
    };

    expect(calculateConfiguratorCartTotals(selection).totalMajor).toBe(49);
    expect(
      calculateConfiguratorCartTotals(selection, {
        modulePrices: {
          MODULE_LEARNING_MONTHLY: {
            amountMajor: 29,
            label: "Learning module",
          },
        },
      }).totalMajor,
    ).toBe(78);
  });

  it("covers every vertical with customer-readable included features", () => {
    expect(Object.keys(VERTICAL_FEATURES).sort()).toEqual(
      VERTICAL_OPTIONS.map(({ value }) => value).sort(),
    );
    expect(Object.keys(VERTICAL_FEATURES).sort()).toEqual(
      Object.keys(VERTICAL_CAPABILITIES).sort(),
    );

    for (const features of Object.values(VERTICAL_FEATURES)) {
      expect(features.length).toBeGreaterThan(0);
      features.forEach((feature) =>
        expect(feature.trim().length).toBeGreaterThan(3),
      );
    }

    expect(VERTICAL_FEATURES.ACE_SCHOOL).toEqual(
      expect.arrayContaining([
        "View and record learning logs",
        "View and add learning evidence",
        "Generate learning progress reports",
      ]),
    );
  });

  it("keeps every option delta aligned with cart totals across billing intervals", () => {
    const syntheticPrices = mergeBillingPrices(
      Object.keys(MODULE_CATALOG).flatMap((module, index) => [
        {
          code: `MODULE_${module}_MONTHLY`,
          unitAmount: (index + 1) * 1000,
          interval: "month" as const,
        },
        {
          code: `MODULE_${module}_YEARLY`,
          unitAmount: (index + 1) * 10000,
          interval: "year" as const,
        },
      ]),
    );
    const priceLookup = {
      ...ADDON_PRICES,
      ...syntheticPrices.addonPrices,
      ...syntheticPrices.modulePrices,
    };

    for (const frequency of ["monthly", "yearly"] as const) {
      const planCode =
        frequency === "monthly" ? "STARTER_49_MONTHLY" : "STARTER_49_YEARLY";
      const baseline = calculateCartTotals({ planCode, frequency });

      for (const module of Object.keys(MODULE_CATALOG) as WebModule[]) {
        const delta = optionDelta(
          { kind: "module", module },
          frequency,
          priceLookup,
        );
        const totals = calculateCartTotals(
          { planCode, frequency, selectedModules: [module] },
          syntheticPrices,
        );

        expect(delta.status).toBe("priced");
        if (delta.status === "priced") {
          expect(delta.amountMajor).toBeCloseTo(
            totals.totalMajor - baseline.totalMajor,
          );
        }
      }

      for (const storageChoice of ["100", "200", "1000"] as const) {
        const delta = optionDelta(
          { kind: "storage", storageChoice },
          frequency,
          priceLookup,
        );
        const totals = calculateCartTotals(
          {
            planCode,
            frequency,
            storageAddon100Gb: storageChoice === "100" ? 1 : 0,
            storageAddon200Gb: storageChoice === "200" ? 1 : 0,
            storageAddon1Tb: storageChoice === "1000" ? 1 : 0,
          },
          syntheticPrices,
        );

        expect(delta.status).toBe("priced");
        if (delta.status === "priced") {
          expect(delta.amountMajor).toBeCloseTo(
            totals.totalMajor - baseline.totalMajor,
          );
        }
      }
    }

    expect(
      optionDelta(
        { kind: "storage", storageChoice: "none" },
        "monthly",
        priceLookup,
      ),
    ).toEqual({
      status: "included",
    });
    expect(
      optionDelta({ kind: "module", module: "FINANCE" }, "monthly", {}),
    ).toEqual({
      status: "coming-soon",
    });
  });
});
