import { Prisma } from "@pathway/db";
import type { FinanceAccessScope } from "./access/finance-access.reader";

export async function lockBankTransferChange(
  tx: Prisma.TransactionClient,
  scope: FinanceAccessScope,
  changeId: string,
): Promise<void> {
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "FinanceBankTransferChange"
    WHERE "id" = ${changeId}
      AND "tenantId" = ${scope.tenantId}
      AND "orgId" = ${scope.orgId}
    FOR UPDATE
  `;
}

export async function lockManualReceiptRequest(
  tx: Prisma.TransactionClient,
  scope: FinanceAccessScope,
  requestId: string,
): Promise<void> {
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "FinanceManualReceiptRequest"
    WHERE "id" = ${requestId}
      AND "tenantId" = ${scope.tenantId}
      AND "orgId" = ${scope.orgId}
    FOR UPDATE
  `;
}
