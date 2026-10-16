import { ServiceUnavailableException } from "@nestjs/common";
import {
  assertDeclaredCapacityTaxRegistration,
  declaredCapacityCheckoutTaxOptions,
  isDeclaredCapacityVatEnabled,
} from "../declared-capacity-gate";

describe("declared-capacity VAT readiness", () => {
  const originalVatFlag = process.env.DECLARED_CAPACITY_VAT_ENABLED;

  afterEach(() => {
    if (originalVatFlag === undefined) {
      delete process.env.DECLARED_CAPACITY_VAT_ENABLED;
    } else {
      process.env.DECLARED_CAPACITY_VAT_ENABLED = originalVatFlag;
    }
  });

  it("keeps V2 checkout fail-closed until VAT readiness is explicit", () => {
    delete process.env.DECLARED_CAPACITY_VAT_ENABLED;

    expect(isDeclaredCapacityVatEnabled()).toBe(false);
    expect(() =>
      declaredCapacityCheckoutTaxOptions("DECLARED_CAPACITY_V2"),
    ).toThrow(ServiceUnavailableException);
  });

  it("enables automatic tax only for VAT-ready V2 checkout", () => {
    process.env.DECLARED_CAPACITY_VAT_ENABLED = "true";

    expect(declaredCapacityCheckoutTaxOptions("DECLARED_CAPACITY_V2")).toEqual({
      automatic_tax: { enabled: true },
    });
    expect(declaredCapacityCheckoutTaxOptions("ENROLLED_CHILDREN_V2")).toEqual(
      {},
    );
  });

  it("requires an active UK tax registration for the expected provider mode", async () => {
    process.env.DECLARED_CAPACITY_VAT_ENABLED = "true";
    const loadActiveRegistrations = jest.fn(async () => [
      { status: "active", country: "GB", livemode: true },
    ]);

    await expect(
      assertDeclaredCapacityTaxRegistration(loadActiveRegistrations, true),
    ).resolves.toBeUndefined();
    await expect(
      assertDeclaredCapacityTaxRegistration(loadActiveRegistrations, false),
    ).rejects.toThrow(ServiceUnavailableException);
  });
});
