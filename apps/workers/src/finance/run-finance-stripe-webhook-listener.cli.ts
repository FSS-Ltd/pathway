import "dotenv/config";
import { FinanceStripeWebhookJob } from "./finance-stripe-webhook.job";
import { HttpFinanceStripeWebhookProcessor } from "./http-finance-stripe-webhook-processor";
import { FinanceStripeWebhookListener } from "./finance-stripe-webhook-listener";
import { PostgresFinanceWebhookSubscription } from "./postgres-finance-webhook-subscription";
import { readFinanceWebhookListenerConfig } from "./finance-webhook-listener-config";

async function main(): Promise<void> {
  const config = readFinanceWebhookListenerConfig(process.env);
  if (!config.enabled) {
    console.info("[finance-stripe-webhook-listener] disabled");
    return;
  }
  const processor = new HttpFinanceStripeWebhookProcessor(
    config.baseUrl,
    config.secret,
  );
  // Disabled mode must not initialize Prisma or require a generated engine.
  const { closePrisma } = await import("@pathway/db");
  try {
    const { PrismaFinanceStripeWebhookStore } =
      await import("./finance-stripe-webhook.store");
    const job = new FinanceStripeWebhookJob(
      new PrismaFinanceStripeWebhookStore(config.livemode),
      processor,
    );
    await runListener(job, config.databaseUrl, config.livemode);
  } finally {
    try {
      await closePrisma();
    } catch {
      process.exitCode = 1;
      console.error(
        "[finance-stripe-webhook-listener] database shutdown failed",
      );
    }
  }
}

async function runListener(
  job: FinanceStripeWebhookJob,
  databaseUrl: string,
  livemode: boolean,
): Promise<void> {
  let finish: () => void = () => {};
  const stopped = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let closing: Promise<void> | null = null;
  const listener = new FinanceStripeWebhookListener({
    createSubscription: () =>
      new PostgresFinanceWebhookSubscription(databaseUrl, livemode),
    runScopes: (scopes, signal) => job.runScopes(scopes, signal),
    onState: (state, reason) => {
      console.info("[finance-stripe-webhook-listener] state", {
        state,
        reason,
      });
      if (state === "failed") {
        process.exitCode = 1;
        requestStop();
      }
    },
  });
  function requestStop(): void {
    closing ??= listener.stop().catch(() => {
      process.exitCode = 1;
      console.error(
        "[finance-stripe-webhook-listener] shutdown failed; claims remain recoverable",
      );
    });
    finish();
  }
  process.once("SIGINT", requestStop);
  process.once("SIGTERM", requestStop);
  try {
    await listener.start();
    await stopped;
  } finally {
    process.removeListener("SIGINT", requestStop);
    process.removeListener("SIGTERM", requestStop);
    await (closing ?? listener.stop());
  }
}

main().catch(() => {
  process.exitCode = 1;
  console.error(
    "[finance-stripe-webhook-listener] startup failed; check approved configuration and grants",
  );
});
