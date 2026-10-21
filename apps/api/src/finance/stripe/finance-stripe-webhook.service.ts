import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { runTransaction, withTenantRlsContext } from "@pathway/db";
import { FinanceStripeConnectionService } from "./finance-stripe-connection.service";
import { FinanceStripePaymentWebhookService } from "./finance-stripe-payment-webhook.service";
import { FinanceStripeBacsWebhookService } from "./finance-stripe-bacs-webhook.service";
import { FinanceStripeReversalWebhookService } from "./finance-stripe-reversal-webhook.service";
import {
  FINANCE_STRIPE_WEBHOOK_CONFIG,
  type FinanceStripeWebhookConfig,
} from "./finance-stripe-webhook.config";
import {
  FinanceStripeWebhookProvider,
  type VerifiedFinanceStripeWebhook,
} from "./finance-stripe-webhook.provider";

export type FinanceStripeWebhookCaptureResult =
  | "accepted"
  | "duplicate"
  | "unmatched";

export interface FinanceStripeWebhookInbox {
  capture(
    event: VerifiedFinanceStripeWebhook,
  ): Promise<FinanceStripeWebhookCaptureResult>;
}

@Injectable()
export class PrismaFinanceStripeWebhookInbox implements FinanceStripeWebhookInbox {
  async capture(
    event: VerifiedFinanceStripeWebhook,
  ): Promise<FinanceStripeWebhookCaptureResult> {
    return runTransaction(async (tx) => {
      const rows = await tx.$queryRaw<{ result: string }[]>`
        SELECT app.capture_finance_stripe_webhook_event(
          ${event.eventId},
          ${event.accountId},
          ${event.eventType},
          ${event.livemode},
          ${event.payloadSha256},
          ${event.payloadJson}::jsonb
        ) AS result
      `;
      const result = rows[0]?.result;
      if (
        result !== "accepted" &&
        result !== "duplicate" &&
        result !== "unmatched"
      ) {
        throw new Error("Finance Stripe webhook capture returned no result");
      }
      return result;
    });
  }
}

@Injectable()
export class FinanceStripeWebhookService {
  private readonly provider: FinanceStripeWebhookProvider | null;

  constructor(
    @Inject(FINANCE_STRIPE_WEBHOOK_CONFIG)
    config: FinanceStripeWebhookConfig,
    @Inject(PrismaFinanceStripeWebhookInbox)
    private readonly inbox: FinanceStripeWebhookInbox,
  ) {
    this.provider =
      config.mode === "disabled"
        ? null
        : new FinanceStripeWebhookProvider(config);
  }

  async receive(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ): Promise<{ status: FinanceStripeWebhookCaptureResult; eventId: string }> {
    if (!this.provider) {
      throw new ServiceUnavailableException(
        "Finance Stripe webhooks are not configured",
      );
    }
    const event = this.provider.verifyAndParse(rawBody, signature);
    try {
      const status = await this.inbox.capture(event);
      return { status, eventId: event.eventId };
    } catch {
      // Return a retryable response to Stripe without exposing database details.
      throw new ServiceUnavailableException(
        "Finance Stripe webhook could not be stored",
      );
    }
  }
}

export type FinanceStripeWebhookReplayInput = {
  eventId: string;
  tenantId: string;
  orgId: string;
  claimToken: string;
};

export type FinanceStripeWebhookReplayResult = "processed" | "deferred";

@Injectable()
export class FinanceStripeWebhookReplayService {
  constructor(
    @Inject(FINANCE_STRIPE_WEBHOOK_CONFIG)
    private readonly config: FinanceStripeWebhookConfig,
    @Inject(FinanceStripeConnectionService)
    private readonly connectionSync: FinanceStripeConnectionService,
    @Inject(FinanceStripeBacsWebhookService)
    private readonly bacs: FinanceStripeBacsWebhookService,
    @Inject(FinanceStripePaymentWebhookService)
    private readonly payments: FinanceStripePaymentWebhookService,
    @Inject(FinanceStripeReversalWebhookService)
    private readonly reversals: FinanceStripeReversalWebhookService,
  ) {}

  async processClaimedEvent(
    input: FinanceStripeWebhookReplayInput,
  ): Promise<FinanceStripeWebhookReplayResult> {
    const event = await withTenantRlsContext(
      input.tenantId,
      input.orgId,
      (tx) =>
        tx.financeStripeWebhookEvent.findFirst({
          where: {
            id: input.eventId,
            tenantId: input.tenantId,
            orgId: input.orgId,
            status: "PROCESSING",
            claimToken: input.claimToken,
          },
          select: {
            stripeEventId: true,
            stripeAccountId: true,
            eventType: true,
            livemode: true,
            payloadJson: true,
          },
        }),
    );
    if (!event)
      throw new Error("Finance Stripe webhook claim is no longer valid");

    if (
      this.config.mode === "disabled" ||
      event.livemode !== (this.config.mode === "live")
    ) {
      throw new Error("Finance Stripe webhook mode is no longer configured");
    }

    if (isAccountStatusEvent(event.eventType)) {
      if (!event.stripeAccountId) {
        throw new Error("Finance Stripe account webhook has no account ID");
      }
      await this.connectionSync.refreshFromWebhook(
        input.tenantId,
        input.orgId,
        event.stripeAccountId,
      );
      return "processed";
    }

    const webhookInput = {
      stripeEventId: event.stripeEventId,
      tenantId: input.tenantId,
      orgId: input.orgId,
      stripeAccountId: event.stripeAccountId,
      eventType: event.eventType,
      livemode: event.livemode,
      payloadJson: event.payloadJson,
    };
    if (this.reversals.supports(event.eventType)) {
      return this.reversals.process(webhookInput);
    }
    if (this.bacs.supports(event.eventType)) {
      return this.bacs.process(webhookInput);
    }
    return this.payments.process(webhookInput);
  }
}

function isAccountStatusEvent(eventType: string): boolean {
  return (
    eventType === "account.updated" ||
    eventType === "v2.core.account.updated" ||
    eventType.startsWith("v2.core.account[")
  );
}
