import type { Prisma } from "@pathway/db";
import type { FinanceConnectionScope } from "./finance-reconciliation.types";
import type { FinanceUnresolvedOperation } from "./finance-unresolved-operations.persistence";
import { assertReconciliationScope } from "./finance-reconciliation-scope";

export const unresolvedMandateSelection = {
  id: true,
  status: true,
  stripeSetupIntentId: true,
  stripeMandateId: true,
  stripePaymentMethodId: true,
  stripeCheckoutSessionId: true,
  providerCancellationPending: true,
  stripeCustomer: { select: { stripeCustomerId: true } },
} satisfies Prisma.FinanceMandateSelect;
export type FinanceUnresolvedMandate = Prisma.FinanceMandateGetPayload<{
  select: typeof unresolvedMandateSelection;
}>;
export interface FinanceUnresolvedContext {
  operation: FinanceUnresolvedOperation;
  attemptedAt: Date | null;
  search: unknown;
  mandate: FinanceUnresolvedMandate | null;
}
export async function readFinanceUnresolvedContext(
  tx: Prisma.TransactionClient,
  scope: FinanceConnectionScope,
  operation: FinanceUnresolvedOperation,
): Promise<FinanceUnresolvedContext> {
  await assertReconciliationScope(tx, scope);
  const existing = await tx.financeReconciliationCase.findFirst({
    where: {
      tenantId: scope.tenantId,
      orgId: scope.orgId,
      stripeConnectionId: scope.connectionId,
      caseKey: `unresolved:${operation.key}`,
    },
    select: { details: true },
  });
  const details = existing?.details;
  const search =
    details && typeof details === "object" && !Array.isArray(details)
      ? details.search
      : undefined;
  const refund =
    operation.kind === "refund"
      ? await tx.financeRefund.findFirst({
          where: {
            id: operation.id,
            tenantId: scope.tenantId,
            orgId: scope.orgId,
            stripeAccountId: scope.stripeAccountId,
          },
          select: { providerAttemptStartedAt: true },
        })
      : null;
  const mandate =
    operation.kind === "mandate"
      ? await tx.financeMandate.findFirst({
          where: {
            id: operation.id,
            tenantId: scope.tenantId,
            orgId: scope.orgId,
            stripeConnectionId: scope.connectionId,
            stripeAccountId: scope.stripeAccountId,
            livemode: scope.livemode,
          },
          select: unresolvedMandateSelection,
        })
      : null;
  return {
    operation,
    search,
    mandate,
    attemptedAt:
      operation.kind === "refund"
        ? (refund?.providerAttemptStartedAt ?? null)
        : operation.createdAt,
  };
}
