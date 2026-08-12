import type {
  OutboxDispatcher,
  OutboxIntentForDispatch,
} from "./dispatch-outbox.job";

interface BehaviourOutboxEndpoint {
  url: string;
  secret: string;
}

interface HttpOutboxDispatcherOptions {
  genericUrl: string;
  genericToken?: string;
  behaviour?: BehaviourOutboxEndpoint;
}

type DispatchEnvironment = Record<string, string | undefined>;

export class HttpOutboxDispatcher implements OutboxDispatcher {
  constructor(private readonly options: HttpOutboxDispatcherOptions) {}

  async dispatch(intent: OutboxIntentForDispatch): Promise<void> {
    const isBehaviourNotification =
      intent.eventType === "behaviour.guardian-notification.requested";
    const behaviour = isBehaviourNotification
      ? this.options.behaviour
      : undefined;
    if (isBehaviourNotification && !behaviour) {
      throw new Error("Behaviour outbox dispatch is not configured");
    }
    const response = await fetch(behaviour?.url ?? this.options.genericUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": intent.idempotencyKey,
        ...(!isBehaviourNotification && this.options.genericToken
          ? {
              authorization: `Bearer ${this.options.genericToken}`,
            }
          : {}),
        ...(behaviour ? { "x-pathway-internal-secret": behaviour.secret } : {}),
      },
      body: JSON.stringify(intent),
    });
    if (!response.ok) {
      throw new Error(`Outbox dispatch endpoint returned ${response.status}`);
    }
  }
}

export function loadBehaviourOutboxEndpoint(
  environment: DispatchEnvironment,
): BehaviourOutboxEndpoint | undefined {
  const rawUrl = environment.BEHAVIOUR_OUTBOX_DISPATCH_URL?.trim();
  const secret = environment.BEHAVIOUR_OUTBOX_SECRET?.trim();
  if (!rawUrl && !secret) return undefined;
  if (!rawUrl) {
    throw new Error("BEHAVIOUR_OUTBOX_DISPATCH_URL is required");
  }
  if (!secret) {
    throw new Error("BEHAVIOUR_OUTBOX_SECRET is required");
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("BEHAVIOUR_OUTBOX_DISPATCH_URL must be a valid URL");
  }
  if (url.protocol !== "https:") {
    throw new Error("BEHAVIOUR_OUTBOX_DISPATCH_URL must use HTTPS");
  }
  if (
    url.pathname !== "/internal/outbox/behaviour" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "BEHAVIOUR_OUTBOX_DISPATCH_URL must target /internal/outbox/behaviour",
    );
  }
  return { url: url.toString(), secret };
}
