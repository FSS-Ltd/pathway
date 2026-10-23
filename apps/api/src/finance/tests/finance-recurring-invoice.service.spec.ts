import { Prisma, withTenantRlsContext } from "@pathway/db";
import type { FinanceAccessService } from "../access/finance-access.service";
import { FinanceRecurringInvoiceService } from "../finance-recurring-invoice.service";

jest.mock("@pathway/db", () => ({
  Prisma: {
    Decimal: class Decimal {
      constructor(private readonly value: string) {}
      toString() {
        return this.value;
      }
    },
  },
  withTenantRlsContext: jest.fn(),
}));

describe("FinanceRecurringInvoiceService", () => {
  const scope = { tenantId: "tenant-a", orgId: "org-a" };
  const actor = { ...scope, userId: "staff-a" };
  let tx: {
    $queryRaw: jest.Mock;
    financeRecurringInvoiceTemplate: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    financePayerAccount: { findFirst: jest.Mock };
    financeProfile: { findUnique: jest.Mock };
    financeInvoice: { findUnique: jest.Mock; create: jest.Mock };
  };
  let financeAccess: {
    assertStaffAction: jest.Mock;
    resolveMode: jest.Mock;
  };
  let service: FinanceRecurringInvoiceService;

  beforeEach(() => {
    jest.clearAllMocks();
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: "template-1" }]),
      financeRecurringInvoiceTemplate: {
        create: jest.fn().mockResolvedValue({
          id: "template-1",
          currency: "EUR",
          nextPeriodStart: new Date("2026-02-01T00:00:00.000Z"),
        }),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: "template-1" }),
      },
      financePayerAccount: {
        findFirst: jest.fn().mockResolvedValue({ id: "payer-1" }),
      },
      financeProfile: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: "profile-1", currency: "EUR" }),
      },
      financeInvoice: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "invoice-1" }),
      },
    };
    jest
      .mocked(withTenantRlsContext)
      .mockImplementation(async (_tenantId, _orgId, callback) =>
        callback(tx as unknown as Prisma.TransactionClient),
      );
    financeAccess = {
      assertStaffAction: jest.fn().mockResolvedValue(undefined),
      resolveMode: jest.fn().mockResolvedValue("ACTIVE"),
    };
    service = new FinanceRecurringInvoiceService(
      financeAccess as unknown as FinanceAccessService,
    );
  });

  it("creates a template using the school's configured currency", async () => {
    await expect(
      service.createTemplate(actor, {
        payerAccountId: "payer-1",
        firstPeriodStart: "2026-02-01",
        dayOfMonth: 31,
        dueDays: 14,
        lines: [
          {
            description: "Monthly tuition",
            quantity: "1",
            unitAmountMinor: "10000",
            taxRateBasisPoints: 0,
          },
        ],
      }),
    ).resolves.toMatchObject({ templateId: "template-1", currency: "EUR" });

    expect(tx.financeRecurringInvoiceTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currency: "EUR",
          dueDays: 14,
          tenantId: scope.tenantId,
          orgId: scope.orgId,
          lines: {
            create: [
              {
                lineOrder: 0,
                description: "Monthly tuition",
                quantity: expect.any(Prisma.Decimal),
                unitAmountMinor: 10_000n,
                taxRateBasisPoints: 0,
              },
            ],
          },
        }),
      }),
    );
  });

  it("generates a draft for the due month and advances its period atomically", async () => {
    tx.financeRecurringInvoiceTemplate.findMany.mockResolvedValue([
      { id: "template-1" },
    ]);
    tx.financeRecurringInvoiceTemplate.findFirst.mockResolvedValue({
      id: "template-1",
      financeProfileId: "profile-1",
      payerAccountId: "payer-1",
      tenantId: scope.tenantId,
      orgId: scope.orgId,
      currency: "EUR",
      dayOfMonth: 31,
      dueDays: 14,
      nextPeriodStart: new Date("2026-02-01T00:00:00.000Z"),
      createdByUserId: "staff-a",
      lines: [
        {
          description: "Monthly tuition",
          quantity: new Prisma.Decimal("1"),
          unitAmountMinor: 10_000n,
          taxRateBasisPoints: 0,
        },
      ],
    });

    await expect(
      service.generateDueForScope(scope, new Date("2026-02-28T12:00:00.000Z")),
    ).resolves.toEqual({ generated: 1, invoiceIds: ["invoice-1"] });

    expect(tx.financeInvoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "DRAFT",
          recurringPeriodStart: new Date("2026-02-01T00:00:00.000Z"),
          dueAt: new Date("2026-03-14T00:00:00.000Z"),
          totalMinor: 10_000n,
          tenantId: scope.tenantId,
          orgId: scope.orgId,
          lines: {
            create: [
              {
                lineOrder: 0,
                description: "Monthly tuition",
                quantity: expect.any(Prisma.Decimal),
                unitAmountMinor: 10_000n,
                taxRateBasisPoints: 0,
                netAmountMinor: 10_000n,
                taxAmountMinor: 0n,
                totalMinor: 10_000n,
              },
            ],
          },
          events: { create: { actorUserId: "staff-a", type: "CREATED" } },
        }),
      }),
    );
    expect(tx.financeRecurringInvoiceTemplate.update).toHaveBeenCalledWith({
      where: { id: "template-1" },
      data: { nextPeriodStart: new Date("2026-03-01T00:00:00.000Z") },
    });
  });

  it("does not generate invoices after Finance enters servicing mode", async () => {
    financeAccess.resolveMode.mockResolvedValue("SERVICING");

    await expect(
      service.generateDueForScope(scope, new Date("2026-02-28T12:00:00.000Z")),
    ).resolves.toEqual({ generated: 0, invoiceIds: [] });
    expect(withTenantRlsContext).not.toHaveBeenCalled();
  });
});
