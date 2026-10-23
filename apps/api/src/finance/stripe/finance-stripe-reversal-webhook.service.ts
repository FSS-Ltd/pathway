import { Inject, Injectable } from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import type { FinanceStripeReversalWebhookInput } from "./finance-stripe-reversal-webhook.contracts";
import { reconcileFinanceExternalRefundReview } from "../finance-external-refund-review";
import { reconcileFinanceReceiptException } from "../finance-receipt-exception.persistence";
import { lockReceipt } from "../finance-receipt-operations";
import { recordFinanceReceiptMovement } from "../finance-receipt-movement.service";
import {
  assertStripeAmountMatchesReceipt,
  chargeIdFromStripe,
  disputeEventTypes,
  financeRefundEventType,
  parseEvent,
  paymentIntentIdFromStripe,
  refundEventTypes,
  requireStripeAccount,
  stripeDisputeSchema,
  stripeRefundSchema,
} from "./finance-stripe-reversal-webhook.contracts";
import {
  createRefundReturnMovement,
  findReceiptForPaymentIntent,
  lockFinanceRefund,
  synchronizeLocalRefundStatus,
} from "./finance-stripe-reversal-webhook.persistence";
import {
  FINANCE_STRIPE_REFUND_PROVIDER,
  type FinanceStripeRefundProvider,
} from "./finance-stripe-refund.provider";

@Injectable()
export class FinanceStripeReversalWebhookService {
  constructor(
    @Inject(FINANCE_STRIPE_REFUND_PROVIDER)
    private readonly stripe: FinanceStripeRefundProvider,
  ) {}

  supports(eventType: string): boolean {
    return refundEventTypes.has(eventType) || disputeEventTypes.has(eventType);
  }

  async process(
    input: FinanceStripeReversalWebhookInput,
  ): Promise<"processed" | "deferred"> {
    if (refundEventTypes.has(input.eventType)) {
      return this.processRefund(input);
    }
    if (disputeEventTypes.has(input.eventType)) {
      return this.processDispute(input);
    }
    return "deferred";
  }

  private async processRefund(
    input: FinanceStripeReversalWebhookInput,
  ): Promise<"processed" | "deferred"> {
    const event = parseEvent(input);
    const parsedRefund = stripeRefundSchema.safeParse(event.data.object);
    if (!parsedRefund.success) {
      throw new Error("Finance Stripe refund event payload is invalid");
    }
    const refund = parsedRefund.data;
    const stripeAccountId = requireStripeAccount(input, event.account);
    const paymentIntentId =
      paymentIntentIdFromStripe(refund.payment_intent) ??
      (chargeIdFromStripe(refund.charge)
        ? await this.stripe.retrieveChargePaymentIntent({
            stripeAccountId,
            livemode: input.livemode,
            chargeId: chargeIdFromStripe(refund.charge)!,
          })
        : null);
    if (!paymentIntentId) return "deferred";
    const eventAt = new Date(event.created * 1_000);
    const eventStatus = financeRefundEventType(refund.status);

    return withTenantRlsContext(input.tenantId, input.orgId, async (tx) => {
      const payment = await findReceiptForPaymentIntent(
        tx,
        input,
        stripeAccountId,
        paymentIntentId,
      );
      if (!payment) return "deferred";
      assertStripeAmountMatchesReceipt(
        refund.amount,
        refund.currency,
        payment.receipt.amountMinor,
        payment.receipt.currency,
      );
      await lockReceipt(tx, input, payment.receipt.id);

      const localRefundId = refund.metadata?.finance_refund_id ?? null;
      let localRefund = localRefundId
        ? await tx.financeRefund.findFirst({
            where: {
              id: localRefundId,
              receiptId: payment.receipt.id,
              stripeAccountId,
              tenantId: input.tenantId,
              orgId: input.orgId,
            },
            select: {
              id: true,
              status: true,
              amountMinor: true,
              currency: true,
              financeProfileId: true,
              receiptId: true,
              providerStatusAt: true,
              stripeRefundId: true,
            },
          })
        : null;
      if (localRefundId && !localRefund) {
        throw new Error("Finance Stripe refund request could not be matched");
      }
      if (localRefund) {
        if (
          localRefund.amountMinor !== BigInt(refund.amount) ||
          localRefund.currency !== refund.currency.toUpperCase() ||
          (localRefund.stripeRefundId !== null &&
            localRefund.stripeRefundId !== refund.id)
        ) {
          throw new Error("Finance Stripe refund does not match its request");
        }
        await lockFinanceRefund(tx, input, localRefund.id);
        const lockedRefund = await tx.financeRefund.findFirst({
          where: {
            id: localRefund.id,
            tenantId: input.tenantId,
            orgId: input.orgId,
          },
          select: {
            id: true,
            status: true,
            amountMinor: true,
            currency: true,
            financeProfileId: true,
            receiptId: true,
            providerStatusAt: true,
            stripeRefundId: true,
          },
        });
        if (!lockedRefund) {
          throw new Error("Finance Stripe refund request disappeared");
        }
        localRefund = lockedRefund;
      }

      const existingEvent = await tx.financeRefundEvent.findUnique({
        where: { stripeEventId: event.id },
        select: { id: true },
      });
      if (!existingEvent) {
        await tx.financeRefundEvent.create({
          data: {
            refundId: localRefund?.id,
            tenantId: input.tenantId,
            orgId: input.orgId,
            stripeEventId: event.id,
            sourceReference: refund.id,
            providerOccurredAt: eventAt,
            type: eventStatus,
          },
        });
      }

      const sourceReference = refund.id;
      if (refund.status === "succeeded") {
        await recordFinanceReceiptMovement(tx, {
          financeProfileId: payment.receipt.financeProfileId,
          receiptId: payment.receipt.id,
          refundId: localRefund?.id,
          tenantId: input.tenantId,
          orgId: input.orgId,
          type: "REFUND",
          source: "STRIPE",
          amountMinor: BigInt(refund.amount),
          currency: payment.receipt.currency,
          sourceReference,
          stripeEventId: event.id,
          occurredAt: eventAt,
        });
        const laterFailures = await tx.financeRefundEvent.findMany({
          where: {
            tenantId: input.tenantId,
            orgId: input.orgId,
            sourceReference,
            type: "FAILED",
            providerOccurredAt: { gte: eventAt },
            stripeEventId: { not: null },
          },
          select: { stripeEventId: true, providerOccurredAt: true },
          orderBy: [{ providerOccurredAt: "asc" }, { stripeEventId: "asc" }],
        });
        const laterFailure = laterFailures[0];
        if (laterFailure?.stripeEventId && laterFailure.providerOccurredAt) {
          await createRefundReturnMovement(tx, {
            webhook: input,
            receipt: payment.receipt,
            refundId: localRefund?.id,
            refundReference: refund.id,
            returnEventId: laterFailure.stripeEventId,
            returnOccurredAt: laterFailure.providerOccurredAt,
          });
        }
      } else if (refund.status === "failed" || refund.status === "canceled") {
        await createRefundReturnMovement(tx, {
          webhook: input,
          receipt: payment.receipt,
          refundId: localRefund?.id,
          refundReference: sourceReference,
          returnEventId: event.id,
          returnOccurredAt: eventAt,
        });
      }

      if (localRefund) {
        await synchronizeLocalRefundStatus(
          tx,
          input,
          localRefund,
          sourceReference,
        );
      }
      if (!localRefund) {
        await reconcileFinanceExternalRefundReview(tx, {
          tenantId: input.tenantId,
          orgId: input.orgId,
          financeProfileId: payment.receipt.financeProfileId,
          receiptId: payment.receipt.id,
          stripeAccountId,
          livemode: input.livemode,
          refundReference: refund.id,
        });
      }
      await reconcileFinanceReceiptException(tx, {
        ...input,
        receiptId: payment.receipt.id,
        source: "STRIPE",
      });
      return "processed";
    });
  }

  private async processDispute(
    input: FinanceStripeReversalWebhookInput,
  ): Promise<"processed" | "deferred"> {
    const event = parseEvent(input);
    const parsedDispute = stripeDisputeSchema.safeParse(event.data.object);
    if (!parsedDispute.success) {
      throw new Error("Finance Stripe dispute event payload is invalid");
    }
    const dispute = parsedDispute.data;
    const stripeAccountId = requireStripeAccount(input, event.account);
    const paymentIntentId =
      paymentIntentIdFromStripe(dispute.payment_intent) ??
      (chargeIdFromStripe(dispute.charge)
        ? await this.stripe.retrieveChargePaymentIntent({
            stripeAccountId,
            livemode: input.livemode,
            chargeId: chargeIdFromStripe(dispute.charge)!,
          })
        : null);
    if (!paymentIntentId) return "deferred";
    const eventAt = new Date(event.created * 1_000);

    return withTenantRlsContext(input.tenantId, input.orgId, async (tx) => {
      const payment = await findReceiptForPaymentIntent(
        tx,
        input,
        stripeAccountId,
        paymentIntentId,
      );
      if (!payment) return "deferred";
      assertStripeAmountMatchesReceipt(
        dispute.amount,
        dispute.currency,
        payment.receipt.amountMinor,
        payment.receipt.currency,
      );
      await lockReceipt(tx, input, payment.receipt.id);

      if (event.type === "charge.dispute.funds_withdrawn") {
        await recordFinanceReceiptMovement(tx, {
          financeProfileId: payment.receipt.financeProfileId,
          receiptId: payment.receipt.id,
          tenantId: input.tenantId,
          orgId: input.orgId,
          type: "DISPUTE_WITHDRAWAL",
          source: "STRIPE",
          amountMinor: BigInt(dispute.amount),
          currency: payment.receipt.currency,
          sourceReference: dispute.id,
          stripeEventId: event.id,
          occurredAt: eventAt,
        });
        await reconcileFinanceReceiptException(tx, {
          ...input,
          receiptId: payment.receipt.id,
          source: "STRIPE",
        });
        return "processed";
      }

      const originalMovement = await tx.financeReceiptMovement.findFirst({
        where: {
          financeProfileId: payment.receipt.financeProfileId,
          receiptId: payment.receipt.id,
          source: "STRIPE",
          type: "DISPUTE_WITHDRAWAL",
          sourceReference: dispute.id,
          tenantId: input.tenantId,
          orgId: input.orgId,
        },
        select: { id: true, amountMinor: true, occurredAt: true },
      });
      if (!originalMovement) {
        throw new Error(
          "Finance dispute reinstatement is waiting for withdrawal",
        );
      }
      if (eventAt < originalMovement.occurredAt) {
        throw new Error("Finance dispute events are out of order");
      }
      if (BigInt(dispute.amount) > originalMovement.amountMinor) {
        throw new Error("Finance dispute reinstatement exceeds its withdrawal");
      }
      await recordFinanceReceiptMovement(tx, {
        financeProfileId: payment.receipt.financeProfileId,
        receiptId: payment.receipt.id,
        tenantId: input.tenantId,
        orgId: input.orgId,
        type: "DISPUTE_REINSTATEMENT",
        source: "STRIPE",
        amountMinor: BigInt(dispute.amount),
        currency: payment.receipt.currency,
        sourceReference: dispute.id,
        stripeEventId: event.id,
        originalMovementId: originalMovement.id,
        occurredAt: eventAt,
      });
      await reconcileFinanceReceiptException(tx, {
        ...input,
        receiptId: payment.receipt.id,
        source: "STRIPE",
      });
      return "processed";
    });
  }
}
