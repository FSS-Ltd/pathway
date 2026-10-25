import { BillingService } from "../billing.service";

describe("BillingService", () => {
  let svc: BillingService;

  beforeAll(() => {
    svc = new BillingService();
  });

  it("checkout() returns a stubbed subscription session", async () => {
    const result = await svc.checkout({
      provider: "stripe",
      orgId: "11111111-1111-1111-1111-111111111111",
      planCode: "starter",
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
      mode: "subscription",
      seats: 1,
    });

    expect(result.provider).toBe("stripe");
    expect(result.planCode).toBe("starter");
    expect(result.mode).toBe("subscription");
    expect(result.sessionId).toMatch(/^sess_[0-9a-f]{16}$/);
    expect(result.checkoutUrl).toContain("https://example.com/success");
  });

  it("checkout() supports setup mode and preserves mode in response", async () => {
    const result = await svc.checkout({
      provider: "stripe",
      orgId: "22222222-2222-2222-2222-222222222222",
      planCode: "pro",
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
      mode: "setup",
      seats: 5,
      customerId: "cus_123",
    });

    expect(result.mode).toBe("setup");
    expect(result.sessionId).toMatch(/^sess_/);
    expect(result.checkoutUrl).toContain("provider=stripe");
    expect(result.checkoutUrl).toContain("mode=setup");
  });
});
