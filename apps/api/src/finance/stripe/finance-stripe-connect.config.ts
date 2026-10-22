import type { BillingProviderConfig } from "../../billing/billing-provider.config";

export type FinanceStripeConnectConfig =
  | { mode: "disabled" }
  | {
      mode: "test" | "live";
      secretKey: string;
      returnUrl: string;
      refreshUrl: string;
    };

export const FINANCE_STRIPE_CONNECT_CONFIG = Symbol(
  "FINANCE_STRIPE_CONNECT_CONFIG",
);

export function loadFinanceStripeConnectConfig(
  billing: BillingProviderConfig,
  env: NodeJS.ProcessEnv = process.env,
): FinanceStripeConnectConfig {
  const mode = env.FINANCE_STRIPE_CONNECT_MODE?.trim().toLowerCase();
  const liveSwitch = env.FINANCE_STRIPE_LIVE_ENABLED?.trim().toLowerCase();
  if (liveSwitch && liveSwitch !== "true" && liveSwitch !== "false") {
    throw new Error("FINANCE_STRIPE_LIVE_ENABLED must be true or false");
  }
  const liveEnabled = liveSwitch === "true";
  const vercelEnv = env.VERCEL_ENV?.trim().toLowerCase();

  if (!mode || mode === "disabled") {
    if (liveEnabled) {
      throw new Error(
        "FINANCE_STRIPE_LIVE_ENABLED requires FINANCE_STRIPE_CONNECT_MODE=live",
      );
    }
    return { mode: "disabled" };
  }
  if (mode !== "test" && mode !== "live") {
    throw new Error(
      "FINANCE_STRIPE_CONNECT_MODE must be disabled, test, or live",
    );
  }

  if (
    mode === "live" &&
    (!liveEnabled ||
      env.NODE_ENV !== "production" ||
      vercelEnv !== "production")
  ) {
    throw new Error(
      "Finance Stripe live mode requires an explicit production opt-in",
    );
  }
  if (
    mode === "test" &&
    (vercelEnv === "production" ||
      (!vercelEnv && env.NODE_ENV === "production"))
  ) {
    throw new Error("Finance test mode is unavailable in a production runtime");
  }
  if (liveEnabled && mode !== "live") {
    throw new Error(
      "FINANCE_STRIPE_LIVE_ENABLED requires FINANCE_STRIPE_CONNECT_MODE=live",
    );
  }

  const expectedProvider = mode === "test" ? "STRIPE_TEST" : "STRIPE";
  if (
    billing.activeProvider !== expectedProvider ||
    !billing.stripe.secretKey
  ) {
    throw new Error(
      `Finance Stripe Connect ${mode} mode requires the matching Stripe billing provider and secret key`,
    );
  }

  return {
    mode,
    secretKey: billing.stripe.secretKey,
    returnUrl: requiredRedirectUrl(env.FINANCE_STRIPE_CONNECT_RETURN_URL, mode),
    refreshUrl: requiredRedirectUrl(
      env.FINANCE_STRIPE_CONNECT_REFRESH_URL,
      mode,
    ),
  };
}

function requiredRedirectUrl(value: string | undefined, mode: "test" | "live") {
  if (!value) {
    throw new Error(
      "Finance Stripe Connect return and refresh URLs are required",
    );
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      "Finance Stripe Connect redirect URLs must be absolute URLs",
    );
  }
  const localTestHost =
    mode === "test" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (url.protocol !== "https:" && !localTestHost) {
    throw new Error("Finance Stripe Connect redirect URLs must use HTTPS");
  }
  return url.toString();
}
