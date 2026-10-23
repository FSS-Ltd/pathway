import type { FinanceStripeServicingConfig } from "./finance-stripe-servicing.config";

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
  servicing: FinanceStripeServicingConfig,
  env: NodeJS.ProcessEnv = process.env,
): FinanceStripeWebhookConfig {
  if (servicing.mode === "disabled") return { mode: "disabled" };

  const webhookSecret =
    servicing.mode === "test"
      ? env.FINANCE_STRIPE_WEBHOOK_SECRET_TEST?.trim()
      : env.FINANCE_STRIPE_WEBHOOK_SECRET_LIVE?.trim();
  if (!webhookSecret) return { mode: "disabled" };

  return {
    mode: servicing.mode,
    secretKey: servicing.secretKey,
    webhookSecret,
  };
}
