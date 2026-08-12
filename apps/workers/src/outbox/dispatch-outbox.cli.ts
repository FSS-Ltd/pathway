import "dotenv/config";
import { closePrisma } from "@pathway/db";
import { createDispatchOutboxJob } from "./dispatch-outbox.job";
import { HttpOutboxDispatcher } from "./outbox-http-dispatcher";

async function main(): Promise<void> {
  const url = process.env.OUTBOX_DISPATCH_URL?.trim();
  if (!url) {
    throw new Error("OUTBOX_DISPATCH_URL is required for outbox dispatch");
  }
  const result = await createDispatchOutboxJob(
    new HttpOutboxDispatcher(
      url,
      process.env.OUTBOX_DISPATCH_TOKEN?.trim(),
      process.env.INTERNAL_AUTH_SECRET?.trim(),
    ),
  ).run();
  console.log("[outbox] dispatch complete", result);
}

main()
  .catch((error) => {
    console.error("[outbox] dispatch failed", error);
    process.exitCode = 1;
  })
  .finally(async () => closePrisma().catch(() => undefined));
