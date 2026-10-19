import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { lockReceipt } from "../finance-receipt-operations";
import {
  loadFinanceRefund,
  lockFinanceRefund,
} from "../finance-refund.persistence";
import type { FinanceRefundActor } from "../finance-refund.service";
import { recordFinanceReceiptMovement } from "../finance-receipt-movement.service";
import {
  financeRefundInclude,
  toFinanceRefundView,
} from "../finance-refund-records";
import {
  FINANCE_STRIPE_REFUND_PROVIDER,
  FinanceStripeRefundProviderError,
  type FinanceStripeRefundProvider,
} from "./finance-stripe-refund.provider";

@Injectable()
export class FinanceStripeRefundSubmissionService {
  constructor(
    @Inject(FINANCE_STRIPE_REFUND_PROVIDER)
    private readonly stripeRefunds: FinanceStripeRefundProvider,
  ) {}

  async submit(actor: FinanceRefundActor, refundId: string) {
    const facts = await withTenantRlsContext(
      actor.tenantId,
      actor.orgId,
      async (tx) => {
        const refund = await loadFinanceRefund(tx, actor, refundId);
        const receipt = await tx.financeReceipt.findFirst({
          where: {
            id: refund.receiptId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
          },
          select: { sourceReference: true },
        });
        if (!receipt?.sourceReference || !refund.stripeAccountId) {
          throw new ConflictException(
            "Stripe refund is missing its connected account or payment evidence",
          );
        }
        const attempt = await tx.financeCheckoutAttempt.findFirst({
          where: {
            stripeAccountId: refund.stripeAccountId,
            stripeCheckoutSessionId: receipt.sourceReference,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            status: "PAID",
          },
          select: { stripePaymentIntentId: true },
        });
        if (!attempt?.stripePaymentIntentId) {
          throw new ConflictException(
            "Stripe refund is missing its confirmed PaymentIntent",
          );
        }
        return {
          status: refund.status,
          id: refund.id,
          amountMinor: refund.amountMinor,
          currency: refund.currency,
          stripeAccountId: refund.stripeAccountId,
          paymentIntentId: attempt.stripePaymentIntentId,
        };
      },
    );

    if (
      ["SUBMITTED", "CONFIRMED", "RETURNED", "FAILED"].includes(facts.status)
    ) {
      return this.get(actor, refundId);
    }
    if (facts.status !== "APPROVED") {
      throw new ConflictException("Finance refund is not approved");
    }

    let providerResult: Awaited<
      ReturnType<FinanceStripeRefundProvider["createRefund"]>
    >;
    try {
      providerResult = await this.stripeRefunds.createRefund({
        stripeAccountId: facts.stripeAccountId,
        paymentIntentId: facts.paymentIntentId,
        refundId: facts.id,
        amountMinor: facts.amountMinor,
        currency: facts.currency,
      });
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      if (
        error instanceof FinanceStripeRefundProviderError &&
        !error.retryable
      ) {
        return this.recordPermanentFailure(actor, refundId);
      }
      throw new ServiceUnavailableException(
        "Stripe refund is approved and will be retried safely",
      );
    }

    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const current = await tx.financeRefund.findFirst({
        where: {
          id: refundId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
        },
        select: { id: true, receiptId: true },
      });
      if (!current) throw new NotFoundException("Finance refund not found");
      await lockReceipt(tx, actor, current.receiptId);
      await lockFinanceRefund(tx, actor, refundId);
      const refund = await loadFinanceRefund(tx, actor, refundId);
      if (refund.status === "CONFIRMED" || refund.status === "RETURNED") {
        return toFinanceRefundView(refund);
      }
      if (
        refund.providerStatusAt &&
        providerResult.createdAt <= refund.providerStatusAt
      ) {
        return toFinanceRefundView(refund);
      }
      if (
        providerResult.amountMinor !== refund.amountMinor ||
        providerResult.currency !== refund.currency
      ) {
        throw new ServiceUnavailableException(
          "Stripe refund response does not match the approved request",
        );
      }

      const terminalFailure =
        providerResult.status === "failed" ||
        providerResult.status === "canceled";
      const confirmed = providerResult.status === "succeeded";
      if (confirmed) {
        await recordFinanceReceiptMovement(tx, {
          financeProfileId: refund.financeProfileId,
          receiptId: refund.receiptId,
          refundId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          type: "REFUND",
          source: "STRIPE",
          amountMinor: refund.amountMinor,
          currency: refund.currency,
          sourceReference: providerResult.id,
          occurredAt: providerResult.createdAt,
        });
      }
      const eventType = stripeResponseEventType(providerResult.status);
      await tx.financeRefund.updateMany({
        where: {
          id: refundId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          status: { in: ["APPROVED", "SUBMITTED", "FAILED"] },
        },
        data: {
          stripeRefundId: providerResult.id,
          status: confirmed
            ? "CONFIRMED"
            : terminalFailure
              ? "FAILED"
              : "SUBMITTED",
          submittedAt: new Date(),
          providerStatusAt: providerResult.createdAt,
          confirmedAt: confirmed ? providerResult.createdAt : undefined,
          failedAt: terminalFailure ? providerResult.createdAt : undefined,
        },
      });
      await tx.financeRefundEvent.create({
        data: {
          refundId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          sourceReference: providerResult.id,
          providerOccurredAt: providerResult.createdAt,
          type: eventType,
          reason: "Stripe refund response",
        },
      });
      const updated = await tx.financeRefund.findFirst({
        where: {
          id: refundId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
        },
        include: financeRefundInclude,
      });
      if (!updated) throw new NotFoundException("Finance refund not found");
      return toFinanceRefundView(updated);
    });
  }

  private async get(actor: FinanceRefundActor, refundId: string) {
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) =>
      toFinanceRefundView(await loadFinanceRefund(tx, actor, refundId)),
    );
  }

  private async recordPermanentFailure(
    actor: FinanceRefundActor,
    refundId: string,
  ) {
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const current = await tx.financeRefund.findFirst({
        where: {
          id: refundId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
        },
        select: { id: true, receiptId: true },
      });
      if (!current) throw new NotFoundException("Finance refund not found");
      await lockReceipt(tx, actor, current.receiptId);
      await lockFinanceRefund(tx, actor, refundId);
      const refund = await loadFinanceRefund(tx, actor, refundId);
      if (
        refund.status === "CONFIRMED" ||
        refund.status === "RETURNED" ||
        refund.status === "FAILED" ||
        refund.providerStatusAt
      ) {
        return toFinanceRefundView(refund);
      }
      if (refund.status !== "APPROVED" && refund.status !== "SUBMITTED") {
        return toFinanceRefundView(refund);
      }

      const failedAt = new Date();
      await tx.financeRefund.updateMany({
        where: {
          id: refundId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          status: { in: ["APPROVED", "SUBMITTED"] },
          providerStatusAt: null,
        },
        data: { status: "FAILED", failedAt },
      });
      await tx.financeRefundEvent.create({
        data: {
          refundId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          type: "FAILED",
          reason: "Stripe rejected the refund request",
        },
      });
      return toFinanceRefundView(await loadFinanceRefund(tx, actor, refundId));
    });
  }
}

function stripeResponseEventType(
  status: "pending" | "requires_action" | "succeeded" | "failed" | "canceled",
): "SUBMITTED" | "CONFIRMED" | "FAILED" {
  if (status === "succeeded") return "CONFIRMED";
  if (status === "failed" || status === "canceled") return "FAILED";
  return "SUBMITTED";
}
