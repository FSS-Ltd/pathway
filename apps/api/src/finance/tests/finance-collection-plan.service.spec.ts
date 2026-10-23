import { FINANCE_BACS_COLLECTION_TERMS_VERSION } from "../domain/finance-collection-terms";
import { withTenantRlsContext } from "@pathway/db";
import type { Prisma } from "@pathway/db";
import type { FinanceAccessService } from "../access/finance-access.service";
import type { FinanceBalanceService } from "../finance-balance.service";
import { FinanceCollectionPlanService } from "../finance-collection-plan.service";
import type { FinanceStripeCheckoutConfig } from "../stripe/finance-stripe-checkout.config";

jest.mock("@pathway/db", () => ({
  withTenantRlsContext: jest.fn(),
}));

jest.mock("../finance-invoice-operations", () => ({
  lockInvoice: jest.fn(),
}));

describe("FinanceCollectionPlanService", () => {
  const scope = { tenantId: "tenant-a", orgId: "org-a" };
  const actor = { ...scope, userId: "staff-a" };
  const payerAccountId = "00000000-0000-4000-8000-000000000001";
  const mandateId = "00000000-0000-4000-8000-000000000002";
  const invoice = {
    id: "invoice-a",
    financeProfileId: "profile-a",
    payerAccountId,
    status: "ISSUED",
    currency: "GBP",
    totalMinor: 12_000n,
    issuedAt: new Date("2026-10-01T00:00:00.000Z"),
  };

  let tx: {
    $queryRaw: jest.Mock;
    financeInvoice: { findFirst: jest.Mock };
    financeCollectionPlan: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    financeCollectionInstalment: { createMany: jest.Mock };
    financeProfile: { findFirst: jest.Mock };
    financeMandate: { findFirst: jest.Mock };
    financeStripeConnection: { findFirst: jest.Mock };
    financeCollectionPlanEvent: { create: jest.Mock };
  };
  let service: FinanceCollectionPlanService;
  let balanceForInvoices: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: mandateId }]),
      financeInvoice: { findFirst: jest.fn().mockResolvedValue(invoice) },
      financeCollectionPlan: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: "plan-existing", version: 1 }),
        create: jest.fn().mockResolvedValue({ id: "plan-new" }),
        update: jest.fn(),
      },
      financeProfile: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ countryCode: "GB", currency: "GBP" }),
      },
      financeMandate: {
        findFirst: jest.fn().mockResolvedValue({
          id: mandateId,
          stripeConnectionId: "connection-a",
          stripeAccountId: "acct_school_test",
          livemode: false,
        }),
      },
      financeStripeConnection: {
        findFirst: jest.fn().mockResolvedValue({
          id: "connection-a",
          stripeAccountId: "acct_school_test",
          livemode: false,
        }),
      },
      financeCollectionPlanEvent: { create: jest.fn().mockResolvedValue({}) },
      financeCollectionInstalment: { createMany: jest.fn() },
    };
    jest
      .mocked(withTenantRlsContext)
      .mockImplementation(async (_tenantId, _orgId, callback) =>
        callback(tx as unknown as Prisma.TransactionClient),
      );
    balanceForInvoices = jest
      .fn()
      .mockResolvedValue(
        new Map([[invoice.id, { outstandingMinor: "12000" }]]),
      );
    service = new FinanceCollectionPlanService(
      {
        assertStaffAction: jest.fn().mockResolvedValue(undefined),
        assertPayerAction: jest.fn().mockResolvedValue(undefined),
      } as unknown as FinanceAccessService,
      {
        forInvoices: balanceForInvoices,
      } as unknown as FinanceBalanceService,
      {
        mode: "test",
        webAppUrl: "https://family.example.test",
      } as FinanceStripeCheckoutConfig,
    );
  });

  it.each([
    [1_000_001n, 1],
    [2_000_001n, 2],
  ])(
    "rejects unsupported Bacs instalments including a final remainder for total %s and count %i",
    async (totalMinor, instalmentCount) => {
      tx.financeInvoice.findFirst.mockResolvedValue({ ...invoice, totalMinor });
      await expect(
        service.create(actor, invoice.id, {
          payerAccountId,
          mandateId,
          instalmentCount,
          firstDueDate: "2027-01-05",
        }),
      ).rejects.toMatchObject({ status: 422 });
      expect(tx.financeCollectionPlan.create).not.toHaveBeenCalled();
    },
  );

  it("revalidates a legacy pending plan before activation or persisting its schedule", async () => {
    tx.financeCollectionPlan.findFirst.mockResolvedValue({
      id: "plan-legacy",
      status: "PENDING_PAYER_ACCEPTANCE",
      financeProfileId: invoice.financeProfileId,
      invoiceId: invoice.id,
      mandateId,
      amountMinor: 1_000_001n,
      currency: "GBP",
      instalmentCount: 1,
      firstDueAt: new Date("2027-01-05T00:00:00Z"),
      consentVersion: FINANCE_BACS_COLLECTION_TERMS_VERSION,
    });
    tx.financeInvoice.findFirst.mockResolvedValue({
      ...invoice,
      totalMinor: 1_000_001n,
    });
    balanceForInvoices.mockResolvedValue(
      new Map([[invoice.id, { outstandingMinor: "1000001" }]]),
    );
    await expect(
      service.accept(actor, payerAccountId, "plan-legacy"),
    ).rejects.toMatchObject({ status: 422 });
    expect(tx.financeCollectionPlan.update).not.toHaveBeenCalled();
    expect(tx.financeCollectionInstalment.createMany).not.toHaveBeenCalled();
  });

  it("rejects a second collection plan while one is awaiting or processing", async () => {
    await expect(
      service.create(actor, invoice.id, {
        payerAccountId,
        mandateId,
        instalmentCount: 3,
        firstDueDate: "2027-01-05",
      }),
    ).rejects.toThrow("An existing collection plan must be resolved first");

    expect(tx.financeCollectionPlan.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          invoiceId: invoice.id,
          status: {
            in: [
              "PENDING_REVIEW",
              "PENDING_PAYER_ACCEPTANCE",
              "ACTIVE",
              "PAUSED",
            ],
          },
        }),
      }),
    );
    expect(tx.financeCollectionPlan.create).not.toHaveBeenCalled();
  });
});
