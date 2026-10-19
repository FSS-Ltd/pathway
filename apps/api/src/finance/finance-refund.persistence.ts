import { NotFoundException } from "@nestjs/common";
import type { Prisma } from "@pathway/db";
import type { FinanceRefundActor } from "./finance-refund.service";
import {
  financeRefundInclude,
  type FinanceRefundRecord,
} from "./finance-refund-records";

export async function loadFinanceRefund(
  tx: Prisma.TransactionClient,
  actor: FinanceRefundActor,
  refundId: string,
): Promise<FinanceRefundRecord> {
  const refund = await tx.financeRefund.findFirst({
    where: {
      id: refundId,
      tenantId: actor.tenantId,
      orgId: actor.orgId,
    },
    include: financeRefundInclude,
  });
  if (!refund) throw new NotFoundException("Finance refund not found");
  return refund;
}

export async function lockFinanceRefund(
  tx: Prisma.TransactionClient,
  actor: FinanceRefundActor,
  refundId: string,
): Promise<void> {
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "FinanceRefund"
    WHERE "id" = ${refundId}
      AND "tenantId" = ${actor.tenantId}
      AND "orgId" = ${actor.orgId}
    FOR UPDATE
  `;
}
