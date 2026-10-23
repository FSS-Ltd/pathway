import type { Prisma } from "@pathway/db";
import { addMinorUnits } from "./domain/minor-units";
import { FinanceBalanceService } from "./finance-balance.service";
import type { FinanceReceiptMovementInput } from "./finance-receipt-movement.service";

export async function applyFinanceReturnMovement(
  tx: Prisma.TransactionClient,
  input: FinanceReceiptMovementInput,
  movementId: string,
): Promise<bigint> {
  if (!input.originalMovementId) {
    throw new Error("Finance return movement is missing its source movement");
  }
  const applications = await tx.financeReceiptMovementApplication.findMany({
    where: {
      movementId: input.originalMovementId,
      tenantId: input.tenantId,
      orgId: input.orgId,
    },
    select: {
      id: true,
      invoiceId: true,
      receiptAllocationId: true,
      amountMinor: true,
      reversedByApplications: { select: { amountMinor: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const invoiceIds = [...new Set(applications.map((item) => item.invoiceId))];
  if (invoiceIds.length === 0) return 0n;
  // Share the allocation row lock, in a stable order, without per-invoice queries.
  const invoices = await tx.$queryRaw<
    Array<{
      id: string;
      status: "DRAFT" | "IN_REVIEW" | "ISSUED" | "VOID";
      totalMinor: bigint;
    }>
  >`
    SELECT "id", "status", "totalMinor" FROM "FinanceInvoice"
    WHERE "tenantId" = ${input.tenantId} AND "orgId" = ${input.orgId}
      AND "id" = ANY(${invoiceIds}::TEXT[])
    ORDER BY "id" FOR UPDATE
  `;
  const balances = await new FinanceBalanceService().forInvoices(
    tx,
    input,
    invoices,
  );
  const remainingDebt = new Map(
    [...balances].map(([id, balance]) => [
      id,
      BigInt(balance.outstandingMinor),
    ]),
  );
  let remainingMinor = input.amountMinor;
  let appliedMinor = 0n;
  for (const application of applications) {
    const reversedMinor = application.reversedByApplications.reduce(
      (sum, reversal) => addMinorUnits(sum, reversal.amountMinor),
      0n,
    );
    const debtMinor = remainingDebt.get(application.invoiceId);
    if (debtMinor === undefined)
      throw new Error("Finance return invoice unavailable");
    const availableMinor = application.amountMinor - reversedMinor;
    if (availableMinor <= 0n || remainingMinor <= 0n || debtMinor <= 0n)
      continue;
    const sourceMinor =
      availableMinor < remainingMinor ? availableMinor : remainingMinor;
    const amountMinor = sourceMinor < debtMinor ? sourceMinor : debtMinor;
    await tx.financeReceiptMovementApplication.create({
      data: {
        movementId,
        invoiceId: application.invoiceId,
        receiptAllocationId: application.receiptAllocationId,
        reversesApplicationId: application.id,
        tenantId: input.tenantId,
        orgId: input.orgId,
        amountMinor,
      },
      select: { id: true },
    });
    remainingDebt.set(application.invoiceId, debtMinor - amountMinor);
    remainingMinor -= amountMinor;
    appliedMinor = addMinorUnits(appliedMinor, amountMinor);
  }
  return appliedMinor;
}
