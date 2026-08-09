import "dotenv/config";
import { closePrisma } from "@pathway/db";
import {
  createDispatchOutboxJob,
  type OutboxDispatcher,
  type OutboxIntentForDispatch,
} from "./dispatch-outbox.job";

class HttpOutboxDispatcher implements OutboxDispatcher {
  async dispatch(intent: OutboxIntentForDispatch): Promise<void> {
    const url = process.env.OUTBOX_DISPATCH_URL?.trim();
    if (!url)
      throw new Error("OUTBOX_DISPATCH_URL is required for outbox dispatch");
    const token = process.env.OUTBOX_DISPATCH_TOKEN?.trim();
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": intent.idempotencyKey,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(intent),
    });
    if (!response.ok)
      throw new Error(`Outbox dispatch endpoint returned ${response.status}`);
  }
}

async function main(): Promise<void> {
  const result = await createDispatchOutboxJob(
    new HttpOutboxDispatcher(),
  ).run();
  console.log("[outbox] dispatch complete", result);
}

main()
  .catch((error) => {
    console.error("[outbox] dispatch failed", error);
    process.exitCode = 1;
  })
  .finally(async () => closePrisma().catch(() => undefined));
