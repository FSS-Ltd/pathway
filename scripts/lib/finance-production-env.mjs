export const STRIPE_PRODUCTION_SYNC_KEYS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET_SNAPSHOT",
  "STRIPE_WEBHOOK_SECRET_THIN",
  "STRIPE_PRICE_MAP",
  "STRIPE_PUBLISHABLE_KEY",
  "STRIPE_SUCCESS_URL",
  "STRIPE_CANCEL_URL",
];

export const FINANCE_PRODUCTION_SYNC_KEYS = [
  "FINANCE_STRIPE_CONNECT_MODE",
  "FINANCE_STRIPE_LIVE_ENABLED",
  "FINANCE_STRIPE_CONNECT_RETURN_URL",
  "FINANCE_STRIPE_CONNECT_REFRESH_URL",
  "FINANCE_STRIPE_WEBHOOK_SECRET_LIVE",
];

export const STRIPE_TEST_ONLY_KEYS = [
  "STRIPE_SECRET_KEY_TEST",
  "TEST_STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET_TEST",
  "STRIPE_PRICE_MAP_TEST",
  "FINANCE_STRIPE_WEBHOOK_SECRET_TEST",
];

export function applyFinanceProductionDefaults(values) {
  return {
    ...values,
    FINANCE_STRIPE_CONNECT_MODE: values.FINANCE_STRIPE_CONNECT_MODE?.trim()
      ? values.FINANCE_STRIPE_CONNECT_MODE
      : "disabled",
    FINANCE_STRIPE_LIVE_ENABLED: values.FINANCE_STRIPE_LIVE_ENABLED?.trim()
      ? values.FINANCE_STRIPE_LIVE_ENABLED
      : "false",
  };
}

export function validateFinanceProductionEnv(values) {
  const errors = [];
  const billingProvider = normalize(values.BILLING_PROVIDER);
  const connectMode = normalize(values.FINANCE_STRIPE_CONNECT_MODE);
  const liveEnabled = normalize(values.FINANCE_STRIPE_LIVE_ENABLED);

  if (liveEnabled && liveEnabled !== "TRUE" && liveEnabled !== "FALSE") {
    errors.push("FINANCE_STRIPE_LIVE_ENABLED must be true or false.");
  }
  if (billingProvider === "STRIPE_TEST") {
    errors.push(
      "BILLING_PROVIDER=STRIPE_TEST cannot be synced to Vercel Production.",
    );
  }
  if (!connectMode || connectMode === "DISABLED") {
    if (liveEnabled === "TRUE") {
      errors.push(
        "FINANCE_STRIPE_LIVE_ENABLED requires FINANCE_STRIPE_CONNECT_MODE=live.",
      );
    }
    return errors;
  }
  if (connectMode === "TEST") {
    errors.push(
      "Finance test Connect mode cannot be synced to Vercel Production.",
    );
    return errors;
  }
  if (connectMode !== "LIVE") {
    errors.push(
      "FINANCE_STRIPE_CONNECT_MODE must be disabled or live for Vercel Production.",
    );
    return errors;
  }

  if (liveEnabled !== "TRUE") {
    errors.push(
      "Finance live Connect requires FINANCE_STRIPE_LIVE_ENABLED=true.",
    );
  }
  if (billingProvider !== "STRIPE") {
    errors.push(
      "Finance live Connect requires BILLING_PROVIDER=STRIPE in Vercel Production.",
    );
  }
  for (const key of [
    "FINANCE_STRIPE_CONNECT_RETURN_URL",
    "FINANCE_STRIPE_CONNECT_REFRESH_URL",
    "FINANCE_STRIPE_WEBHOOK_SECRET_LIVE",
  ]) {
    if (!values[key]?.trim()) {
      errors.push(`${key} is required when Finance live Connect is enabled.`);
    }
  }
  return errors;
}

function normalize(value) {
  return (value ?? "").trim().toUpperCase();
}
