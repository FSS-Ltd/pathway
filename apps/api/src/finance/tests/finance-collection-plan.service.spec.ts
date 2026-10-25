import {
  FINANCE_BACS_COLLECTION_TERMS_VERSION,
  FINANCE_BACS_MANDATE_CONSENT_VERSION,
} from "../domain/finance-collection-terms";
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
    service = serviceFor("test");
  });

  function serviceFor(mode: "test" | "live" | "disabled") {
    return new FinanceCollectionPlanService(
      {
        assertStaffAction: jest.fn().mockResolvedValue(undefined),
        assertPayerAction: jest.fn().mockResolvedValue(undefined),
        authorizeAutomatedDebitApproval: jest.fn().mockResolvedValue(undefined),
      } as unknown as FinanceAccessService,
      {
        forInvoices: balanceForInvoices,
      } as unknown as FinanceBalanceService,
      (mode === "disabled"
        ? { mode }
        : {
            mode,
            webAppUrl: "https://family.example.test",
          }) as FinanceStripeCheckoutConfig,
    );
  }

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

  describe("collection mode", () => {
    const draft = {
      payerAccountId,
      mandateId,
      instalmentCount: 3,
      firstDueDate: "2027-01-05",
    };

    it("does not accept new collection plans when Finance collection is disabled", async () => {
      await expect(
        serviceFor("disabled").create(actor, invoice.id, draft),
      ).rejects.toMatchObject({ status: 503 });
      expect(tx.financeCollectionPlan.create).not.toHaveBeenCalled();
    });

    it("creates a live plan against a live school account and mandate", async () => {
      tx.financeCollectionPlan.findFirst.mockResolvedValue(null);
      tx.financeMandate.findFirst.mockResolvedValue({
        id: mandateId,
        stripeConnectionId: "connection-a",
        stripeAccountId: "acct_school_live",
        livemode: true,
      });
      tx.financeStripeConnection.findFirst.mockResolvedValue({
        id: "connection-a",
        stripeAccountId: "acct_school_live",
        livemode: true,
      });
      await expect(
        serviceFor("live").create(actor, invoice.id, draft),
      ).resolves.toEqual({ planId: "plan-new", status: "PENDING_REVIEW" });
      expect(tx.financeStripeConnection.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ livemode: true }),
        }),
      );
    });

    it("refuses a live plan when the stored mandate is a test-mode record", async () => {
      tx.financeCollectionPlan.findFirst.mockResolvedValue(null);
      tx.financeStripeConnection.findFirst.mockResolvedValue({
        id: "connection-a",
        stripeAccountId: "acct_school_test",
        livemode: true,
      });
      await expect(
        serviceFor("live").create(actor, invoice.id, draft),
      ).rejects.toThrow("does not match the school account");
      expect(tx.financeCollectionPlan.create).not.toHaveBeenCalled();
    });

    describe("resumeByStaff", () => {
      const resumeBase = {
        id: "plan-a",
        status: "PAUSED",
        invoiceId: invoice.id,
        payerAccountId,
        acceptedByUserId: "payer-user",
        createdByUserId: "creator",
        approvedByUserId: "someone-else",
        amountMinor: 12_000n,
        currency: "GBP",
        consentVersion: FINANCE_BACS_COLLECTION_TERMS_VERSION,
      };
      const resumable = (live: boolean) => ({
        ...resumeBase,
        mandate: {
          status: "ACTIVE",
          consentVersion: FINANCE_BACS_MANDATE_CONSENT_VERSION,
          stripeConnectionId: "connection-a",
          stripeAccountId: "acct_school",
          livemode: live,
          stripeCustomer: {
            stripeAccountId: "acct_school",
            stripeConnectionId: "connection-a",
            payerAccountId,
            livemode: live,
          },
        },
        stripeConnection: {
          id: "connection-a",
          status: "READY",
          stripeAccountId: "acct_school",
          livemode: live,
        },
      });
      function prepareResume(live: boolean) {
        Object.assign(tx, {
          financeDebitAttempt: { findFirst: jest.fn().mockResolvedValue(null) },
        });
        (tx.financeCollectionInstalment as Record<string, jest.Mock>) = {
          ...tx.financeCollectionInstalment,
          findMany: jest.fn().mockResolvedValue([{ amountMinor: 12_000n }]),
          updateMany: jest.fn().mockResolvedValue({}),
        };
        tx.financeInvoice.findFirst.mockResolvedValue({
          id: invoice.id,
          status: "ISSUED",
          totalMinor: 12_000n,
          issuedAt: invoice.issuedAt,
        });
        tx.financeCollectionPlan.findFirst
          .mockReset()
          .mockResolvedValueOnce(resumeBase)
          .mockResolvedValueOnce(resumable(live));
        tx.$queryRaw.mockResolvedValue([{ id: "locked" }]);
      }

      it("is unavailable when Finance collection is disabled", async () => {
        prepareResume(false);
        await expect(
          serviceFor("disabled").resumeByStaff(actor, "plan-a"),
        ).rejects.toMatchObject({ status: 503 });
      });

      it("resumes a live plan whose mandate, customer and account are live", async () => {
        prepareResume(true);
        await expect(
          serviceFor("live").resumeByStaff(actor, "plan-a"),
        ).resolves.toEqual({ planId: "plan-a", status: "ACTIVE" });
      });

      it("refuses to resume a live plan that holds test-mode records", async () => {
        prepareResume(false);
        await expect(
          serviceFor("live").resumeByStaff(actor, "plan-a"),
        ).rejects.toThrow("The mandate or collection account is not eligible");
      });

      it("refuses to resume a test plan that holds live records", async () => {
        prepareResume(true);
        await expect(
          serviceFor("test").resumeByStaff(actor, "plan-a"),
        ).rejects.toThrow("The mandate or collection account is not eligible");
      });
    });
  });
});
