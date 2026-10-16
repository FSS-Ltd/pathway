import "dotenv/config";
import { closePrisma } from "@pathway/db";
import { ExpireAddonTrialsJob } from "./expire-addon-trials.job";
import { HttpAddonTrialExpiryDispatcher } from "./http-addon-trial-expiry.dispatcher";

async function main(): Promise<void> {
  if (process.env.INSTITUTIONAL_ADDON_TRIAL_WORKER_ENABLED !== "true") {
    console.log("[addon-trial-expiry] worker disabled");
    return;
  }
  const endpoint = process.env.BILLING_INTERNAL_API_URL?.trim();
  if (!endpoint) throw new Error("BILLING_INTERNAL_API_URL is required");
  const job = new ExpireAddonTrialsJob(
    new HttpAddonTrialExpiryDispatcher(
      new URL(endpoint),
      process.env.INTERNAL_AUTH_SECRET?.trim() ?? "",
    ),
  );
  const result = await job.run();
  console.log("[addon-trial-expiry] run", result);
  if (result.failed > 0) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error("[addon-trial-expiry] run failed", error);
    process.exitCode = 1;
  })
  .finally(async () => closePrisma().catch(() => undefined));
