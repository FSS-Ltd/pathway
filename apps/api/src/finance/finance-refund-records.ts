import type { Prisma } from "@pathway/db";

export const financeRefundInclude = {
  events: {
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
    select: {
      type: true,
      sourceReference: true,
      reason: true,
      actorUserId: true,
      createdAt: true,
    },
  },
} satisfies Prisma.FinanceRefundInclude;

export type FinanceRefundRecord = Prisma.FinanceRefundGetPayload<{
  include: typeof financeRefundInclude;
}>;

export function toFinanceRefundView(refund: FinanceRefundRecord) {
  return {
    id: refund.id,
    receiptId: refund.receiptId,
    source: refund.source,
    status: refund.status,
    amountMinor: refund.amountMinor.toString(),
    currency: refund.currency,
    reason: refund.reason,
    decisionReason: refund.decisionReason,
    bankTransactionReference: refund.bankTransactionReference,
    stripeRefundId: refund.stripeRefundId,
    requestedByUserId: refund.requestedByUserId,
    approvedByUserId: refund.approvedByUserId,
    createdAt: refund.createdAt.toISOString(),
    approvedAt: refund.approvedAt?.toISOString() ?? null,
    submittedAt: refund.submittedAt?.toISOString() ?? null,
    confirmedAt: refund.confirmedAt?.toISOString() ?? null,
    failedAt: refund.failedAt?.toISOString() ?? null,
    returnedAt: refund.returnedAt?.toISOString() ?? null,
    events: refund.events.map((event) => ({
      type: event.type,
      sourceReference: event.sourceReference,
      reason: event.reason,
      actorUserId: event.actorUserId,
      createdAt: event.createdAt.toISOString(),
    })),
  };
}
