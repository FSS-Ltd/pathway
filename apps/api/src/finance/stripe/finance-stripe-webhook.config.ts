import type { FinanceStripeConnectConfig } from "./finance-stripe-connect.config";

export type FinanceStripeWebhookConfig =
  | { mode: "disabled" }
  | {
      mode: "test" | "live";
      secretKey: string;
      webhookSecret: string;
    };

export const FINANCE_STRIPE_WEBHOOK_CONFIG = Symbol(
  "FINANCE_STRIPE_WEBHOOK_CONFIG",
);

export function loadFinanceStripeWebhookConfig(
  connect: FinanceStripeConnectConfig,
  env: NodeJS.ProcessEnv = process.env,
): FinanceStripeWebhookConfig {
  if (connect.mode === "disabled") return { mode: "disabled" };

  const webhookSecret =
    connect.mode === "test"
      ? env.FINANCE_STRIPE_WEBHOOK_SECRET_TEST?.trim()
      : env.FINANCE_STRIPE_WEBHOOK_SECRET_LIVE?.trim();
  if (!webhookSecret) return { mode: "disabled" };

  return {
    mode: connect.mode,
    secretKey: connect.secretKey,
    webhookSecret,
  };
}
