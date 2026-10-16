import { ServiceUnavailableException } from "@nestjs/common";
import {
  assertDeclaredCapacityAutomaticTaxEnabled,
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

  it("leaves VAT collection off without blocking checkout before registration", async () => {
    delete process.env.DECLARED_CAPACITY_VAT_ENABLED;

    expect(isDeclaredCapacityVatEnabled()).toBe(false);
    expect(() =>
      assertDeclaredCapacityAutomaticTaxEnabled(false),
    ).not.toThrow();
    expect(declaredCapacityCheckoutTaxOptions("DECLARED_CAPACITY_V2")).toEqual(
      {},
    );
    const loadActiveRegistrations = jest.fn(async () => []);

    await expect(
      assertDeclaredCapacityTaxRegistration(loadActiveRegistrations, true),
    ).resolves.toBeUndefined();
    expect(loadActiveRegistrations).not.toHaveBeenCalled();
  });

  it("enables automatic tax only when VAT collection is enabled", () => {
    process.env.DECLARED_CAPACITY_VAT_ENABLED = "true";

    expect(() => assertDeclaredCapacityAutomaticTaxEnabled(true)).not.toThrow();
    expect(() => assertDeclaredCapacityAutomaticTaxEnabled(false)).toThrow(
      ServiceUnavailableException,
    );
    expect(declaredCapacityCheckoutTaxOptions("DECLARED_CAPACITY_V2")).toEqual({
      automatic_tax: { enabled: true },
    });
    expect(declaredCapacityCheckoutTaxOptions("ENROLLED_CHILDREN_V2")).toEqual(
      {},
    );
  });

  it("requires an active UK tax registration when VAT collection is enabled", async () => {
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
