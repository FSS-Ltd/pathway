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
    financeCollectionPlan: { findFirst: jest.Mock; create: jest.Mock };
    financeProfile: { findFirst: jest.Mock };
    financeMandate: { findFirst: jest.Mock };
    financeStripeConnection: { findFirst: jest.Mock };
    financeCollectionPlanEvent: { create: jest.Mock };
  };
  let service: FinanceCollectionPlanService;

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
    };
    jest
      .mocked(withTenantRlsContext)
      .mockImplementation(async (_tenantId, _orgId, callback) =>
        callback(tx as unknown as Prisma.TransactionClient),
      );
    service = new FinanceCollectionPlanService(
      {
        assertStaffAction: jest.fn().mockResolvedValue(undefined),
      } as unknown as FinanceAccessService,
      {
        forInvoices: jest
          .fn()
          .mockResolvedValue(
            new Map([[invoice.id, { outstandingMinor: "12000" }]]),
          ),
      } as unknown as FinanceBalanceService,
      {
        mode: "test",
        webAppUrl: "https://family.example.test",
      } as FinanceStripeCheckoutConfig,
    );
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
