import type {
  OutboxDispatcher,
  OutboxIntentForDispatch,
} from "./dispatch-outbox.job";

export class HttpOutboxDispatcher implements OutboxDispatcher {
  constructor(
    private readonly url: string,
    private readonly token?: string,
    private readonly internalSecret?: string,
  ) {}

  async dispatch(intent: OutboxIntentForDispatch): Promise<void> {
    const isBehaviourNotification =
      intent.eventType === "behaviour.guardian-notification.requested";
    const response = await fetch(dispatchUrl(this.url, intent.eventType), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": intent.idempotencyKey,
        ...(this.token
          ? {
              authorization: `Bearer ${this.token}`,
            }
          : {}),
        ...(isBehaviourNotification && this.internalSecret
          ? { "x-pathway-internal-secret": this.internalSecret }
          : {}),
      },
      body: JSON.stringify(intent),
    });
    if (!response.ok) {
      throw new Error(`Outbox dispatch endpoint returned ${response.status}`);
    }
  }
}

function dispatchUrl(baseUrl: string, eventType: string): string {
  if (eventType !== "behaviour.guardian-notification.requested") {
    return baseUrl;
  }
  return new URL(
    "internal/outbox/behaviour",
    `${baseUrl.replace(/\/$/, "")}/`,
  ).toString();
}
