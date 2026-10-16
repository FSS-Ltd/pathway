import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { InstitutionalPublicCheckoutController } from "../institutional-public-checkout.controller";
import { InstitutionalPublicCheckoutService } from "../institutional-public-checkout.service";

describe("public institutional checkout settings", () => {
  const checkout = jest
    .fn()
    .mockResolvedValue({ checkoutUrl: "https://checkout.example.test" });
  const checkoutDeclaredCapacity = jest
    .fn()
    .mockResolvedValue({ checkoutUrl: "https://checkout.example.test" });
  let controller: InstitutionalPublicCheckoutController;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [InstitutionalPublicCheckoutController],
      providers: [
        {
          provide: InstitutionalPublicCheckoutService,
          useValue: { checkout, checkoutDeclaredCapacity },
        },
      ],
    }).compile();
    controller = module.get(InstitutionalPublicCheckoutController);
  });

  beforeEach(() => {
    checkout.mockClear();
    checkoutDeclaredCapacity.mockClear();
  });

  const request = (setting: string) => ({
    planCode: "INSTITUTIONAL_STARTER_MONTHLY",
    enrolledChildren: 26,
    declarationAccepted: true,
    setting,
    storageChoice: "none",
    includedModules: [],
    paidModules: [],
    idempotencyKey: "school-path-checkout",
    org: {
      orgName: "Example organisation",
      contactName: "Example contact",
      contactEmail: "contact@example.test",
      password: "safe-test-password",
    },
  });

  it.each([
    "CHURCH",
    "INDEPENDENT_SCHOOL",
    "ACE_SCHOOL",
    "STATE_SCHOOL",
    "ACE_LEARNING_CENTRE",
    "PUBLIC_LEARNING_CENTRE",
    "NURSERY",
    "CHARITY",
    "CLUB",
  ])("accepts the %s setting", async (setting) => {
    await controller.checkout(request(setting));
    expect(checkout).toHaveBeenCalledWith(expect.objectContaining({ setting }));
  });

  it("rejects an unsupported setting before calling checkout", () => {
    expect(() => controller.checkout(request("UNKNOWN"))).toThrow(
      BadRequestException,
    );
    expect(checkout).not.toHaveBeenCalled();
  });

  it("requires the public declared-capacity checkout amount to be confirmed", async () => {
    const request = {
      declaredCapacity: 75,
      interval: "month",
      expectedTotalPence: 14_900,
      declarationAccepted: true,
      setting: "NURSERY",
      payNowModules: [],
      trialModules: [],
      idempotencyKey: "declared-capacity-checkout",
      org: {
        orgName: "Example organisation",
        contactName: "Example contact",
        contactEmail: "contact@example.test",
        password: "safe-test-password",
      },
    };
    await controller.checkoutDeclaredCapacity(request);
    expect(checkoutDeclaredCapacity).toHaveBeenCalledWith(request);

    expect(() =>
      controller.checkoutDeclaredCapacity({
        ...request,
        expectedTotalPence: undefined,
      }),
    ).toThrow(BadRequestException);
  });
});
