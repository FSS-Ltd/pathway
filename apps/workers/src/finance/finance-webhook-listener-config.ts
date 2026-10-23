import { financeWebhookPostgresConfig } from "./finance-webhook-postgres-config";
import { readFinanceReconciliationMode } from "./finance-reconciliation-config";

export type FinanceWebhookListenerConfig =
  | { enabled: false }
  | {
      enabled: true;
      livemode: boolean;
      databaseUrl: string;
      baseUrl: URL;
      secret: string;
    };

export function readFinanceWebhookListenerConfig(
  env: Record<string, string | undefined>,
): FinanceWebhookListenerConfig {
  const enabled = env.ENABLE_FINANCE_WEBHOOK_LISTENER;
  if (enabled === undefined || enabled === "false") return { enabled: false };
  if (enabled !== "true")
    throw new Error("ENABLE_FINANCE_WEBHOOK_LISTENER must be true or false");
  const livemode = readFinanceReconciliationMode(
    env.FINANCE_RECONCILIATION_MODE,
  );
  if (livemode === undefined)
    throw new Error("Finance listener requires an explicit test or live mode");
  const databaseUrl = env.FINANCE_WEBHOOK_LISTENER_DATABASE_URL?.trim();
  const apiUrl = env.BILLING_INTERNAL_API_URL?.trim();
  const secret = env.INTERNAL_AUTH_SECRET?.trim();
  if (!databaseUrl || !apiUrl || !secret)
    throw new Error(
      "Finance listener requires its dedicated database URL, internal API URL and secret",
    );
  financeWebhookPostgresConfig(databaseUrl);
  return {
    enabled: true,
    livemode,
    databaseUrl,
    baseUrl: new URL(apiUrl),
    secret,
  };
}
