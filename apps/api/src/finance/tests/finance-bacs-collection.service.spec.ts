import { UnprocessableEntityException } from "@nestjs/common";
import { runTransaction, withTenantRlsContext } from "@pathway/db";
import type { Prisma } from "@pathway/db";
import { lockInvoice } from "../finance-invoice-operations";
import { FinanceBacsCollectionService } from "../finance-bacs-collection.service";
import type { FinanceAccessService } from "../access/finance-access.service";
import type { FinanceBalanceService } from "../finance-balance.service";
import type { FinanceRecurringInvoiceService } from "../finance-recurring-invoice.service";
import {
  FinanceStripeBacsProviderError,
  type FinanceStripeBacsProvider,
} from "../stripe/finance-stripe-bacs.provider";
import type { FinanceStripeCheckoutConfig } from "../stripe/finance-stripe-checkout.config";

jest.mock("@pathway/db", () => ({
  Module: { FINANCE: "FINANCE" },
  runTransaction: jest.fn(),
  withTenantRlsContext: jest.fn(),
}));

jest.mock("../finance-invoice-operations", () => ({
  lockInvoice: jest.fn(),
}));

describe("FinanceBacsCollectionService", () => {
  const scope = { tenantId: "tenant-a", orgId: "org-a" };
  const installment = {
    id: "installment-1",
    amountMinor: 5_000n,
    status: "SUBMISSION_PENDING",
    plan: {
      id: "plan-1",
      status: "ACTIVE",
      financeProfileId: "profile-1",
      stripeConnectionId: "connection-1",
      payerAccountId: "payer-1",
      invoiceId: "invoice-1",
      mandateId: "mandate-1",
      amountMinor: 5_000n,
      currency: "GBP",
      consentVersion: "finance-bacs-collection-2026-01",
      acceptedByUserId: "payer-user-1",
      stripeConnection: {
        id: "connection-1",
        financeProfileId: "profile-1",
        stripeAccountId: "acct_school_test",
        livemode: false,
        status: "READY",
      },
      financeProfile: { countryCode: "GB", currency: "GBP" },
      invoice: {
        id: "invoice-1",
        financeProfileId: "profile-1",
        payerAccountId: "payer-1",
        status: "ISSUED",
        currency: "GBP",
        totalMinor: 5_000n,
      },
      mandate: {
        status: "ACTIVE",
        stripeConnectionId: "connection-1",
        stripeAccountId: "acct_school_test",
        livemode: false,
        consentVersion: "finance-bacs-mandate-2026-01",
        stripePaymentMethodId: "pm_school_bacs",
        stripeCustomer: {
          stripeCustomerId: "cus_school_payer",
          stripeAccountId: "acct_school_test",
          stripeConnectionId: "connection-1",
          payerAccountId: "payer-1",
          livemode: false,
        },
      },
    },
  };

  let tx: {
    $queryRaw: jest.Mock;
    orgModule: { findUnique: jest.Mock };
    financeCollectionInstalment: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      updateMany: jest.Mock;
    };
    financeDebitAttempt: {
      create: jest.Mock;
      findFirst: jest.Mock;
      updateMany: jest.Mock;
    };
    financeCollectionPlan: { updateMany: jest.Mock };
    financeCollectionPlanEvent: { create: jest.Mock };
  };
  let service: FinanceBacsCollectionService;
  let provider: { createDebit: jest.Mock };
  let debitAttempt: {
    id: string;
    status: "CREATING" | "UNKNOWN";
    stripePaymentIntentId: null;
    idempotencyKey: string;
    createdAt: Date;
  };

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date("2026-10-21T12:00:00Z") });
    jest.clearAllMocks();
    debitAttempt = {
      id: "attempt-1",
      status: "CREATING",
      stripePaymentIntentId: null,
      idempotencyKey: "finance-bacs-debit-attempt-1",
      createdAt: new Date("2026-10-21T11:55:00Z"),
    };
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: "row-1" }]),
      orgModule: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ status: "ACTIVE", expiresAt: null }),
      },
      financeCollectionInstalment: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            plan: {
              id: "plan-1",
              invoiceId: "invoice-1",
              payerAccountId: "payer-1",
              acceptedByUserId: "payer-user-1",
            },
          })
          .mockResolvedValue(installment),
        findMany: jest
          .fn()
          .mockImplementation((args: { where?: { planId?: string } }) =>
            args.where?.planId
              ? Promise.resolve([
                  {
                    id: "installment-1",
                    sequence: 1,
                    amountMinor: 5_000n,
                    status: "SUBMISSION_PENDING",
                  },
                ])
              : Promise.resolve([{ id: "installment-1" }]),
          ),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      financeDebitAttempt: {
        create: jest.fn(),
        findFirst: jest
          .fn()
          .mockImplementation(() => Promise.resolve({ ...debitAttempt })),
        updateMany: jest.fn().mockImplementation(() => {
          if (provider.createDebit.mock.calls.length === 1) {
            debitAttempt.status = "UNKNOWN";
          }
          return Promise.resolve({ count: 1 });
        }),
      },
      financeCollectionPlan: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      financeCollectionPlanEvent: { create: jest.fn() },
    };
    jest.mocked(runTransaction).mockImplementation(async (callback) =>
      callback({
        $queryRaw: jest.fn().mockResolvedValue([scope]),
      } as unknown as Prisma.TransactionClient),
    );
    jest
      .mocked(withTenantRlsContext)
      .mockImplementation(async (_tenantId, _orgId, callback) =>
        callback(tx as unknown as Prisma.TransactionClient),
      );
    const financeAccess = {
      resolveMode: jest.fn().mockResolvedValue("ACTIVE"),
    };
    const balances = {
      forInvoices: jest
        .fn()
        .mockResolvedValue(
          new Map([["invoice-1", { outstandingMinor: "5000" }]]),
        ),
    };
    const recurringInvoices = {
      generateDueForScope: jest
        .fn()
        .mockResolvedValue({ generated: 0, invoiceIds: [] }),
    };
    provider = {
      createDebit: jest
        .fn()
        .mockRejectedValueOnce(new FinanceStripeBacsProviderError(true))
        .mockResolvedValue({ id: "pi_school_bacs", status: "processing" }),
    };
    service = new FinanceBacsCollectionService(
      financeAccess as unknown as FinanceAccessService,
      balances as unknown as FinanceBalanceService,
      recurringInvoices as unknown as FinanceRecurringInvoiceService,
      { mode: "test" } as unknown as FinanceStripeCheckoutConfig,
      provider as unknown as FinanceStripeBacsProvider,
    );
  });

  afterEach(() => jest.useRealTimers());

  it.each([23, 24, 26])(
    "pauses an unknown debit after %s hours without reusing an expired provider key",
    async (hours) => {
      debitAttempt.createdAt = new Date(Date.now() - hours * 60 * 60_000);
      debitAttempt.status = "UNKNOWN";
      await service.runDue(new Date("2026-10-21T12:00:00Z"));
      expect(provider.createDebit).not.toHaveBeenCalled();
      expect(tx.financeDebitAttempt.create).not.toHaveBeenCalled();
      expect(tx.financeCollectionPlan.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: "PAUSED" } }),
      );
      expect(tx.financeCollectionPlanEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "REVIEW_REQUIRED",
            details: { reason: "UNKNOWN_DEBIT_REQUIRES_RECONCILIATION" },
          }),
        }),
      );
    },
  );

  it("uses wall-clock retention even when a job is run for a historical schedule date", async () => {
    debitAttempt.createdAt = new Date(Date.now() - 26 * 60 * 60_000);
    await service.runDue(new Date("2026-10-20T12:00:00Z"));
    expect(provider.createDebit).not.toHaveBeenCalled();
  });

  it("marks a permanent amount rejection failed and pauses the plan instead of retaining an unknown retry", async () => {
    provider.createDebit.mockReset().mockRejectedValue(
      new UnprocessableEntityException({
        code: "FINANCE_COLLECTION_AMOUNT_UNSUPPORTED",
        message: "Bacs amount unsupported",
      }),
    );
    await expect(
      service.runDue(new Date("2026-10-21T12:00:00.000Z")),
    ).resolves.toMatchObject({ debitsFailed: 1, debitsPending: 0 });
    expect(tx.financeDebitAttempt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
    expect(tx.financeCollectionInstalment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "FAILED" } }),
    );
    expect(tx.financeCollectionPlan.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "PAUSED" } }),
    );
    expect(tx.financeCollectionPlanEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "DEBIT_FAILED",
          details: { reason: "PROVIDER_REQUEST_FAILED" },
        }),
      }),
    );
  });

  it("retries a timed-out debit with its original idempotency key", async () => {
    await expect(
      service.runDue(new Date("2026-10-21T12:00:00.000Z")),
    ).resolves.toMatchObject({
      scopes: 1,
      debitsSubmitted: 0,
      debitsPending: 1,
    });

    await expect(
      service.runDue(new Date("2026-10-21T12:00:00.000Z")),
    ).resolves.toMatchObject({
      scopes: 1,
      debitsSubmitted: 1,
      debitsPending: 0,
    });

    expect(provider.createDebit).toHaveBeenCalledTimes(2);
    expect(provider.createDebit.mock.calls[0][0]).toMatchObject({
      stripeAccountId: "acct_school_test",
      amountMinor: 5_000n,
      idempotencyKey: debitAttempt.idempotencyKey,
    });
    expect(provider.createDebit.mock.calls[1][0].idempotencyKey).toBe(
      provider.createDebit.mock.calls[0][0].idempotencyKey,
    );
    expect(tx.financeDebitAttempt.create).not.toHaveBeenCalled();
    expect(lockInvoice).toHaveBeenCalled();
  });
});
