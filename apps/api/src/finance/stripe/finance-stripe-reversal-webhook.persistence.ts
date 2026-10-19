import type { Prisma } from "@pathway/db";
import type { FinanceCurrency } from "@pathway/platform";
import { recordFinanceReceiptMovement } from "../finance-receipt-movement.service";
import type { FinanceStripeReversalWebhookInput } from "./finance-stripe-reversal-webhook.contracts";

export async function findReceiptForPaymentIntent(
  tx: Prisma.TransactionClient,
  input: FinanceStripeReversalWebhookInput,
  stripeAccountId: string,
  paymentIntentId: string,
) {
  const attempt = await tx.financeCheckoutAttempt.findFirst({
    where: {
      stripeAccountId,
      stripePaymentIntentId: paymentIntentId,
      tenantId: input.tenantId,
      orgId: input.orgId,
      status: "PAID",
    },
    select: {
      financeProfileId: true,
      stripeCheckoutSessionId: true,
    },
  });
  if (!attempt?.stripeCheckoutSessionId) return null;
  const receipt = await tx.financeReceipt.findFirst({
    where: {
      financeProfileId: attempt.financeProfileId,
      source: "STRIPE_CARD",
      sourceReference: attempt.stripeCheckoutSessionId,
      status: "CONFIRMED",
      tenantId: input.tenantId,
      orgId: input.orgId,
    },
    select: {
      id: true,
      financeProfileId: true,
      amountMinor: true,
      currency: true,
      confirmedAt: true,
    },
  });
  return receipt ? { attempt, receipt } : null;
}

export async function createRefundReturnMovement(
  tx: Prisma.TransactionClient,
  input: {
    webhook: FinanceStripeReversalWebhookInput;
    receipt: {
      id: string;
      financeProfileId: string;
      currency: FinanceCurrency;
    };
    refundId?: string;
    refundReference: string;
    returnEventId: string;
    returnOccurredAt: Date;
  },
): Promise<void> {
  const original = await tx.financeReceiptMovement.findFirst({
    where: {
      financeProfileId: input.receipt.financeProfileId,
      receiptId: input.receipt.id,
      source: "STRIPE",
      type: "REFUND",
      sourceReference: input.refundReference,
      tenantId: input.webhook.tenantId,
      orgId: input.webhook.orgId,
      occurredAt: { lte: input.returnOccurredAt },
    },
    select: { id: true, amountMinor: true },
  });
  if (!original) return;
  await recordFinanceReceiptMovement(tx, {
    financeProfileId: input.receipt.financeProfileId,
    receiptId: input.receipt.id,
    refundId: input.refundId,
    tenantId: input.webhook.tenantId,
    orgId: input.webhook.orgId,
    type: "REFUND_RETURN",
    source: "STRIPE",
    amountMinor: original.amountMinor,
    currency: input.receipt.currency,
    sourceReference: input.refundReference,
    stripeEventId: input.returnEventId,
    originalMovementId: original.id,
    occurredAt: input.returnOccurredAt,
  });
}

export async function synchronizeLocalRefundStatus(
  tx: Prisma.TransactionClient,
  input: FinanceStripeReversalWebhookInput,
  refund: {
    id: string;
    status: string;
    providerStatusAt: Date | null;
  },
  sourceReference: string,
): Promise<void> {
  const providerEvents = await tx.financeRefundEvent.findMany({
    where: {
      tenantId: input.tenantId,
      orgId: input.orgId,
      sourceReference,
      providerOccurredAt: { not: null },
    },
    select: { type: true, providerOccurredAt: true },
    orderBy: [
      { providerOccurredAt: "asc" },
      { createdAt: "asc" },
      { id: "asc" },
    ],
  });
  const events = providerEvents.filter(
    (event): event is typeof event & { providerOccurredAt: Date } =>
      event.providerOccurredAt !== null,
  );
  const successes = events.filter((event) => event.type === "CONFIRMED");
  const failures = events.filter((event) => event.type === "FAILED");
  const latestSuccess = successes.at(-1);
  const latestFailure = failures.at(-1);
  const latestSubmitted = events
    .filter((event) => event.type === "SUBMITTED")
    .at(-1);
  if (refund.status === "RETURNED") return;

  const returned = Boolean(
    latestSuccess &&
    latestFailure &&
    latestFailure.providerOccurredAt >= latestSuccess.providerOccurredAt,
  );
  const desiredStatus = returned
    ? "RETURNED"
    : latestSuccess
      ? "CONFIRMED"
      : latestFailure
        ? "FAILED"
        : latestSubmitted
          ? "SUBMITTED"
          : null;
  if (!desiredStatus) return;
  const latest =
    desiredStatus === "RETURNED" || desiredStatus === "FAILED"
      ? latestFailure
      : desiredStatus === "CONFIRMED"
        ? latestSuccess
        : latestSubmitted;
  if (!latest) return;
  if (
    refund.providerStatusAt &&
    latest.providerOccurredAt < refund.providerStatusAt
  ) {
    return;
  }

  if (desiredStatus === "RETURNED") {
    if (!latestSuccess) return;
    if (refund.status !== "CONFIRMED") {
      await tx.financeRefund.updateMany({
        where: {
          id: refund.id,
          tenantId: input.tenantId,
          orgId: input.orgId,
          status: { in: ["APPROVED", "SUBMITTED", "FAILED"] },
        },
        data: {
          status: "CONFIRMED",
          stripeRefundId: sourceReference,
          providerStatusAt: latestSuccess.providerOccurredAt,
          confirmedAt: latestSuccess.providerOccurredAt,
        },
      });
    }
    await tx.financeRefund.updateMany({
      where: {
        id: refund.id,
        tenantId: input.tenantId,
        orgId: input.orgId,
        status: "CONFIRMED",
      },
      data: {
        status: "RETURNED",
        stripeRefundId: sourceReference,
        providerStatusAt: latest.providerOccurredAt,
        returnedAt: latest.providerOccurredAt,
      },
    });
    const returnEvent = await tx.financeRefundEvent.findFirst({
      where: {
        refundId: refund.id,
        tenantId: input.tenantId,
        orgId: input.orgId,
        sourceReference,
        providerOccurredAt: latest.providerOccurredAt,
        type: "RETURNED",
      },
      select: { id: true },
    });
    if (!returnEvent) {
      await tx.financeRefundEvent.create({
        data: {
          refundId: refund.id,
          tenantId: input.tenantId,
          orgId: input.orgId,
          sourceReference,
          providerOccurredAt: latest.providerOccurredAt,
          type: "RETURNED",
          reason: "Stripe returned a previously confirmed refund",
        },
      });
    }
    return;
  }

  if (desiredStatus === "CONFIRMED") {
    if (refund.status === "CONFIRMED") {
      await tx.financeRefund.updateMany({
        where: {
          id: refund.id,
          tenantId: input.tenantId,
          orgId: input.orgId,
          status: "CONFIRMED",
        },
        data: { providerStatusAt: latest.providerOccurredAt },
      });
      return;
    }
    if (["APPROVED", "SUBMITTED", "FAILED"].includes(refund.status)) {
      await tx.financeRefund.updateMany({
        where: {
          id: refund.id,
          tenantId: input.tenantId,
          orgId: input.orgId,
          status: { in: ["APPROVED", "SUBMITTED", "FAILED"] },
        },
        data: {
          status: "CONFIRMED",
          stripeRefundId: sourceReference,
          providerStatusAt: latest.providerOccurredAt,
          confirmedAt:
            latestSuccess?.providerOccurredAt ?? latest.providerOccurredAt,
        },
      });
    }
    return;
  }

  if (desiredStatus === "FAILED" && refund.status === "CONFIRMED") return;
  if (
    desiredStatus === "SUBMITTED" &&
    !["APPROVED", "SUBMITTED"].includes(refund.status)
  ) {
    return;
  }
  if (
    desiredStatus === "FAILED" &&
    !["APPROVED", "SUBMITTED", "FAILED"].includes(refund.status)
  ) {
    return;
  }
  await tx.financeRefund.updateMany({
    where: {
      id: refund.id,
      tenantId: input.tenantId,
      orgId: input.orgId,
      status: { in: ["APPROVED", "SUBMITTED", "FAILED"] },
    },
    data: {
      status: desiredStatus,
      stripeRefundId: sourceReference,
      providerStatusAt: latest.providerOccurredAt,
      submittedAt:
        desiredStatus === "SUBMITTED" ? latest.providerOccurredAt : undefined,
      failedAt:
        desiredStatus === "FAILED" ? latest.providerOccurredAt : undefined,
    },
  });
}

export async function lockFinanceRefund(
  tx: Prisma.TransactionClient,
  input: FinanceStripeReversalWebhookInput,
  refundId: string,
): Promise<void> {
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "FinanceRefund"
    WHERE "id" = ${refundId}
      AND "tenantId" = ${input.tenantId}
      AND "orgId" = ${input.orgId}
    FOR UPDATE
  `;
}
