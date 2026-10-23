import type { FinanceStripeConnectConfig } from "./finance-stripe-connect.config";

export type FinanceStripeServicingConfig =
  | { mode: "disabled" }
  | { mode: "test" | "live"; secretKey: string };

export const FINANCE_STRIPE_SERVICING_CONFIG = Symbol(
  "FINANCE_STRIPE_SERVICING_CONFIG",
);

export function loadFinanceStripeServicingConfig(
  connect: FinanceStripeConnectConfig,
  env: NodeJS.ProcessEnv = process.env,
): FinanceStripeServicingConfig {
  const mode =
    env.FINANCE_STRIPE_SERVICING_MODE?.trim().toLowerCase() || connect.mode;
  if (mode === "disabled") return { mode: "disabled" };
  if (mode !== "test" && mode !== "live")
    throw new Error(
      "Finance Stripe servicing mode must be disabled, test, or live",
    );
  if (connect.mode !== "disabled" && connect.mode !== mode)
    throw new Error(
      "Finance Stripe servicing and collection environments must match",
    );

  const vercelEnv = env.VERCEL_ENV?.trim().toLowerCase();
  if (
    mode === "live" &&
    (env.NODE_ENV !== "production" || vercelEnv !== "production")
  )
    throw new Error(
      "Finance Stripe live servicing requires the production runtime",
    );
  if (
    mode === "test" &&
    (vercelEnv === "production" ||
      (!vercelEnv && env.NODE_ENV === "production"))
  )
    throw new Error(
      "Finance Stripe test servicing is unavailable in production",
    );

  const configuredKey =
    mode === "test"
      ? env.FINANCE_STRIPE_SERVICING_SECRET_KEY_TEST
      : env.FINANCE_STRIPE_SERVICING_SECRET_KEY_LIVE;
  const secretKey =
    configuredKey?.trim() ?? (connect.mode === mode ? connect.secretKey : "");
  if (!new RegExp(`^(?:sk|rk)_${mode}_`).test(secretKey))
    throw new Error(
      "Finance Stripe servicing requires a matching secret or restricted API key",
    );
  return { mode, secretKey };
}
