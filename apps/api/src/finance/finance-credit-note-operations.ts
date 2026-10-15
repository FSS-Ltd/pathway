import { BadRequestException, ConflictException } from "@nestjs/common";
import { Prisma } from "@pathway/db";
import {
  calculateFinanceDocument,
  quantityMilliunits,
} from "./domain/invoice-money";
import { addMinorUnits } from "./domain/minor-units";
import type { FinanceCreditNoteDraftInput } from "./dto/finance-credit-note.dto";

export interface FinanceCreditNoteScope {
  tenantId: string;
  orgId: string;
}

export function calculateCreditLines(
  invoiceLines: readonly {
    id: string;
    description: string;
    quantity: Prisma.Decimal;
    unitAmountMinor: bigint;
    taxRateBasisPoints: number;
  }[],
  inputLines: FinanceCreditNoteDraftInput["lines"],
) {
  try {
    const invoiceLineById = new Map(
      invoiceLines.map((line) => [line.id, line]),
    );
    const lines = inputLines.map((input) => {
      const source = invoiceLineById.get(input.sourceInvoiceLineId);
      if (!source) {
        throw new BadRequestException("Credit line must belong to the invoice");
      }
      if (
        quantityMilliunits(input.quantity) >
        quantityMilliunits(source.quantity.toString())
      ) {
        throw new BadRequestException(
          "Credit quantity exceeds the invoice line",
        );
      }
      return {
        description: source.description,
        quantity: input.quantity,
        unitAmountMinor: source.unitAmountMinor.toString(),
        taxRateBasisPoints: source.taxRateBasisPoints,
      };
    });
    return calculateFinanceDocument(lines);
  } catch (error) {
    if (error instanceof RangeError) {
      throw new BadRequestException(error.message);
    }
    throw error;
  }
}

export async function lockInvoice(
  tx: Prisma.TransactionClient,
  actor: FinanceCreditNoteScope,
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

export async function lockCreditNote(
  tx: Prisma.TransactionClient,
  actor: FinanceCreditNoteScope,
  creditNoteId: string,
): Promise<void> {
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "FinanceCreditNote"
    WHERE "id" = ${creditNoteId}
      AND "tenantId" = ${actor.tenantId}
      AND "orgId" = ${actor.orgId}
    FOR UPDATE
  `;
}

export async function nextCreditNoteNumber(
  tx: Prisma.TransactionClient,
  actor: FinanceCreditNoteScope,
  financeProfileId: string,
): Promise<bigint> {
  const rows = await tx.$queryRaw<Array<{ lastIssuedNumber: bigint }>>`
    INSERT INTO "FinanceCreditNoteNumberSequence" (
      "financeProfileId", "tenantId", "orgId", "lastIssuedNumber", "updatedAt"
    ) VALUES (${financeProfileId}, ${actor.tenantId}, ${actor.orgId}, 1, CURRENT_TIMESTAMP)
    ON CONFLICT ("financeProfileId", "tenantId", "orgId")
    DO UPDATE SET
      "lastIssuedNumber" = "FinanceCreditNoteNumberSequence"."lastIssuedNumber" + 1,
      "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "lastIssuedNumber"
  `;
  if (rows.length !== 1 || rows[0].lastIssuedNumber <= 0n) {
    throw new ConflictException("Finance credit note number is unavailable");
  }
  return rows[0].lastIssuedNumber;
}

export async function validateCreditCapacity(
  tx: Prisma.TransactionClient,
  actor: FinanceCreditNoteScope,
  invoice: {
    id: string;
    totalMinor: bigint;
    lines: Array<{
      id: string;
      quantity: Prisma.Decimal;
      netAmountMinor: bigint;
      taxAmountMinor: bigint;
      totalMinor: bigint;
    }>;
  },
  candidateLines: Array<{
    sourceInvoiceLineId: string;
    quantity: Prisma.Decimal;
    netAmountMinor: bigint;
    taxAmountMinor: bigint;
    totalMinor: bigint;
  }>,
  excludeCreditNoteId?: string,
): Promise<void> {
  const lineIds = invoice.lines.map((line) => line.id);
  const existingLines = await tx.financeCreditNoteLine.findMany({
    where: {
      sourceInvoiceLineId: { in: lineIds },
      tenantId: actor.tenantId,
      orgId: actor.orgId,
      creditNote: {
        invoiceId: invoice.id,
        status: "ISSUED",
        ...(excludeCreditNoteId ? { id: { not: excludeCreditNoteId } } : {}),
      },
    },
    select: {
      sourceInvoiceLineId: true,
      quantity: true,
      netAmountMinor: true,
      taxAmountMinor: true,
      totalMinor: true,
    },
  });
  const sourceById = new Map(invoice.lines.map((line) => [line.id, line]));
  const totalsBySource = new Map<
    string,
    { quantity: bigint; net: bigint; tax: bigint; total: bigint }
  >();

  for (const line of [...existingLines, ...candidateLines]) {
    const source = sourceById.get(line.sourceInvoiceLineId);
    if (!source) {
      throw new ConflictException(
        "Credit line no longer belongs to the invoice",
      );
    }
    const totals = totalsBySource.get(line.sourceInvoiceLineId) ?? {
      quantity: 0n,
      net: 0n,
      tax: 0n,
      total: 0n,
    };
    totals.quantity += quantityMilliunits(line.quantity.toString());
    totals.net = addMinorUnits(totals.net, line.netAmountMinor);
    totals.tax = addMinorUnits(totals.tax, line.taxAmountMinor);
    totals.total = addMinorUnits(totals.total, line.totalMinor);
    totalsBySource.set(line.sourceInvoiceLineId, totals);
    if (
      totals.quantity > quantityMilliunits(source.quantity.toString()) ||
      totals.net > source.netAmountMinor ||
      totals.tax > source.taxAmountMinor ||
      totals.total > source.totalMinor
    ) {
      throw new ConflictException(
        "Issued credits exceed the invoice line amount",
      );
    }
  }

  const alreadyCredited = await tx.financeCreditNote.aggregate({
    where: {
      invoiceId: invoice.id,
      tenantId: actor.tenantId,
      orgId: actor.orgId,
      status: "ISSUED",
      ...(excludeCreditNoteId ? { id: { not: excludeCreditNoteId } } : {}),
    },
    _sum: { totalMinor: true },
  });
  const currentTotal = alreadyCredited._sum.totalMinor ?? 0n;
  const candidateTotal = candidateLines.reduce(
    (sum, line) => addMinorUnits(sum, line.totalMinor),
    0n,
  );
  if (addMinorUnits(currentTotal, candidateTotal) > invoice.totalMinor) {
    throw new ConflictException("Issued credits exceed the invoice total");
  }
}
