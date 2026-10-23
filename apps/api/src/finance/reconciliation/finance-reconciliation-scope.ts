import type { Prisma } from "@pathway/db";
import type { FinanceConnectionScope } from "./finance-reconciliation.types";

export async function assertReconciliationScope(
  tx: Prisma.TransactionClient,
  scope: FinanceConnectionScope,
): Promise<void> {
  const connection = await tx.financeStripeConnection.findFirst({
    where: {
      id: scope.connectionId,
      tenantId: scope.tenantId,
      orgId: scope.orgId,
      stripeAccountId: scope.stripeAccountId,
      livemode: scope.livemode,
    },
    select: { id: true },
  });
  if (!connection) throw new Error("Finance reconciliation scope is invalid");
}
