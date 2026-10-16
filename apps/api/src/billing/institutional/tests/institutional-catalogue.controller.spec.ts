import {
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { InstitutionalCatalogueController } from "../institutional-catalogue.controller";

describe("public institutional estimate", () => {
  const originalDeclaredCapacityFlag =
    process.env.DECLARED_CAPACITY_BILLING_ENABLED;
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

  it("keeps declared-capacity estimates unavailable until cutover", () => {
    delete process.env.DECLARED_CAPACITY_BILLING_ENABLED;
    expect(() =>
      controller.estimateDeclaredCapacity({
        declaredCapacity: 74,
        interval: "month",
      }),
    ).toThrow(ServiceUnavailableException);
  });

  it("returns server-derived declared-capacity prices when enabled", () => {
    process.env.DECLARED_CAPACITY_BILLING_ENABLED = "true";
    expect(
      controller.estimateDeclaredCapacity({
        declaredCapacity: 74,
        interval: "month",
      }),
    ).toMatchObject({
      pricingVersion: "DECLARED_CAPACITY_V2",
      tier: "starter",
      totalPence: 14_800,
      siteAllowance: 1,
    });
    expect(
      controller.estimateDeclaredCapacity({
        declaredCapacity: 251,
        interval: "year",
      }),
    ).toMatchObject({
      kind: "contact_sales",
      tier: "enterprise",
      contactPath: "/demo?plan=enterprise",
    });
  });
});
