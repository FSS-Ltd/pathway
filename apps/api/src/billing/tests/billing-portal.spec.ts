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

  beforeEach(async () => {
    jest.clearAllMocks();

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

  it("returns a portal session url for an org with a stripe customer", async () => {
    stripeCreate.mockResolvedValue({ url: "https://billing.stripe.com/session/abc" });
    findUniqueOrThrow.mockResolvedValue({ stripeCustomerId: "cus_123" });

    const result = await controller.createPortalSession("org1");

    expect(findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: "org1" },
      select: { stripeCustomerId: true },
    });
    expect(stripeCreate).toHaveBeenCalledWith({
      customer: "cus_123",
      return_url: expect.any(String),
    });
    expect(result).toEqual({ url: "https://billing.stripe.com/session/abc" });
  });

  it("throws NotFoundException when the org has no stripe customer", async () => {
    findUniqueOrThrow.mockResolvedValue({ stripeCustomerId: null });

    await expect(controller.createPortalSession("org1")).rejects.toThrow(NotFoundException);
  });
});
