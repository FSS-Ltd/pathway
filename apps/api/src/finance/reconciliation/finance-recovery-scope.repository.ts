import { NotFoundException } from "@nestjs/common";
import { runTransaction, withTenantRlsContext } from "@pathway/db";
import { z } from "zod";
import {
  financeRecoveryRequestSchema,
  type FinanceRecoveryRequest,
  type FinanceRecoveryWork,
} from "./finance-recovery.contracts";
import type { FinanceConnectionScope } from "./finance-reconciliation.types";

export async function loadFinanceRecoveryScope(
  input: Pick<FinanceRecoveryRequest, "tenantId" | "orgId" | "connectionId">,
): Promise<FinanceConnectionScope> {
  return withTenantRlsContext(input.tenantId, input.orgId, async (tx) => {
    const connection = await tx.financeStripeConnection.findFirst({
      where: {
        id: input.connectionId,
        tenantId: input.tenantId,
        orgId: input.orgId,
        stripeAccountId: { not: null },
      },
      select: { id: true, stripeAccountId: true, livemode: true },
    });
    if (!connection?.stripeAccountId)
      throw new NotFoundException("Finance recovery connection unavailable");
    return {
      ...input,
      stripeAccountId: connection.stripeAccountId,
      livemode: connection.livemode,
    };
  });
}
/** Backend-only scoped identifiers; all actual finance work loads a tenant transaction afterwards. */
export async function readFinanceRecoveryWork(
  now: Date,
  livemode: boolean,
  limit = 100,
): Promise<FinanceRecoveryWork[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new RangeError("Invalid recovery work limit");
  return runTransaction(async (tx) => {
    const rows = await tx.$queryRaw<
      unknown[]
    >`SELECT * FROM app.list_due_finance_reconciliation_scopes(${now},${livemode},${limit}::INTEGER)`;
    return z
      .array(financeRecoveryRequestSchema.omit({ mode: true }))
      .max(100)
      .parse(rows);
  });
}
