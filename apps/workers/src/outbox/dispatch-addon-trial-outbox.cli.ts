import "dotenv/config";
import { closePrisma } from "@pathway/db";
import { createDispatchOutboxJob } from "./dispatch-outbox.job";
import {
  HttpOutboxDispatcher,
  loadInstitutionalAddonTrialOutboxEndpoint,
} from "./outbox-http-dispatcher";

const ADDON_TRIAL_EXPIRY_EVENT = "institutional.addon_trial.expired";

async function main(): Promise<void> {
  const institutionalAddonTrials = loadInstitutionalAddonTrialOutboxEndpoint(
    process.env,
  );
  if (!institutionalAddonTrials) {
    throw new Error("Add-on trial outbox dispatch is not configured");
  }
  const result = await createDispatchOutboxJob(
    new HttpOutboxDispatcher({
      genericUrl: institutionalAddonTrials.url,
      institutionalAddonTrials,
    }),
    [ADDON_TRIAL_EXPIRY_EVENT],
  ).run();
  console.log("[addon-trial-outbox] dispatch complete", result);
  if (result.deadLettered > 0) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error("[addon-trial-outbox] dispatch failed", error);
    process.exitCode = 1;
  })
  .finally(async () => closePrisma().catch(() => undefined));
