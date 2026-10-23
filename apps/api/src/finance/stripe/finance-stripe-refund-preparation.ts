import { ConflictException, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@pathway/db";
import type { FinanceCurrency } from "@pathway/platform";
import type { FinanceRefundActor } from "../finance-refund.service";
import {
  loadFinanceRefund,
  lockFinanceRefund,
} from "../finance-refund.persistence";
import { toFinanceRefundView } from "../finance-refund-records";
import { lockReceipt } from "../finance-receipt-operations";

type PreparedFinanceStripeRefund =
  | { kind: "view"; view: ReturnType<typeof toFinanceRefundView> }
  | {
      kind: "submit";
      id: string;
      stripeAccountId: string;
      paymentIntentId: string;
      amountMinor: bigint;
      currency: FinanceCurrency;
      providerAttemptStartedAt: Date;
    };

export async function prepareFinanceStripeRefund(
  tx: Prisma.TransactionClient,
  actor: FinanceRefundActor,
  refundId: string,
  now: Date,
): Promise<PreparedFinanceStripeRefund> {
  const initial = await tx.financeRefund.findFirst({
    where: { id: refundId, tenantId: actor.tenantId, orgId: actor.orgId },
    select: { receiptId: true },
  });
  if (!initial) throw new NotFoundException("Finance refund not found");
  await lockReceipt(tx, actor, initial.receiptId);
  await lockFinanceRefund(tx, actor, refundId);
  const refund = await loadFinanceRefund(tx, actor, refundId);
  if (["SUBMITTED", "CONFIRMED", "RETURNED", "FAILED"].includes(refund.status))
    return { kind: "view", view: toFinanceRefundView(refund) };
  if (refund.status !== "APPROVED" || refund.source !== "STRIPE_CARD")
    throw new ConflictException("Finance Stripe refund is not approved");

  const receipt = await tx.financeReceipt.findFirst({
    where: {
      id: refund.receiptId,
      tenantId: actor.tenantId,
      orgId: actor.orgId,
    },
    select: { sourceReference: true },
  });
  if (!receipt?.sourceReference || !refund.stripeAccountId)
    throw new ConflictException(
      "Stripe refund is missing its connected account or payment evidence",
    );
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
  if (!attempt?.stripePaymentIntentId)
    throw new ConflictException(
      "Stripe refund is missing its confirmed PaymentIntent",
    );

  const providerAttemptStartedAt = refund.providerAttemptStartedAt ?? now;
  if (!refund.providerAttemptStartedAt) {
    const reserved = await tx.financeRefund.updateMany({
      where: {
        id: refundId,
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        status: "APPROVED",
        providerAttemptStartedAt: null,
      },
      data: { providerAttemptStartedAt },
    });
    if (reserved.count !== 1)
      throw new ConflictException("Finance refund changed before submission");
  }
  return {
    kind: "submit",
    id: refund.id,
    stripeAccountId: refund.stripeAccountId,
    paymentIntentId: attempt.stripePaymentIntentId,
    amountMinor: refund.amountMinor,
    currency: refund.currency,
    providerAttemptStartedAt,
  };
}
