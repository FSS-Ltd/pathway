const findUniqueOrThrow = jest.fn();

jest.mock("@pathway/db", () => ({
  prisma: {
    org: { findUniqueOrThrow },
  },
}));

import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { BillingController } from "../billing.controller";
import { BillingService } from "../billing.service";
import { EntitlementsService } from "../entitlements.service";
import { EntitlementsEnforcementService } from "../entitlements-enforcement.service";
import { AuthUserGuard } from "../../auth/auth-user.guard";
import { BILLING_PROVIDER_CONFIG, type BillingProviderConfig } from "../billing-provider.config";

describe("POST /billing/portal", () => {
  let controller: BillingController;
  const stripeCreate = jest.fn();
  const originalReturnUrl = process.env.NEXSTEPS_HOME_BILLING_RETURN_URL;

  afterEach(() => {
    if (originalReturnUrl === undefined) {
      delete process.env.NEXSTEPS_HOME_BILLING_RETURN_URL;
    } else {
      process.env.NEXSTEPS_HOME_BILLING_RETURN_URL = originalReturnUrl;
    }
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    delete process.env.NEXSTEPS_HOME_BILLING_RETURN_URL;

    const config: BillingProviderConfig = {
      activeProvider: "STRIPE",
      stripe: {},
      goCardless: {},
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BillingController],
      providers: [
        BillingService,
        { provide: EntitlementsService, useValue: { resolve: jest.fn() } },
        { provide: EntitlementsEnforcementService, useValue: { checkAv30ForOrg: jest.fn() } },
        { provide: BILLING_PROVIDER_CONFIG, useValue: config },
      ],
    })
      .overrideGuard(AuthUserGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(BillingController);
    // Config carries no secretKey, so the real constructor leaves `stripe`
    // null - inject a mock client the same way
    // stripe-buy-now.provider.spec.ts does (monkeypatching the private
    // field), rather than mocking the whole "stripe" package.
    (
      controller as unknown as {
        stripe: { billingPortal: { sessions: { create: jest.Mock } } };
      }
    ).stripe = {
      billingPortal: { sessions: { create: stripeCreate } },
    };
  });

  it("returns a portal session url for an org with a stripe customer, omitting return_url when unset", async () => {
    stripeCreate.mockResolvedValue({ url: "https://billing.stripe.com/session/abc" });
    findUniqueOrThrow.mockResolvedValue({ stripeCustomerId: "cus_123" });

    const result = await controller.createPortalSession("org1");

    expect(findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: "org1" },
      select: { stripeCustomerId: true },
    });
    // No NEXSTEPS_HOME_BILLING_RETURN_URL set - must not send a made-up
    // default (e.g. an unverified custom URL scheme) to Stripe, since a
    // non-http(s) return_url could be rejected by Stripe's API and 500
    // this endpoint for every user. Omitted, the portal falls back to its
    // dashboard-configured default.
    expect(stripeCreate).toHaveBeenCalledWith({ customer: "cus_123" });
    expect(result).toEqual({ url: "https://billing.stripe.com/session/abc" });
  });

  it("passes return_url when NEXSTEPS_HOME_BILLING_RETURN_URL is set", async () => {
    process.env.NEXSTEPS_HOME_BILLING_RETURN_URL = "https://app.nexsteps.dev/family/membership";
    stripeCreate.mockResolvedValue({ url: "https://billing.stripe.com/session/abc" });
    findUniqueOrThrow.mockResolvedValue({ stripeCustomerId: "cus_123" });

    await controller.createPortalSession("org1");

    expect(stripeCreate).toHaveBeenCalledWith({
      customer: "cus_123",
      return_url: "https://app.nexsteps.dev/family/membership",
    });
  });

  it("throws NotFoundException when the org has no stripe customer", async () => {
    findUniqueOrThrow.mockResolvedValue({ stripeCustomerId: null });

    await expect(controller.createPortalSession("org1")).rejects.toThrow(NotFoundException);
  });

  it("rethrows (does not swallow) when Stripe rejects the session creation", async () => {
    findUniqueOrThrow.mockResolvedValue({ stripeCustomerId: "cus_123" });
    stripeCreate.mockRejectedValue(new Error("Stripe API error"));

    await expect(controller.createPortalSession("org1")).rejects.toThrow("Stripe API error");
  });
});
