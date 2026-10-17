import {
  startPublicDeclaredCapacityCheckout,
  estimateDeclaredCapacityPrice,
  fetchDeclaredCapacityCatalogue,
} from "../lib/institutional-estimate-client";
import { isDeclaredCapacityV2ConfiguratorEnabled } from "@pathway/pricing";

const checkout = {
  declaredCapacity: 74,
  interval: "month" as const,
  expectedTotalPence: 14_800,
  declarationAccepted: true as const,
  setting: "INDEPENDENT_SCHOOL" as const,
  storageChoice: "100" as const,
  payNowModules: [],
  trialModules: ["FINANCE" as const],
  idempotencyKey: "declared-capacity-checkout",
  org: {
    orgName: "Example School",
    contactName: "Billing Admin",
    contactEmail: "billing@example.org",
    password: "correct-horse-battery",
  },
};

describe("declared-capacity public billing client", () => {
  afterEach(() => jest.restoreAllMocks());

  it("requests an estimate with selected trial modules without setting an activation time", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          kind: "priced",
          storageChoice: "100",
          subtotalPence: 14_949,
        }),
        { status: 200 },
      ),
    );

    await estimateDeclaredCapacityPrice(74, "month", {
      payNowModules: [],
      trialModules: ["FINANCE"],
      storageChoice: "100",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "/billing/institutional/catalogue/declared-capacity/estimate",
      ),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          declaredCapacity: 74,
          interval: "month",
          payNowModules: [],
          trialModules: ["FINANCE"],
          storageChoice: "100",
        }),
      }),
    );
  });

  it("rejects an estimate when the server did not confirm the selected storage", async () => {
    jest.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ kind: "priced", subtotalPence: 14_800 }), {
        status: 200,
      }),
    );

    await expect(
      estimateDeclaredCapacityPrice(74, "month", {
        payNowModules: [],
        trialModules: [],
        storageChoice: "100",
      }),
    ).rejects.toThrow("Storage pricing is unavailable");
  });

  it("rejects an older catalogue response without storage prices", async () => {
    jest.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ pricingVersion: "DECLARED_CAPACITY_V2" }), {
        status: 200,
      }),
    );

    await expect(fetchDeclaredCapacityCatalogue()).rejects.toThrow(
      "Storage pricing is unavailable",
    );
  });

  it("posts only explicit pay-now items and pending trial selections to checkout", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          checkoutUrl: "https://checkout.example.test/session",
          pendingOrderId: "order-1",
        }),
        { status: 200 },
      ),
    );

    await startPublicDeclaredCapacityCheckout(checkout);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "/billing/institutional/public/declared-capacity/checkout",
      ),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(checkout),
      }),
    );
  });

  it("keeps the new configurator disabled unless explicitly enabled", () => {
    expect(isDeclaredCapacityV2ConfiguratorEnabled(undefined)).toBe(false);
    expect(isDeclaredCapacityV2ConfiguratorEnabled("false")).toBe(false);
    expect(isDeclaredCapacityV2ConfiguratorEnabled("true")).toBe(true);
  });
});
