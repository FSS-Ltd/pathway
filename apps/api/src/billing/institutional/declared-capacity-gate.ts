import { ServiceUnavailableException } from "@nestjs/common";
import { DECLARED_CAPACITY_PRICING_VERSION } from "@pathway/pricing";

export function assertDeclaredCapacityBillingEnabled(): void {
  if (process.env.DECLARED_CAPACITY_BILLING_ENABLED !== "true") {
    throw new ServiceUnavailableException({
      code: "DECLARED_CAPACITY_BILLING_UNAVAILABLE",
    });
  }
}

export function isDeclaredCapacityVatEnabled(): boolean {
  return process.env.DECLARED_CAPACITY_VAT_ENABLED === "true";
}

export function assertDeclaredCapacityAutomaticTaxEnabled(
  automaticTaxEnabled: boolean,
): void {
  if (isDeclaredCapacityVatEnabled() && !automaticTaxEnabled) {
    throw new ServiceUnavailableException({
      code: "DECLARED_CAPACITY_VAT_UNAVAILABLE",
    });
  }
}

export async function assertDeclaredCapacityTaxRegistration(
  loadActiveRegistrations: () => Promise<
    ReadonlyArray<
      Readonly<{ status: string; country: string; livemode: boolean }>
    >
  >,
  live: boolean,
): Promise<void> {
  if (!isDeclaredCapacityVatEnabled()) return;

  try {
    const registrations = await loadActiveRegistrations();
    if (
      !registrations.some(
        (registration) =>
          registration.status === "active" &&
          registration.country === "GB" &&
          registration.livemode === live,
      )
    ) {
      throw new ServiceUnavailableException({
        code: "DECLARED_CAPACITY_VAT_UNAVAILABLE",
      });
    }
  } catch (error) {
    if (error instanceof ServiceUnavailableException) throw error;
    throw new ServiceUnavailableException({
      code: "DECLARED_CAPACITY_VAT_UNAVAILABLE",
    });
  }
}

export function declaredCapacityCheckoutTaxOptions(pricingVersion: string): {
  automatic_tax?: { enabled: true };
} {
  if (
    pricingVersion !== DECLARED_CAPACITY_PRICING_VERSION ||
    !isDeclaredCapacityVatEnabled()
  ) {
    return {};
  }
  return { automatic_tax: { enabled: true } };
}
