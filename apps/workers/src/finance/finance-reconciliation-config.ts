export type FinanceReconciliationConfig =
  | { enabled: false }
  | { enabled: true; livemode: boolean; baseUrl: URL; secret: string };
export function readFinanceReconciliationConfig(
  env: Record<string, string | undefined>,
): FinanceReconciliationConfig {
  if (env.ENABLE_FINANCE_RECONCILIATION !== "true") return { enabled: false };
  const mode = env.FINANCE_RECONCILIATION_MODE;
  if (mode !== "test" && mode !== "live")
    throw new Error(
      "FINANCE_RECONCILIATION_MODE must explicitly be test or live",
    );
  const url = env.BILLING_INTERNAL_API_URL?.trim();
  const secret = env.INTERNAL_AUTH_SECRET?.trim();
  if (!url || !secret)
    throw new Error(
      "Finance recovery requires BILLING_INTERNAL_API_URL and INTERNAL_AUTH_SECRET",
    );
  return {
    enabled: true,
    livemode: mode === "live",
    baseUrl: new URL(url),
    secret,
  };
}

/** Undefined preserves the existing unfiltered worker; a configured mode is always explicit. */
export function readFinanceReconciliationMode(
  value: string | undefined,
): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === "test") return false;
  if (value === "live") return true;
  throw new Error(
    "FINANCE_RECONCILIATION_MODE must explicitly be test or live",
  );
}
