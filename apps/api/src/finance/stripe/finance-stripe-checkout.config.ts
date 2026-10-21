import type { FinanceStripeConnectConfig } from "./finance-stripe-connect.config";

export type FinanceStripeCheckoutConfig =
  | { mode: "disabled" }
  | {
      mode: "test";
      secretKey: string;
      webAppUrl: string;
    }
  | {
      mode: "live";
      secretKey: string;
      webAppUrl: string;
    };

export const FINANCE_STRIPE_CHECKOUT_CONFIG = Symbol(
  "FINANCE_STRIPE_CHECKOUT_CONFIG",
);

export function loadFinanceStripeCheckoutConfig(
  connect: FinanceStripeConnectConfig,
  env: NodeJS.ProcessEnv = process.env,
): FinanceStripeCheckoutConfig {
  if (connect.mode === "disabled") return { mode: "disabled" };

  const raw = env.WEB_APP_URL?.trim();
  if (!raw) {
    throw new Error("WEB_APP_URL is required for Finance Stripe Checkout");
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("WEB_APP_URL must be an absolute URL");
  }
  const localTestHost =
    connect.mode === "test" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (url.protocol !== "https:" && !localTestHost) {
    throw new Error("Finance Stripe Checkout return URLs must use HTTPS");
  }
  if (
    url.pathname !== "/" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("WEB_APP_URL must contain only the application origin");
  }

  return {
    mode: connect.mode,
    secretKey: connect.secretKey,
    webAppUrl: url.origin,
  };
}
