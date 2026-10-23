import "dotenv/config";
import { closePrisma } from "@pathway/db";
import { readFinanceReconciliationMode } from "./finance-reconciliation-config";
import { FinanceStripeWebhookJob } from "./finance-stripe-webhook.job";
import { HttpFinanceStripeWebhookProcessor } from "./http-finance-stripe-webhook-processor";
import { PrismaFinanceStripeWebhookStore } from "./finance-stripe-webhook.store";

async function main(): Promise<void> {
  const rawUrl = process.env.BILLING_INTERNAL_API_URL?.trim();
  const secret = process.env.INTERNAL_AUTH_SECRET?.trim();
  if (!rawUrl) throw new Error("BILLING_INTERNAL_API_URL is required");
  if (!secret) throw new Error("INTERNAL_AUTH_SECRET is required");

  const livemode = readFinanceReconciliationMode(
    process.env.FINANCE_RECONCILIATION_MODE,
  );
  const result = await new FinanceStripeWebhookJob(
    new PrismaFinanceStripeWebhookStore(livemode),
    new HttpFinanceStripeWebhookProcessor(new URL(rawUrl), secret),
  ).run();
  console.log("[finance-stripe-webhook] run", result);
  if (result.deadLettered > 0) {
    console.error("[finance-stripe-webhook] dead-lettered events", result);
    process.exitCode = 2;
  }
}

main()
  .catch((error: unknown) => {
    console.error("[finance-stripe-webhook] run failed", error);
    process.exitCode = 1;
  })
  .finally(async () => closePrisma().catch(() => undefined));
