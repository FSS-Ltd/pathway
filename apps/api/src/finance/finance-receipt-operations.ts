import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@pathway/db";
import { parseMinorUnits } from "./domain/minor-units";

interface FinanceReceiptScope {
  tenantId: string;
  orgId: string;
}

export async function lockReceipt(
  tx: Prisma.TransactionClient,
  actor: FinanceReceiptScope,
  receiptId: string,
): Promise<void> {
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "FinanceReceipt"
    WHERE "id" = ${receiptId}
      AND "tenantId" = ${actor.tenantId}
      AND "orgId" = ${actor.orgId}
    FOR UPDATE
  `;
}

export async function lockAllocation(
  tx: Prisma.TransactionClient,
  actor: FinanceReceiptScope,
  allocationId: string,
): Promise<void> {
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "FinanceReceiptAllocation"
    WHERE "id" = ${allocationId}
      AND "tenantId" = ${actor.tenantId}
      AND "orgId" = ${actor.orgId}
    FOR UPDATE
  `;
}

export function parsePositiveAmount(value: string): bigint {
  try {
    const amount = parseMinorUnits(value);
    if (amount <= 0n) throw new RangeError("Amount must be positive");
    return amount;
  } catch (error) {
    if (error instanceof RangeError) {
      throw new BadRequestException(error.message);
    }
    throw error;
  }
}
