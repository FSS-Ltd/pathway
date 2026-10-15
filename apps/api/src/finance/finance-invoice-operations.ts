import { BadRequestException, ConflictException } from "@nestjs/common";
import { Prisma } from "@pathway/db";
import { calculateFinanceDocument } from "./domain/invoice-money";
import type { FinanceLineInput } from "./domain/invoice-money";

export interface FinanceInvoiceScope {
  tenantId: string;
  orgId: string;
}

export async function lockInvoice(
  tx: Prisma.TransactionClient,
  actor: FinanceInvoiceScope,
  invoiceId: string,
): Promise<void> {
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "FinanceInvoice"
    WHERE "id" = ${invoiceId}
      AND "tenantId" = ${actor.tenantId}
      AND "orgId" = ${actor.orgId}
    FOR UPDATE
  `;
}

export async function nextInvoiceNumber(
  tx: Prisma.TransactionClient,
  actor: FinanceInvoiceScope,
  financeProfileId: string,
): Promise<bigint> {
  const rows = await tx.$queryRaw<Array<{ lastIssuedNumber: bigint }>>`
    INSERT INTO "FinanceInvoiceNumberSequence" (
      "financeProfileId", "tenantId", "orgId", "lastIssuedNumber", "updatedAt"
    ) VALUES (${financeProfileId}, ${actor.tenantId}, ${actor.orgId}, 1, CURRENT_TIMESTAMP)
    ON CONFLICT ("financeProfileId", "tenantId", "orgId")
    DO UPDATE SET
      "lastIssuedNumber" = "FinanceInvoiceNumberSequence"."lastIssuedNumber" + 1,
      "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "lastIssuedNumber"
  `;
  if (rows.length !== 1 || rows[0].lastIssuedNumber <= 0n) {
    throw new ConflictException("Finance invoice number is unavailable");
  }
  return rows[0].lastIssuedNumber;
}

export function calculateInvoice(lines: readonly FinanceLineInput[]) {
  try {
    return calculateFinanceDocument(lines);
  } catch (error) {
    if (error instanceof RangeError) {
      throw new BadRequestException(error.message);
    }
    throw error;
  }
}

export function toDueDate(value: string | null): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}
