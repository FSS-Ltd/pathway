import type { Prisma } from "@pathway/db";
import {
  recordFinanceReceiptMovement,
  type FinanceReceiptMovementInput,
} from "../finance-receipt-movement.service";

const baseInput: FinanceReceiptMovementInput = {
  financeProfileId: "profile-1",
  receiptId: "receipt-1",
  tenantId: "tenant-1",
  orgId: "org-1",
  type: "REFUND",
  source: "MANUAL_TRANSFER",
  amountMinor: 60n,
  currency: "GBP",
  sourceReference: "refund-1",
  occurredAt: new Date("2026-10-19T10:00:00.000Z"),
};

function setup(
  inputRows: {
    allocations?: Array<{
      id: string;
      invoiceId: string;
      amountMinor: bigint;
      createdAt: Date;
      reversals: Array<{ amountMinor: bigint }>;
      movementApplications: Array<{
        amountMinor: bigint;
        movement: { type: FinanceReceiptMovementInput["type"] };
      }>;
    }>;
    returnApplications?: Array<{
      id: string;
      invoiceId: string;
      receiptAllocationId: string;
      amountMinor: bigint;
      reversedByApplications: Array<{ amountMinor: bigint }>;
    }>;
    existing?: {
      id: string;
      financeProfileId: string;
      receiptId: string;
      refundId: string | null;
      tenantId: string;
      orgId: string;
      type: FinanceReceiptMovementInput["type"];
      source: FinanceReceiptMovementInput["source"];
      amountMinor: bigint;
      currency: FinanceReceiptMovementInput["currency"];
      sourceReference: string;
      originalMovementId: string | null;
      applications: Array<{ amountMinor: bigint }>;
    } | null;
  } = {},
) {
  const movementFindFirst = jest
    .fn()
    .mockResolvedValue(inputRows.existing ?? null);
  const movementCreate = jest.fn().mockResolvedValue({ id: "movement-1" });
  const movementApplicationCreate = jest
    .fn()
    .mockResolvedValue({ id: "application-1" });
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue(
      [
        ...new Set(
          (inputRows.returnApplications ?? []).map((row) => row.invoiceId),
        ),
      ].map((id) => ({
        id,
        status: "ISSUED",
        totalMinor: 1000n,
      })),
    ),
    financeCreditNote: { findMany: jest.fn().mockResolvedValue([]) },
    financeReceiptMovement: {
      findFirst: movementFindFirst,
      create: movementCreate,
    },
    financeReceiptAllocation: {
      findMany: jest.fn().mockResolvedValue(inputRows.allocations ?? []),
    },
    financeReceiptMovementApplication: {
      findMany: jest.fn(
        async (args: Prisma.FinanceReceiptMovementApplicationFindManyArgs) =>
          args.where?.movementId ? (inputRows.returnApplications ?? []) : [],
      ),
      create: movementApplicationCreate,
    },
  } as unknown as Prisma.TransactionClient;
  return {
    tx,
    movementFindFirst,
    movementCreate,
    movementApplicationCreate,
  };
}

describe("recordFinanceReceiptMovement", () => {
  it("applies a refund across receipt allocations after previous reversals", async () => {
    const { tx, movementFindFirst, movementApplicationCreate } = setup({
      allocations: [
        {
          id: "allocation-1",
          invoiceId: "invoice-1",
          amountMinor: 70n,
          createdAt: new Date("2026-10-01T00:00:00.000Z"),
          reversals: [{ amountMinor: 10n }],
          movementApplications: [
            { amountMinor: 15n, movement: { type: "REFUND" } },
            { amountMinor: 5n, movement: { type: "REFUND_RETURN" } },
          ],
        },
        {
          id: "allocation-2",
          invoiceId: "invoice-2",
          amountMinor: 40n,
          createdAt: new Date("2026-10-02T00:00:00.000Z"),
          reversals: [],
          movementApplications: [],
        },
      ],
    });

    await expect(recordFinanceReceiptMovement(tx, baseInput)).resolves.toEqual({
      id: "movement-1",
      appliedMinor: 60n,
      duplicate: false,
    });

    expect(movementFindFirst).toHaveBeenCalledWith({
      where: {
        financeProfileId: "profile-1",
        receiptId: "receipt-1",
        tenantId: "tenant-1",
        orgId: "org-1",
        source: "MANUAL_TRANSFER",
        type: "REFUND",
        sourceReference: "refund-1",
      },
      select: expect.objectContaining({ id: true, amountMinor: true }),
    });
    expect(
      movementApplicationCreate.mock.calls.map(([call]) => call.data),
    ).toEqual([
      expect.objectContaining({
        invoiceId: "invoice-1",
        receiptAllocationId: "allocation-1",
        amountMinor: 50n,
      }),
      expect.objectContaining({
        invoiceId: "invoice-2",
        receiptAllocationId: "allocation-2",
        amountMinor: 10n,
      }),
    ]);
  });

  it("restores only the original movement applications on a refund return", async () => {
    const { tx, movementApplicationCreate } = setup({
      returnApplications: [
        {
          id: "debit-application-1",
          invoiceId: "invoice-1",
          receiptAllocationId: "allocation-1",
          amountMinor: 30n,
          reversedByApplications: [{ amountMinor: 10n }],
        },
      ],
    });

    await expect(
      recordFinanceReceiptMovement(tx, {
        ...baseInput,
        type: "REFUND_RETURN",
        source: "STRIPE",
        originalMovementId: "refund-movement-1",
        amountMinor: 25n,
      }),
    ).resolves.toEqual({
      id: "movement-1",
      appliedMinor: 20n,
      duplicate: false,
    });

    expect(movementApplicationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        invoiceId: "invoice-1",
        receiptAllocationId: "allocation-1",
        amountMinor: 20n,
        reversesApplicationId: "debit-application-1",
      }),
      select: { id: true },
    });
  });

  it("returns an existing movement only when the immutable facts match", async () => {
    const existing = {
      id: "movement-existing",
      financeProfileId: baseInput.financeProfileId,
      receiptId: baseInput.receiptId,
      refundId: null,
      tenantId: baseInput.tenantId,
      orgId: baseInput.orgId,
      type: baseInput.type,
      source: baseInput.source,
      amountMinor: baseInput.amountMinor,
      currency: baseInput.currency,
      sourceReference: baseInput.sourceReference,
      originalMovementId: null,
      applications: [{ amountMinor: 40n }],
    };
    const { tx, movementCreate, movementApplicationCreate } = setup({
      existing,
    });

    await expect(recordFinanceReceiptMovement(tx, baseInput)).resolves.toEqual({
      id: "movement-existing",
      appliedMinor: 40n,
      duplicate: true,
    });
    expect(movementCreate).not.toHaveBeenCalled();
    expect(movementApplicationCreate).not.toHaveBeenCalled();

    await expect(
      recordFinanceReceiptMovement(tx, { ...baseInput, amountMinor: 50n }),
    ).rejects.toThrow("does not match its original facts");
  });
});
