import "dotenv/config";
import { closePrisma } from "@pathway/db";
import { PrismaBillingOperationStore } from "./billing-operation.store";
import { BillingWorkerJob } from "./billing-worker.job";
import { HttpBillingOperationExecutor } from "./http-billing-operation.executor";

async function main(): Promise<void> {
  if (process.env.BILLING_WORKER_ENABLED !== "true") {
    console.log("[institutional-billing] worker disabled");
    return;
  }
  const endpoint = process.env.BILLING_INTERNAL_API_URL?.trim();
  if (!endpoint) throw new Error("BILLING_INTERNAL_API_URL is required");
  const job = new BillingWorkerJob(
    new PrismaBillingOperationStore(),
    new HttpBillingOperationExecutor(
      new URL(endpoint),
      process.env.INTERNAL_AUTH_SECRET?.trim() ?? "",
    ),
  );
  const result = await job.run();
  console.log("[institutional-billing] run", result);
  if (result.overdue > 0 || result.reviewRequired > 0) {
    console.error(
      "[institutional-billing] alert: overdue or review-required operations",
      result,
    );
    process.exitCode = 2;
  }
}

main()
  .catch((error: unknown) => {
    console.error("[institutional-billing] run failed", error);
    process.exitCode = 1;
  })
  .finally(async () => closePrisma());
