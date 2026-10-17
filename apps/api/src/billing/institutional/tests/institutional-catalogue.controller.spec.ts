import {
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { InstitutionalCatalogueController } from "../institutional-catalogue.controller";

describe("public institutional estimate", () => {
  const originalDeclaredCapacityFlag =
    process.env.DECLARED_CAPACITY_BILLING_ENABLED;
  const originalVatFlag = process.env.DECLARED_CAPACITY_VAT_ENABLED;
  const originalDeliveredAddons =
    process.env.DECLARED_CAPACITY_DELIVERED_ADDON_MODULES;
  const originalApprovedAddons =
    process.env.DECLARED_CAPACITY_APPROVED_ADDON_MODULES;
  const mappedPrices = {
    resolve: async () => ({
      STARTER_49_MONTHLY: { priceId: "price_base", unitAmountPence: 5700 },
      STARTER_49_YEARLY: { priceId: "price_yearbase", unitAmountPence: 51000 },
      INSTITUTIONAL_CHILD_UP_TO_100_MONTHLY: {
        priceId: "price_child",
        unitAmountPence: 175,
      },
      INSTITUTIONAL_CHILD_UP_TO_100_YEARLY: {
        priceId: "price_yearchild",
        unitAmountPence: 1234,
      },
      INSTITUTIONAL_CHILD_101_TO_250_MONTHLY: {
        priceId: "price_upperchild",
        unitAmountPence: 99,
      },
      INSTITUTIONAL_CHILD_101_TO_250_YEARLY: {
        priceId: "price_yearupperchild",
        unitAmountPence: 812,
      },
      DECLARED_CAPACITY_BASE_MONTHLY: {
        priceId: "price_DcBaseMonthly",
        unitAmountPence: 7_400,
      },
      DECLARED_CAPACITY_BASE_YEARLY: {
        priceId: "price_DcBaseYearly",
        unitAmountPence: 74_000,
      },
      DECLARED_CAPACITY_CHILD_MONTHLY: {
        priceId: "price_DcChildMonthly",
        unitAmountPence: 100,
      },
      DECLARED_CAPACITY_CHILD_YEARLY: {
        priceId: "price_DcChildYearly",
        unitAmountPence: 1_000,
      },
      MODULE_FINANCE_MONTHLY: {
        priceId: "price_FinanceMonthly",
        unitAmountPence: 2_900,
      },
      MODULE_FINANCE_YEARLY: {
        priceId: "price_FinanceYearly",
        unitAmountPence: 29_000,
      },
      MODULE_EVENTS_MONTHLY: {
        priceId: "price_EventsMonthly",
        unitAmountPence: 900,
      },
      STORAGE_100GB_MONTHLY: {
        priceId: "price_Storage100Monthly",
        unitAmountPence: 149,
      },
      STORAGE_100GB_YEARLY: {
        priceId: "price_Storage100Yearly",
        unitAmountPence: 1_599,
      },
      STORAGE_200GB_MONTHLY: {
        priceId: "price_Storage200Monthly",
        unitAmountPence: 249,
      },
      STORAGE_200GB_YEARLY: {
        priceId: "price_Storage200Yearly",
        unitAmountPence: 2_499,
      },
      STORAGE_1TB_MONTHLY: {
        priceId: "price_Storage1TBMonthly",
        unitAmountPence: 599,
      },
      STORAGE_1TB_YEARLY: {
        priceId: "price_Storage1TBYearly",
        unitAmountPence: 5_999,
      },
    }),
  };
  const controller = new InstitutionalCatalogueController(mappedPrices);

  afterAll(() => {
    if (originalDeclaredCapacityFlag === undefined) {
      delete process.env.DECLARED_CAPACITY_BILLING_ENABLED;
    } else {
      process.env.DECLARED_CAPACITY_BILLING_ENABLED =
        originalDeclaredCapacityFlag;
    }
    if (originalDeliveredAddons === undefined) {
      delete process.env.DECLARED_CAPACITY_DELIVERED_ADDON_MODULES;
    } else {
      process.env.DECLARED_CAPACITY_DELIVERED_ADDON_MODULES =
        originalDeliveredAddons;
    }
    if (originalApprovedAddons === undefined) {
      delete process.env.DECLARED_CAPACITY_APPROVED_ADDON_MODULES;
    } else {
      process.env.DECLARED_CAPACITY_APPROVED_ADDON_MODULES =
        originalApprovedAddons;
    }
    if (originalVatFlag === undefined) {
      delete process.env.DECLARED_CAPACITY_VAT_ENABLED;
    } else {
      process.env.DECLARED_CAPACITY_VAT_ENABLED = originalVatFlag;
    }
  });

  it("lists the three monthly plans without enabling checkout", () => {
    const catalogue = controller.catalogue();
    expect(catalogue.plans).toHaveLength(3);
    expect(catalogue.plans.every((plan) => !plan.checkoutEnabled)).toBe(true);
  });

  it("prices zero and the 250 boundary in integer pence", () => {
    expect(
      controller.estimate({
        planCode: "INSTITUTIONAL_STARTER_MONTHLY",
        enrolledChildren: 0,
      }),
    ).toMatchObject({ kind: "priced", subtotalPence: 4900 });
    expect(
      controller.estimate({
        planCode: "INSTITUTIONAL_STARTER_MONTHLY",
        enrolledChildren: 250,
      }),
    ).toMatchObject({ kind: "priced", subtotalPence: 23650 });
    expect(
      controller.estimate({
        planCode: "INSTITUTIONAL_STARTER_MONTHLY",
        enrolledChildren: 251,
      }),
    ).toMatchObject({ kind: "contact_sales", reason: "OVER_250_CHILDREN" });
  });

  it.each([-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid count %p",
    (enrolledChildren) => {
      expect(() =>
        controller.estimate({
          planCode: "INSTITUTIONAL_STARTER_MONTHLY",
          enrolledChildren,
        }),
      ).toThrow(BadRequestException);
    },
  );

  it("returns mapped annual prices and marks unmapped plans unavailable", async () => {
    const catalogue = await controller.mappedCatalogue();
    expect(catalogue.plans).toHaveLength(6);
    expect(
      catalogue.plans.find(
        (plan) => plan.planCode === "INSTITUTIONAL_STARTER_YEARLY",
      ),
    ).toMatchObject({ available: true, basePrice: { unitAmountPence: 51000 } });
    expect(
      catalogue.plans.find(
        (plan) => plan.planCode === "INSTITUTIONAL_GROWTH_YEARLY",
      ),
    ).toMatchObject({ available: false, basePrice: null });
    await expect(
      controller.mappedEstimate({
        planCode: "INSTITUTIONAL_STARTER_YEARLY",
        enrolledChildren: 26,
        storageChoice: "none",
      }),
    ).resolves.toMatchObject({ kind: "priced", subtotalPence: 52234 });
  });

  it("reports missing mapped components as retryable unavailable prices", async () => {
    await expect(
      controller.mappedEstimate({
        planCode: "INSTITUTIONAL_GROWTH_YEARLY",
        enrolledChildren: 75,
        storageChoice: "none",
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("keeps declared-capacity estimates unavailable until cutover", async () => {
    delete process.env.DECLARED_CAPACITY_BILLING_ENABLED;
    await expect(
      controller.estimateDeclaredCapacity({
        declaredCapacity: 74,
        interval: "month",
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("returns server-derived declared-capacity prices when enabled", async () => {
    process.env.DECLARED_CAPACITY_BILLING_ENABLED = "true";
    delete process.env.DECLARED_CAPACITY_VAT_ENABLED;
    await expect(
      controller.estimateDeclaredCapacity({
        declaredCapacity: 74,
        interval: "month",
      }),
    ).resolves.toMatchObject({
      pricingVersion: "DECLARED_CAPACITY_V2",
      tier: "starter",
      subtotalPence: 14_800,
      siteAllowance: 1,
      pricesIncludeVat: false,
    });
    await expect(
      controller.estimateDeclaredCapacity({
        declaredCapacity: 251,
        interval: "year",
      }),
    ).resolves.toMatchObject({
      kind: "contact_sales",
      tier: "enterprise",
      contactPath: "/demo?plan=enterprise",
      pricesIncludeVat: false,
    });
  });

  it("publishes mapped storage prices and includes the selected pack in the estimate", async () => {
    process.env.DECLARED_CAPACITY_BILLING_ENABLED = "true";

    await expect(controller.declaredCapacityCatalogue()).resolves.toMatchObject(
      {
        storageOptions: [
          { choice: "none", monthlyPricePence: 0, yearlyPricePence: 0 },
          { choice: "100", monthlyPricePence: 149, yearlyPricePence: 1_599 },
          { choice: "200", monthlyPricePence: 249, yearlyPricePence: 2_499 },
          { choice: "1000", monthlyPricePence: 599, yearlyPricePence: 5_999 },
        ],
      },
    );

    await expect(
      controller.estimateDeclaredCapacity({
        declaredCapacity: 74,
        interval: "month",
        storageChoice: "100",
      }),
    ).resolves.toMatchObject({
      storageChoice: "100",
      subtotalPence: 14_949,
      lines: expect.arrayContaining([
        expect.objectContaining({
          component: "STORAGE",
          priceCode: "STORAGE_100GB_MONTHLY",
          unitAmountPence: 149,
        }),
      ]),
    });
  });

  it("marks declared-capacity prices VAT-inclusive only when tax is ready", async () => {
    process.env.DECLARED_CAPACITY_BILLING_ENABLED = "true";
    process.env.DECLARED_CAPACITY_VAT_ENABLED = "true";

    await expect(
      controller.estimateDeclaredCapacity({
        declaredCapacity: 74,
        interval: "month",
      }),
    ).resolves.toMatchObject({ pricesIncludeVat: true });
    await expect(controller.declaredCapacityCatalogue()).resolves.toMatchObject(
      { pricesIncludeVat: true },
    );
  });

  it("lists only delivered modules with approved prices as trial options", async () => {
    process.env.DECLARED_CAPACITY_BILLING_ENABLED = "true";
    process.env.DECLARED_CAPACITY_DELIVERED_ADDON_MODULES = "FINANCE,EVENTS";
    process.env.DECLARED_CAPACITY_APPROVED_ADDON_MODULES = "FINANCE,EVENTS";

    const catalogue = await controller.declaredCapacityCatalogue();

    expect(catalogue.addonOptions).toEqual(
      expect.arrayContaining([
        {
          module: "FINANCE",
          trialAvailable: true,
          monthlyPricePence: 2_900,
          yearlyPricePence: 29_000,
        },
        {
          module: "EVENTS",
          trialAvailable: false,
          monthlyPricePence: 900,
          yearlyPricePence: null,
        },
      ]),
    );
    expect(catalogue.addonOptions).toHaveLength(8);
  });

  it("keeps free trial interest out of the total and prices explicit pay-now modules", async () => {
    process.env.DECLARED_CAPACITY_BILLING_ENABLED = "true";
    process.env.DECLARED_CAPACITY_DELIVERED_ADDON_MODULES = "FINANCE";
    process.env.DECLARED_CAPACITY_APPROVED_ADDON_MODULES = "FINANCE";

    await expect(
      controller.estimateDeclaredCapacity({
        declaredCapacity: 74,
        interval: "month",
        trialModules: ["FINANCE"],
      }),
    ).resolves.toMatchObject({
      subtotalPence: 14_800,
      trialModules: ["FINANCE"],
      lines: expect.not.arrayContaining([
        expect.objectContaining({ component: "ADDON" }),
      ]),
    });
    await expect(
      controller.estimateDeclaredCapacity({
        declaredCapacity: 74,
        interval: "month",
        payNowModules: ["FINANCE"],
      }),
    ).resolves.toMatchObject({
      subtotalPence: 17_700,
      paidModules: ["FINANCE"],
      lines: expect.arrayContaining([
        expect.objectContaining({
          component: "ADDON",
          subtotalPence: 2_900,
        }),
      ]),
    });
  });
});
