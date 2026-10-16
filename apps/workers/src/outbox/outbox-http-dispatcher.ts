import type {
  OutboxDispatcher,
  OutboxIntentForDispatch,
} from "./dispatch-outbox.job";

interface BehaviourOutboxEndpoint {
  url: string;
  secret: string;
}

interface InstitutionalAddonTrialOutboxEndpoint {
  url: string;
  secret: string;
}

interface HttpOutboxDispatcherOptions {
  genericUrl: string;
  genericToken?: string;
  behaviour?: BehaviourOutboxEndpoint;
  institutionalAddonTrials?: InstitutionalAddonTrialOutboxEndpoint;
}

type DispatchEnvironment = Record<string, string | undefined>;

export class HttpOutboxDispatcher implements OutboxDispatcher {
  constructor(private readonly options: HttpOutboxDispatcherOptions) {}

  async dispatch(intent: OutboxIntentForDispatch): Promise<void> {
    const isBehaviourNotification =
      intent.eventType === "behaviour.guardian-notification.requested";
    const isAddonTrialExpiry =
      intent.eventType === "institutional.addon_trial.expired";
    const behaviour = isBehaviourNotification
      ? this.options.behaviour
      : undefined;
    const addonTrialEndpoint = isAddonTrialExpiry
      ? this.options.institutionalAddonTrials
      : undefined;
    if (isBehaviourNotification && !behaviour) {
      throw new Error("Behaviour outbox dispatch is not configured");
    }
    if (isAddonTrialExpiry && !addonTrialEndpoint) {
      throw new Error(
        "Institutional add-on trial outbox dispatch is not configured",
      );
    }
    const endpoint = behaviour ?? addonTrialEndpoint;
    const response = await fetch(endpoint?.url ?? this.options.genericUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": intent.idempotencyKey,
        ...(!isBehaviourNotification &&
        !isAddonTrialExpiry &&
        this.options.genericToken
          ? {
              authorization: `Bearer ${this.options.genericToken}`,
            }
          : {}),
        ...(endpoint ? { "x-pathway-internal-secret": endpoint.secret } : {}),
      },
      body: JSON.stringify(intent),
    });
    if (!response.ok) {
      throw new Error(`Outbox dispatch endpoint returned ${response.status}`);
    }
  }
}

export function loadInstitutionalAddonTrialOutboxEndpoint(
  environment: DispatchEnvironment,
): InstitutionalAddonTrialOutboxEndpoint | undefined {
  const rawBaseUrl = environment.BILLING_INTERNAL_API_URL?.trim();
  const secret = environment.INTERNAL_AUTH_SECRET?.trim();
  if (!rawBaseUrl && !secret) return undefined;
  if (!rawBaseUrl) {
    throw new Error(
      "BILLING_INTERNAL_API_URL is required for add-on trial dispatch",
    );
  }
  if (!secret) {
    throw new Error(
      "INTERNAL_AUTH_SECRET is required for add-on trial dispatch",
    );
  }
  let baseUrl: URL;
  try {
    baseUrl = new URL(rawBaseUrl);
  } catch {
    throw new Error("BILLING_INTERNAL_API_URL must be a valid URL");
  }
  const localHttp =
    baseUrl.protocol === "http:" &&
    ["localhost", "127.0.0.1", "::1", "[::1]"].includes(baseUrl.hostname);
  if (
    (baseUrl.protocol !== "https:" && !localHttp) ||
    baseUrl.username ||
    baseUrl.password
  ) {
    throw new Error("BILLING_INTERNAL_API_URL must use HTTPS or local HTTP");
  }
  if (!baseUrl.pathname.endsWith("/")) baseUrl.pathname += "/";
  return {
    url: new URL(
      "billing/institutional/internal/addons/expiry-email",
      baseUrl,
    ).toString(),
    secret,
  };
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
