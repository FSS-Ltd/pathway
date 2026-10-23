import type { Prisma } from "@pathway/db";

const connectionSelect = {
  id: true,
  stripeAccountId: true,
  livemode: true,
  status: true,
  disconnectedAt: true,
  financeProfile: { select: { legalEntityName: true } },
} satisfies Prisma.FinanceStripeConnectionSelect;
export const caseInclude = {
  stripeConnection: { select: connectionSelect },
} satisfies Prisma.FinanceReconciliationCaseInclude;

export function caseView(
  row: Prisma.FinanceReconciliationCaseGetPayload<{
    include: typeof caseInclude;
  }>,
) {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    resourceReference: row.resourceReference,
    amountMinor: row.amountMinor?.toString() ?? null,
    currency: row.currency,
    details: row.details,
    lastSeenAt: row.lastSeenAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    connection: {
      id: row.stripeConnection.id,
      accountId: row.stripeConnection.stripeAccountId,
      mode: row.stripeConnection.livemode ? "LIVE" : "TEST",
      status: row.stripeConnection.status,
      disconnectedAt:
        row.stripeConnection.disconnectedAt?.toISOString() ?? null,
      legalEntityName: row.stripeConnection.financeProfile.legalEntityName,
    },
  };
}
