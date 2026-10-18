import {
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import Stripe from "stripe";
import type { FinanceStripeWebhookConfig } from "./finance-stripe-webhook.config";

export interface VerifiedFinanceStripeWebhook {
  eventId: string;
  accountId: string | null;
  eventType: string;
  livemode: boolean;
  payloadSha256: string;
  payloadJson: string;
}

export class FinanceStripeWebhookProvider {
  private readonly stripe: Stripe;
  private readonly config: Exclude<
    FinanceStripeWebhookConfig,
    { mode: "disabled" }
  >;

  constructor(config: FinanceStripeWebhookConfig) {
    if (config.mode === "disabled") {
      throw new ServiceUnavailableException(
        "Finance Stripe webhooks are not configured",
      );
    }
    this.config = config;
    this.stripe = new Stripe(config.secretKey, {
      apiVersion: "2023-10-16",
    });
  }

  verifyAndParse(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ): VerifiedFinanceStripeWebhook {
    if (!rawBody?.length) {
      throw new BadRequestException("Raw Stripe webhook body is required");
    }
    if (!signature) {
      throw new BadRequestException("Missing Stripe webhook signature");
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.config.webhookSecret,
      );
    } catch {
      throw new BadRequestException("Invalid Stripe webhook signature");
    }

    if (event.livemode !== (this.config.mode === "live")) {
      throw new BadRequestException(
        "Stripe webhook mode does not match Finance configuration",
      );
    }
    if (!event.id || !event.type) {
      throw new BadRequestException("Invalid Stripe webhook event");
    }

    return {
      eventId: event.id,
      accountId: stripeAccountId(event.account) ?? stripeV2AccountId(rawBody),
      eventType: event.type,
      livemode: event.livemode,
      payloadSha256: createHash("sha256").update(rawBody).digest("hex"),
      payloadJson: rawBody.toString("utf8"),
    };
  }
}

function stripeAccountId(value: unknown): string | null {
  return typeof value === "string" && value.startsWith("acct_") ? value : null;
}

function stripeV2AccountId(rawBody: Buffer): string | null {
  const payload: unknown = JSON.parse(rawBody.toString("utf8"));
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("object" in payload) ||
    payload.object !== "v2.core.event"
  ) {
    return null;
  }

  const contextAccountId =
    "context" in payload ? stripeAccountId(payload.context) : null;
  if (contextAccountId) return contextAccountId;

  if (!("related_object" in payload)) return null;
  const relatedObject = payload.related_object;
  if (
    typeof relatedObject !== "object" ||
    relatedObject === null ||
    !("type" in relatedObject) ||
    relatedObject.type !== "v2.core.account" ||
    !("id" in relatedObject)
  ) {
    return null;
  }
  return stripeAccountId(relatedObject.id);
}
