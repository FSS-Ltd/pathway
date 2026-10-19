import { Prisma } from "@pathway/db";
import type { FinanceCurrency } from "@pathway/platform";
import { addMinorUnits } from "./domain/minor-units";

export type FinanceReceiptMovementType =
  | "REFUND"
  | "REFUND_RETURN"
  | "DISPUTE_WITHDRAWAL"
  | "DISPUTE_REINSTATEMENT";

export type FinanceReceiptMovementSource = "MANUAL_TRANSFER" | "STRIPE";

export interface FinanceReceiptMovementInput {
  financeProfileId: string;
  receiptId: string;
  refundId?: string;
  tenantId: string;
  orgId: string;
  type: FinanceReceiptMovementType;
  source: FinanceReceiptMovementSource;
  amountMinor: bigint;
  currency: FinanceCurrency;
  sourceReference: string;
  stripeEventId?: string;
  originalMovementId?: string;
  occurredAt: Date;
  recordedByUserId?: string;
}

export interface FinanceReceiptMovementResult {
  id: string;
  appliedMinor: bigint;
  duplicate: boolean;
}

export async function recordFinanceReceiptMovement(
  tx: Prisma.TransactionClient,
  input: FinanceReceiptMovementInput,
): Promise<FinanceReceiptMovementResult> {
  if (input.amountMinor <= 0n) {
    throw new RangeError("Finance receipt movement must be positive");
  }
  const existing = await tx.financeReceiptMovement.findFirst({
    where: {
      financeProfileId: input.financeProfileId,
      receiptId: input.receiptId,
      tenantId: input.tenantId,
      orgId: input.orgId,
      source: input.source,
      type: input.type,
      sourceReference: input.sourceReference,
    },
    select: {
      id: true,
      financeProfileId: true,
      receiptId: true,
      refundId: true,
      tenantId: true,
      orgId: true,
      type: true,
      source: true,
      amountMinor: true,
      currency: true,
      sourceReference: true,
      originalMovementId: true,
      applications: { select: { amountMinor: true } },
    },
  });
  if (existing) {
    if (
      existing.financeProfileId !== input.financeProfileId ||
      existing.receiptId !== input.receiptId ||
      existing.refundId !== (input.refundId ?? null) ||
      existing.tenantId !== input.tenantId ||
      existing.orgId !== input.orgId ||
      existing.type !== input.type ||
      existing.source !== input.source ||
      existing.amountMinor !== input.amountMinor ||
      existing.currency !== input.currency ||
      existing.sourceReference !== input.sourceReference ||
      existing.originalMovementId !== (input.originalMovementId ?? null)
    ) {
      throw new Error(
        "Finance receipt movement does not match its original facts",
      );
    }
    return {
      id: existing.id,
      appliedMinor: existing.applications.reduce(
        (sum, application) => addMinorUnits(sum, application.amountMinor),
        0n,
      ),
      duplicate: true,
    };
  }

  const movement = await tx.financeReceiptMovement.create({
    data: {
      financeProfileId: input.financeProfileId,
      receiptId: input.receiptId,
      refundId: input.refundId,
      tenantId: input.tenantId,
      orgId: input.orgId,
      type: input.type,
      source: input.source,
      amountMinor: input.amountMinor,
      currency: input.currency,
      sourceReference: input.sourceReference,
      stripeEventId: input.stripeEventId,
      originalMovementId: input.originalMovementId,
      occurredAt: input.occurredAt,
      recordedByUserId: input.recordedByUserId,
    },
    select: { id: true },
  });

  const appliedMinor = isReturnMovement(input.type)
    ? await applyReturnMovement(tx, input, movement.id)
    : await applyDebitMovement(tx, input, movement.id);

  return { id: movement.id, appliedMinor, duplicate: false };
}

async function applyDebitMovement(
  tx: Prisma.TransactionClient,
  input: FinanceReceiptMovementInput,
  movementId: string,
): Promise<bigint> {
  const allocations = await tx.financeReceiptAllocation.findMany({
    where: {
      receiptId: input.receiptId,
      tenantId: input.tenantId,
      orgId: input.orgId,
    },
    select: {
      id: true,
      invoiceId: true,
      amountMinor: true,
      createdAt: true,
      reversals: { select: { amountMinor: true } },
      movementApplications: {
        select: {
          amountMinor: true,
          movement: { select: { type: true } },
        },
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  let remainingMinor = input.amountMinor;
  let appliedMinor = 0n;
  for (const allocation of allocations) {
    const reversedMinor = allocation.reversals.reduce(
      (sum, reversal) => addMinorUnits(sum, reversal.amountMinor),
      0n,
    );
    const movementImpactMinor = allocation.movementApplications.reduce(
      (sum, application) => {
        const sign = isReturnMovement(application.movement.type) ? -1n : 1n;
        return addMinorUnits(sum, sign * application.amountMinor);
      },
      0n,
    );
    const availableMinor =
      allocation.amountMinor - reversedMinor - movementImpactMinor;
    if (availableMinor <= 0n || remainingMinor <= 0n) continue;
    const amountMinor =
      availableMinor < remainingMinor ? availableMinor : remainingMinor;
    await tx.financeReceiptMovementApplication.create({
      data: {
        movementId,
        invoiceId: allocation.invoiceId,
        receiptAllocationId: allocation.id,
        tenantId: input.tenantId,
        orgId: input.orgId,
        amountMinor,
      },
      select: { id: true },
    });
    remainingMinor -= amountMinor;
    appliedMinor = addMinorUnits(appliedMinor, amountMinor);
  }
  return appliedMinor;
}

async function applyReturnMovement(
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

  let remainingMinor = input.amountMinor;
  let appliedMinor = 0n;
  for (const application of applications) {
    const reversedMinor = application.reversedByApplications.reduce(
      (sum, reversal) => addMinorUnits(sum, reversal.amountMinor),
      0n,
    );
    const availableMinor = application.amountMinor - reversedMinor;
    if (availableMinor <= 0n || remainingMinor <= 0n) continue;
    const amountMinor =
      availableMinor < remainingMinor ? availableMinor : remainingMinor;
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
    remainingMinor -= amountMinor;
    appliedMinor = addMinorUnits(appliedMinor, amountMinor);
  }
  return appliedMinor;
}

function isReturnMovement(
  type: FinanceReceiptMovementType,
): type is "REFUND_RETURN" | "DISPUTE_REINSTATEMENT" {
  return type === "REFUND_RETURN" || type === "DISPUTE_REINSTATEMENT";
}
