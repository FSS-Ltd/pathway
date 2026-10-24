import type { ClientConfig } from "pg";
import { FinanceWebhookSubscriptionError } from "./finance-webhook-subscription-error";

export function financeWebhookPostgresConfig(rawUrl: string): ClientConfig {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new FinanceWebhookSubscriptionError("CONFIGURATION");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.username ||
    !url.password ||
    url.pathname.length < 2 ||
    url.hash ||
    [...url.searchParams.keys()].some(
      (key) => !["schema", "pgbouncer", "sslmode"].includes(key),
    ) ||
    url.port === "6543" ||
    url.searchParams.get("pgbouncer") === "true" ||
    (!local && url.searchParams.get("sslmode") === "disable")
  ) {
    throw new FinanceWebhookSubscriptionError("CONFIGURATION");
  }
  // URL SSL options otherwise override pg's explicit certificate verification.
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith("ssl")) url.searchParams.delete(key);
  }
  url.searchParams.delete("schema");
  url.searchParams.delete("pgbouncer");
  return {
    connectionString: url.toString(),
    ssl: local ? false : { rejectUnauthorized: true },
    connectionTimeoutMillis: 5_000,
    query_timeout: 5_000,
    statement_timeout: 5_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 60_000,
    application_name: "pathway-finance-webhook-listener",
  };
}
