import { BadRequestException, Injectable } from "@nestjs/common";
import { BillingProvider, SubscriptionStatus } from "@pathway/db";

export type BillingEventKind =
  | "subscription.updated"
  | "subscription.created"
  | "subscription.canceled"
  | "invoice.paid"
  | "invoice.payment_failed"
  | "unknown";

export type ParsedBillingWebhookEvent = {
  provider: BillingProvider;
  eventId: string;
  kind: BillingEventKind;
  orgId: string;
  subscriptionId: string;
  pendingOrderId?: string | null;
  providerCheckoutId?: string | null;
  providerCustomerId?: string | null;
  planCode?: string | null;
  status?: SubscriptionStatus | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean | null;
  entitlements?: {
    maxSites?: number | null;
    av30Included?: number | null;
    maxChildrenIncluded?: number | null;
    leaderSeatsIncluded?: number | null;
    storageGbIncluded?: number | null;
    flagsJson?: Record<string, unknown> | null;
  };
};

export interface BillingWebhookProvider {
  verifyAndParse(
    body: unknown,
    signature?: string,
    rawBody?: Buffer,
  ): Promise<ParsedBillingWebhookEvent>;
}

export const BILLING_WEBHOOK_PROVIDER = Symbol("BILLING_WEBHOOK_PROVIDER");

/**
 * Fake provider used for tests and local development.
 * Signature check is intentionally simple; replace with real provider logic later.
 */
@Injectable()
export class FakeBillingWebhookProvider implements BillingWebhookProvider {
  async verifyAndParse(
    body: unknown,
    signature?: string,
    _rawBody?: Buffer,
  ): Promise<ParsedBillingWebhookEvent> {
    void _rawBody;
    if (!signature || signature !== "test-signature") {
      throw new BadRequestException("Invalid webhook signature");
    }

    const payload =
      typeof body === "string"
        ? safeParse(body)
        : (body as Record<string, unknown>);

    if (
      !payload ||
      typeof payload !== "object" ||
      !payload.eventId ||
      !payload.type ||
      !payload.orgId ||
      !payload.subscriptionId
    ) {
      throw new BadRequestException("Missing required webhook fields");
    }

    const kind = mapType(payload.type);
    const status = mapStatus(payload.status);

    return {
      provider: BillingProvider.STRIPE,
      eventId: String(payload.eventId),
      kind,
      orgId: String(payload.orgId),
      subscriptionId: String(payload.subscriptionId),
      planCode:
        payload.planCode !== undefined ? String(payload.planCode) : null,
      status,
      periodStart: payload.periodStart ? new Date(payload.periodStart) : null,
      periodEnd: payload.periodEnd ? new Date(payload.periodEnd) : null,
      cancelAtPeriodEnd:
        payload.cancelAtPeriodEnd !== undefined
          ? Boolean(payload.cancelAtPeriodEnd)
          : null,
      pendingOrderId:
        payload.pendingOrderId !== undefined
          ? String(payload.pendingOrderId)
          : null,
      providerCheckoutId:
        payload.providerCheckoutId !== undefined
          ? String(payload.providerCheckoutId)
          : null,
      entitlements: payload.entitlements,
    };
  }
}

const safeParse = (raw: string) => {
  try {
    return JSON.parse(raw);
  } catch {
    throw new BadRequestException("Invalid JSON payload");
  }
};

const mapType = (type: string): BillingEventKind => {
  switch (type) {
    case "subscription.updated":
      return "subscription.updated";
    case "subscription.created":
      return "subscription.created";
    case "subscription.canceled":
      return "subscription.canceled";
    case "invoice.paid":
      return "invoice.paid";
    default:
      return "unknown";
  }
};

const mapStatus = (
  status: unknown,
): SubscriptionStatus | null | undefined => {
  if (typeof status !== "string") return null;
  if (
    status === SubscriptionStatus.ACTIVE ||
    status === SubscriptionStatus.PAST_DUE ||
    status === SubscriptionStatus.CANCELED ||
    status === SubscriptionStatus.TRIALING ||
    status === SubscriptionStatus.INCOMPLETE
  ) {
    return status;
  }
  return null;
};
