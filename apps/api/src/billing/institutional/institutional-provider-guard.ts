import { ServiceUnavailableException } from "@nestjs/common";
import type { BillingProviderConfig } from "../billing-provider.config";

export function institutionalStripeKey(
  config: BillingProviderConfig,
  action: "CHECKOUT" | "PROVIDER_WRITES",
): string {
  const key = config.stripe.secretKey;
  const providerIsTest = config.activeProvider === "STRIPE_TEST";
  const providerIsLive = config.activeProvider === "STRIPE";
  const environmentMatches =
    (providerIsTest && /^(?:sk|rk)_test_/.test(key ?? "")) ||
    (providerIsLive && /^(?:sk|rk)_live_/.test(key ?? ""));
  const liveEnabled =
    !providerIsLive ||
    process.env.INSTITUTIONAL_LIVE_ACTIVATION_VERIFIED === "true" ||
    process.env.INSTITUTIONAL_LIVE_LAUNCH_APPROVED === "true";
  if (
    !key ||
    !environmentMatches ||
    !liveEnabled ||
    process.env.INSTITUTIONAL_PROVIDER_WRITES_ENABLED !== "true" ||
    (action === "CHECKOUT" &&
      process.env.INSTITUTIONAL_CHECKOUT_ENABLED !== "true")
  ) {
    throw new ServiceUnavailableException({
      code:
        action === "CHECKOUT"
          ? "INSTITUTIONAL_CHECKOUT_DISABLED"
          : "INSTITUTIONAL_PROVIDER_WRITES_DISABLED",
    });
  }
  return key;
}
