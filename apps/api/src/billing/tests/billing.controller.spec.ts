import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { BillingController } from "../billing.controller";
import { BillingService } from "../billing.service";
import { EntitlementsService } from "../entitlements.service";
import { EntitlementsEnforcementService } from "../entitlements-enforcement.service";
import { AuthUserGuard } from "../../auth/auth-user.guard";
import { BILLING_PROVIDER_CONFIG, type BillingProviderConfig } from "../billing-provider.config";

describe("BillingController", () => {
  let controller: BillingController;
  let service: BillingService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BillingController],
      providers: [
        BillingService,
        {
          provide: EntitlementsService,
          useValue: { resolve: jest.fn() },
        },
        {
          provide: EntitlementsEnforcementService,
          useValue: { checkAv30ForOrg: jest.fn() },
        },
        {
          provide: BILLING_PROVIDER_CONFIG,
          useValue: { activeProvider: "FAKE", stripe: {}, goCardless: {} } as BillingProviderConfig,
        },
      ],
    })
      .overrideGuard(AuthUserGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(BillingController);
    service = module.get(BillingService);
  });

  it("checkout() validates payload and forwards to service", async () => {
    const spy = jest.spyOn(service, "checkout").mockResolvedValue({
      provider: "stripe",
      checkoutUrl: "https://example.com/success?session=sess_123",
      sessionId: "sess_123",
      planCode: "starter",
      mode: "subscription",
    });

    const payload = {
      provider: "stripe",
      orgId: "11111111-1111-1111-1111-111111111111",
      planCode: "starter",
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
    };

    const res = await controller.checkout(payload);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining(payload));
    expect(res.provider).toBe("stripe");
    expect(res.sessionId).toBe("sess_123");
  });

  it("checkout() throws 400 on invalid payload", async () => {
    await expect(
      controller.checkout({ planCode: "starter" } as unknown as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
