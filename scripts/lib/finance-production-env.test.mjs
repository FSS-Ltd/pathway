import assert from "node:assert/strict";
import test from "node:test";
import {
  applyFinanceProductionDefaults,
  FINANCE_PRODUCTION_SYNC_KEYS,
  STRIPE_PRODUCTION_SYNC_KEYS,
  STRIPE_TEST_ONLY_KEYS,
  validateFinanceProductionEnv,
} from "./finance-production-env.mjs";

test("production sync defaults Finance Connect to disabled", () => {
  assert.deepEqual(
    applyFinanceProductionDefaults({ BILLING_PROVIDER: "STRIPE" }),
    {
      BILLING_PROVIDER: "STRIPE",
      FINANCE_STRIPE_CONNECT_MODE: "disabled",
      FINANCE_STRIPE_LIVE_ENABLED: "false",
    },
  );
});

test("production sync allowlists live Stripe secrets and excludes test secrets", () => {
  const productionKeys = [
    ...STRIPE_PRODUCTION_SYNC_KEYS,
    ...FINANCE_PRODUCTION_SYNC_KEYS,
  ];

  for (const key of STRIPE_TEST_ONLY_KEYS) {
    assert.equal(productionKeys.includes(key), false, `${key} is test-only`);
  }
});

test("production preflight rejects test billing and Finance Connect modes", () => {
  assert.match(
    validateFinanceProductionEnv({
      BILLING_PROVIDER: "STRIPE_TEST",
      FINANCE_STRIPE_CONNECT_MODE: "disabled",
      FINANCE_STRIPE_LIVE_ENABLED: "false",
    }).join(" "),
    /STRIPE_TEST/,
  );
  assert.match(
    validateFinanceProductionEnv({
      BILLING_PROVIDER: "STRIPE",
      FINANCE_STRIPE_CONNECT_MODE: "test",
      FINANCE_STRIPE_LIVE_ENABLED: "false",
    }).join(" "),
    /Finance test Connect mode/,
  );
  assert.match(
    validateFinanceProductionEnv({
      BILLING_PROVIDER: "STRIPE",
      FINANCE_STRIPE_CONNECT_MODE: "disabled",
      FINANCE_STRIPE_LIVE_ENABLED: "yes",
    }).join(" "),
    /must be true or false/,
  );
});

test("live Finance Connect requires a production opt-in and isolated settings", () => {
  assert.deepEqual(
    validateFinanceProductionEnv({
      BILLING_PROVIDER: "STRIPE",
      FINANCE_STRIPE_CONNECT_MODE: "live",
      FINANCE_STRIPE_LIVE_ENABLED: "true",
    }),
    [
      "FINANCE_STRIPE_CONNECT_RETURN_URL is required when Finance live Connect is enabled.",
      "FINANCE_STRIPE_CONNECT_REFRESH_URL is required when Finance live Connect is enabled.",
      "FINANCE_STRIPE_WEBHOOK_SECRET_LIVE is required when Finance live Connect is enabled.",
    ],
  );

  assert.deepEqual(
    validateFinanceProductionEnv({
      BILLING_PROVIDER: "STRIPE",
      FINANCE_STRIPE_CONNECT_MODE: "live",
      FINANCE_STRIPE_LIVE_ENABLED: "true",
      FINANCE_STRIPE_CONNECT_RETURN_URL: "https://school.example/return",
      FINANCE_STRIPE_CONNECT_REFRESH_URL: "https://school.example/refresh",
      FINANCE_STRIPE_WEBHOOK_SECRET_LIVE: "whsec_finance_fixture",
    }),
    [],
  );
});
