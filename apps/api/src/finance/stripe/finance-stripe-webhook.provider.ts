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
      accountId: typeof event.account === "string" ? event.account : null,
      eventType: event.type,
      livemode: event.livemode,
      payloadSha256: createHash("sha256").update(rawBody).digest("hex"),
      payloadJson: rawBody.toString("utf8"),
    };
  }
}
