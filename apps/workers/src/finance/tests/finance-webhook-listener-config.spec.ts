import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { readFinanceWebhookListenerConfig } from "../finance-webhook-listener-config";

const enabled = {
  ENABLE_FINANCE_WEBHOOK_LISTENER: "true",
  FINANCE_RECONCILIATION_MODE: "test",
  FINANCE_WEBHOOK_LISTENER_DATABASE_URL:
    "postgresql://listener:synthetic@127.0.0.1:5432/finance_test",
  BILLING_INTERNAL_API_URL: "http://127.0.0.1:3000",
  INTERNAL_AUTH_SECRET: "synthetic_internal_test_only",
};

describe("explicit Finance listener activation", () => {
  it("exits disabled without loading a database engine or requiring credentials", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "src/finance/run-finance-stripe-webhook-listener.cli.ts",
      ],
      {
        cwd: resolve(__dirname, "../../.."),
        encoding: "utf8",
        timeout: 10_000,
        env: {
          PATH: process.env.PATH,
          ENABLE_FINANCE_WEBHOOK_LISTENER: "false",
          PRISMA_QUERY_ENGINE_LIBRARY:
            "/tmp/pathway-finance-disabled-no-engine.node",
        },
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "[finance-stripe-webhook-listener] disabled",
    );
    expect(result.stderr).toBe("");
  }, 20_000);
  it.each([undefined, "false"])(
    "remains disabled without an explicit true flag: %s",
    (value) => {
      expect(
        readFinanceWebhookListenerConfig({
          ENABLE_FINANCE_WEBHOOK_LISTENER: value,
        }),
      ).toEqual({ enabled: false });
    },
  );
  it("fails closed on a malformed activation flag", () => {
    expect(() =>
      readFinanceWebhookListenerConfig({
        ENABLE_FINANCE_WEBHOOK_LISTENER: "yes",
      }),
    ).toThrow();
  });
  it.each(["test", "live"])(
    "requires an explicit %s mode and dedicated session URL",
    (mode) => {
      expect(
        readFinanceWebhookListenerConfig({
          ...enabled,
          FINANCE_RECONCILIATION_MODE: mode,
        }),
      ).toEqual({
        enabled: true,
        livemode: mode === "live",
        databaseUrl: enabled.FINANCE_WEBHOOK_LISTENER_DATABASE_URL,
        baseUrl: new URL(enabled.BILLING_INTERNAL_API_URL),
        secret: enabled.INTERNAL_AUTH_SECRET,
      });
    },
  );
  it.each([
    "FINANCE_RECONCILIATION_MODE",
    "FINANCE_WEBHOOK_LISTENER_DATABASE_URL",
    "BILLING_INTERNAL_API_URL",
    "INTERNAL_AUTH_SECRET",
  ])("does not infer a missing %s from other credentials", (name) => {
    expect(() =>
      readFinanceWebhookListenerConfig({
        ...enabled,
        DATABASE_URL:
          "postgresql://migration:synthetic@localhost:5432/finance_test",
        [name]: undefined,
      }),
    ).toThrow();
  });
});
