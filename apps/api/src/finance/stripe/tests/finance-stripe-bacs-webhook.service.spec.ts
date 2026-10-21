import type { FinanceBalanceService } from "../../finance-balance.service";
import { FinanceStripeBacsWebhookService } from "../finance-stripe-bacs-webhook.service";
import type { FinanceStripeBacsWebhookInput } from "../finance-stripe-bacs-webhook.contracts";

let mockTransaction: Record<string, unknown>;

jest.mock("@pathway/db", () => ({
  withTenantRlsContext: jest.fn(
    async (
      _tenantId: string,
      _orgId: string,
      callback: (client: unknown) => Promise<unknown>,
    ) => callback(mockTransaction),
  ),
}));

jest.mock("../../finance-invoice-operations", () => ({
  lockInvoice: jest.fn(),
}));

const scope = {
  tenantId: "tenant-a",
  orgId: "org-a",
  stripeAccountId: "acct_school_test",
  livemode: false,
};

function makeInput(
  eventType: "payment_intent.processing" | "payment_intent.succeeded",
): FinanceStripeBacsWebhookInput {
  const status =
    eventType === "payment_intent.succeeded" ? "succeeded" : "processing";
  const stripeEventId = `evt_${status}_bacs_1`;
  return {
    ...scope,
    stripeEventId,
    eventType,
    payloadJson: {
      id: stripeEventId,
      type: eventType,
      created: 1_800_000_000,
      livemode: false,
      account: scope.stripeAccountId,
      data: {
        object: {
          id: "pi_school_bacs",
          object: "payment_intent",
          status,
          amount: 5_000,
          currency: "gbp",
          customer: "cus_school_payer",
          payment_method: "pm_school_bacs",
          metadata: {
            finance_debit_attempt_id: "attempt-1",
            finance_instalment_id: "installment-1",
          },
        },
      },
    } as never,
  };
}

describe("FinanceStripeBacsWebhookService", () => {
  let initialAttempt: object;
  let selectedAttempt: object;
  let tx: {
    $queryRaw: jest.Mock;
    financeDebitAttempt: { findFirst: jest.Mock; update: jest.Mock };
    financeCollectionInstalment: {
      update: jest.Mock;
      updateMany: jest.Mock;
      count: jest.Mock;
    };
    financeCollectionPlan: { update: jest.Mock; updateMany: jest.Mock };
    financeCollectionPlanEvent: { findFirst: jest.Mock; create: jest.Mock };
    financeReceipt: { findFirst: jest.Mock; create: jest.Mock };
    financeReceiptAllocation: { create: jest.Mock };
  };
  let balances: { forInvoices: jest.Mock };
  let service: FinanceStripeBacsWebhookService;

  beforeEach(() => {
    jest.clearAllMocks();
    const invoice = {
      id: "invoice-1",
      financeProfileId: "profile-1",
      payerAccountId: "payer-1",
      status: "ISSUED",
      currency: "GBP",
      totalMinor: 5_000n,
    };
    initialAttempt = {
      id: "attempt-1",
      instalment: { plan: { id: "plan-1", invoiceId: "invoice-1" } },
    };
    selectedAttempt = {
      id: "attempt-1",
      instalmentId: "installment-1",
      stripeConnectionId: "connection-1",
      stripeAccountId: scope.stripeAccountId,
      amountMinor: 5_000n,
      currency: "GBP",
      status: "SUBMITTED",
      stripePaymentIntentId: null,
      submittedAt: new Date("2026-10-21T12:00:00.000Z"),
      providerStatusAt: null,
      stripeConnection: {
        stripeAccountId: scope.stripeAccountId,
        livemode: false,
        financeProfileId: "profile-1",
      },
      instalment: {
        id: "installment-1",
        amountMinor: 5_000n,
        planId: "plan-1",
        status: "SUBMISSION_PENDING",
        plan: {
          id: "plan-1",
          status: "ACTIVE",
          financeProfileId: "profile-1",
          stripeConnectionId: "connection-1",
          payerAccountId: "payer-1",
          invoiceId: "invoice-1",
          mandateId: "mandate-1",
          currency: "GBP",
          consentVersion: "finance-bacs-collection-2026-01",
          mandate: {
            status: "ACTIVE",
            stripeConnectionId: "connection-1",
            livemode: false,
            stripeAccountId: scope.stripeAccountId,
            stripeMandateId: "mandate_school_bacs",
            stripePaymentMethodId: "pm_school_bacs",
            stripeCustomer: {
              stripeCustomerId: "cus_school_payer",
              stripeAccountId: scope.stripeAccountId,
              stripeConnectionId: "connection-1",
              payerAccountId: "payer-1",
              livemode: false,
            },
          },
          invoice,
        },
      },
    };

    tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: "row-1" }]),
      financeDebitAttempt: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(initialAttempt)
          .mockResolvedValue(selectedAttempt),
        update: jest.fn().mockResolvedValue(undefined),
      },
      financeCollectionInstalment: {
        update: jest.fn().mockResolvedValue(undefined),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(0),
      },
      financeCollectionPlan: {
        update: jest.fn().mockResolvedValue(undefined),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      financeCollectionPlanEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "plan-event-1" }),
      },
      financeReceipt: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "receipt-1" }),
      },
      financeReceiptAllocation: {
        create: jest.fn().mockResolvedValue({ id: "allocation-1" }),
      },
    };
    mockTransaction = tx;
    balances = {
      forInvoices: jest
        .fn()
        .mockResolvedValue(
          new Map([["invoice-1", { outstandingMinor: "5000" }]]),
        ),
    };
    service = new FinanceStripeBacsWebhookService(
      {} as never,
      balances as unknown as FinanceBalanceService,
      {} as never,
    );
  });

  it("keeps processing funds separate and posts only a signed success as a receipt", async () => {
    await expect(
      service.process(makeInput("payment_intent.processing")),
    ).resolves.toBe("processed");
    expect(tx.financeReceipt.create).not.toHaveBeenCalled();

    tx.financeDebitAttempt.findFirst
      .mockReset()
      .mockResolvedValueOnce(initialAttempt)
      .mockResolvedValue(selectedAttempt);

    await expect(
      service.process(makeInput("payment_intent.succeeded")),
    ).resolves.toBe("processed");
    expect(tx.financeReceipt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        source: "STRIPE_BACS",
        sourceReference: "pi_school_bacs",
        status: "CONFIRMED",
        amountMinor: 5_000n,
      }),
      select: { id: true },
    });
    expect(tx.financeReceiptAllocation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amountMinor: 5_000n }),
      select: { id: true },
    });
  });
});
