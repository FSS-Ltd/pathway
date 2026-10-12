import { Module } from "@pathway/db";
import type { BuyNowCheckoutParams } from "../buy-now.provider";
import type { BillingProviderConfig } from "../billing-provider.config";
import { StripeBuyNowProvider } from "../providers/stripe-buy-now.provider";

// Exercise price construction while optional-module launch readiness is closed.
jest.mock("@pathway/pricing", () => ({
  ...jest.requireActual("@pathway/pricing"),
  isConfiguratorModuleReady: jest.fn(() => true),
}));

const params: BuyNowCheckoutParams = {
  plan: {
    planCode: "STARTER_MONTHLY",
    selectedModules: [Module.FINANCE, Module.EVENTS],
  },
  org: {
    orgName: "Test Org",
    contactName: "Alice Doe",
    contactEmail: "alice@example.com",
    password: "",
  },
  preview: {
    planCode: "STARTER_MONTHLY",
    planTier: "starter",
    billingPeriod: "monthly",
    av30Cap: null,
    maxChildren: null,
    maxSites: 1,
    storageGbCap: null,
    smsMessagesCap: null,
    leaderSeatsIncluded: null,
    source: "plan_catalogue",
  },
  pendingOrderId: "pending_1",
};

function createConfig(
  priceMap: BillingProviderConfig["stripe"]["priceMap"],
): BillingProviderConfig {
  return {
    activeProvider: "STRIPE",
    stripe: {
      secretKey: "sk_test_example",
      priceMap,
      successUrlDefault: "https://example.com/success",
      cancelUrlDefault: "https://example.com/cancel",
    },
    goCardless: {},
  };
}

describe("StripeBuyNowProvider", () => {
  it("adds a paid line item for each selected module", async () => {
    const provider = new StripeBuyNowProvider(
      createConfig({
        STARTER_MONTHLY: "price_starter",
        MODULE_FINANCE_MONTHLY: "price_finance",
        MODULE_EVENTS_MONTHLY: "price_events",
      }),
    );
    const create = jest.fn().mockResolvedValue({
      id: "cs_123",
      url: "https://checkout.stripe.test/cs_123",
    });
    (
      provider as unknown as {
        stripe: { checkout: { sessions: { create: jest.Mock } } };
      }
    ).stripe = {
      checkout: { sessions: { create } },
    };

    await provider.createCheckoutSession(params, {
      tenantId: "tenant_1",
      orgId: "org_1",
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [
          { price: "price_starter", quantity: 1 },
          { price: "price_finance", quantity: 1 },
          { price: "price_events", quantity: 1 },
        ],
      }),
    );
  });

  it("does not add a Stripe line item for included modules, but charges paid extras", async () => {
    const provider = new StripeBuyNowProvider(
      createConfig({
        GROWTH_99_MONTHLY: "price_growth",
        MODULE_MEALS_MONTHLY: "price_meals",
      }),
    );
    const create = jest.fn().mockResolvedValue({
      id: "cs_included",
      url: "https://checkout.stripe.test/cs_included",
    });
    (
      provider as unknown as {
        stripe: { checkout: { sessions: { create: jest.Mock } } };
      }
    ).stripe = {
      checkout: { sessions: { create } },
    };

    await provider.createCheckoutSession(
      {
        ...params,
        plan: {
          planCode: "GROWTH_99_MONTHLY",
          selectedIncludedModules: [Module.FINANCE, Module.EVENTS, Module.HR],
          selectedModules: [Module.MEALS],
        },
      },
      { tenantId: "tenant_1", orgId: "org_1" },
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [
          { price: "price_growth", quantity: 1 },
          { price: "price_meals", quantity: 1 },
        ],
      }),
    );
  });

  it("rejects checkout rather than omitting a selected module without a price", async () => {
    const provider = new StripeBuyNowProvider(
      createConfig({ STARTER_MONTHLY: "price_starter" }),
    );

    await expect(
      provider.createCheckoutSession(params, {
        tenantId: "tenant_1",
        orgId: "org_1",
      }),
    ).rejects.toThrow(
      "Missing Stripe price configuration for selected modules",
    );
  });

  it("adds the Asset Management module price to checkout", async () => {
    const provider = new StripeBuyNowProvider(
      createConfig({
        STARTER_MONTHLY: "price_starter",
        MODULE_ASSET_MANAGEMENT_MONTHLY: "price_asset_management",
      }),
    );
    const create = jest.fn().mockResolvedValue({
      id: "cs_learning",
      url: "https://checkout.stripe.test/cs_learning",
    });
    (
      provider as unknown as {
        stripe: { checkout: { sessions: { create: jest.Mock } } };
      }
    ).stripe = {
      checkout: { sessions: { create } },
    };

    await provider.createCheckoutSession(
      {
        ...params,
        plan: { ...params.plan, selectedModules: [Module.ASSET_MANAGEMENT] },
      },
      { tenantId: "tenant_1", orgId: "org_1" },
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [
          { price: "price_starter", quantity: 1 },
          { price: "price_asset_management", quantity: 1 },
        ],
      }),
    );
  });
});
