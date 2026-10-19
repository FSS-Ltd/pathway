import { FinanceBalanceService } from "../../finance-balance.service";
import { FinanceStripePaymentWebhookService } from "../finance-stripe-payment-webhook.service";

type FinanceWebhookTestTransaction = {
  $queryRaw: jest.Mock;
  financeCheckoutAttempt: {
    findFirst: jest.Mock;
    updateMany: jest.Mock;
  };
  financeInvoice: { findFirst: jest.Mock };
  financeStripeConnection: { findFirst: jest.Mock };
  financeReceipt: {
    findFirst: jest.Mock;
    create: jest.Mock;
  };
  financeReceiptAllocation: { create: jest.Mock };
};

let mockFinanceWebhookTransaction: FinanceWebhookTestTransaction;

jest.mock("@pathway/db", () => ({
  withTenantRlsContext: jest.fn(async (_tenantId, _orgId, callback) =>
    callback(mockFinanceWebhookTransaction),
  ),
}));

const scope = {
  eventId: "row-1",
  stripeEventId: "evt_finance_paid_1",
  tenantId: "tenant-a",
  orgId: "org-a",
  stripeAccountId: "acct_finance_school_1",
  eventType: "checkout.session.completed",
  livemode: false,
} as const;

function stripePayload(
  sessionOverrides: Record<string, unknown> = {},
  eventOverrides: Record<string, unknown> = {},
) {
  return {
    id: scope.stripeEventId,
    type: scope.eventType,
    created: Math.floor(Date.now() / 1_000),
    livemode: false,
    account: scope.stripeAccountId,
    ...eventOverrides,
    data: {
      object: {
        id: "cs_finance_payment_1",
        object: "checkout.session",
        client_reference_id: "attempt-1",
        amount_total: 5000,
        currency: "gbp",
        payment_intent: "pi_finance_payment_1",
        payment_status: "paid",
        status: "complete",
        metadata: {
          finance_checkout_attempt_id: "attempt-1",
          finance_invoice_id: "invoice-1",
        },
        ...sessionOverrides,
      },
    },
  };
}

function setup(outstandingMinor = "5000") {
  const attempt = {
    id: "attempt-1",
    financeProfileId: "profile-1",
    stripeConnectionId: "connection-1",
    invoiceId: "invoice-1",
    stripeAccountId: scope.stripeAccountId,
    livemode: false,
    amountMinor: 5000n,
    currency: "GBP",
    status: "OPEN",
    tenantId: scope.tenantId,
    orgId: scope.orgId,
    invoice: {
      id: "invoice-1",
      financeProfileId: "profile-1",
      payerAccountId: "payer-1",
      status: "ISSUED",
      currency: "GBP",
      totalMinor: 5000n,
    },
    stripeConnection: {
      stripeAccountId: scope.stripeAccountId,
      livemode: false,
    },
  };
  const tx: FinanceWebhookTestTransaction = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: "attempt-1" }]),
    financeCheckoutAttempt: {
      findFirst: jest.fn().mockResolvedValue(attempt),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    financeInvoice: { findFirst: jest.fn().mockResolvedValue(attempt.invoice) },
    financeStripeConnection: {
      findFirst: jest.fn().mockResolvedValue(attempt.stripeConnection),
    },
    financeReceipt: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: "receipt-1" }),
    },
    financeReceiptAllocation: {
      create: jest.fn().mockResolvedValue({ id: "allocation-1" }),
    },
  };
  mockFinanceWebhookTransaction = tx;
  const balances = {
    forInvoices: jest.fn().mockResolvedValue(
      new Map([
        [
          "invoice-1",
          {
            outstandingMinor,
            issuedGrossMinor: "5000",
            issuedCreditsMinor: "0",
            allocatedReceiptsMinor: "0",
            creditBalanceMinor: "0",
          },
        ],
      ]),
    ),
  } as unknown as FinanceBalanceService;
  return {
    tx,
    service: new FinanceStripePaymentWebhookService(balances),
  };
}

describe("FinanceStripePaymentWebhookService", () => {
  it("posts only provider-confirmed receipts and allocates no more than the current debt", async () => {
    const { tx, service } = setup("3200");

    await expect(
      service.process({ ...scope, payloadJson: stripePayload() }),
    ).resolves.toBe("processed");

    expect(tx.financeReceipt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        payerAccountId: "payer-1",
        amountMinor: 5000n,
        source: "STRIPE_CARD",
        sourceReference: "cs_finance_payment_1",
        status: "CONFIRMED",
      }),
      select: { id: true },
    });
    expect(tx.financeReceiptAllocation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        receiptId: "receipt-1",
        invoiceId: "invoice-1",
        amountMinor: 3200n,
        createdByUserId: null,
      }),
      select: { id: true },
    });
    expect(tx.financeCheckoutAttempt.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: {
          status: "PAID",
          stripePaymentIntentId: "pi_finance_payment_1",
        },
      }),
    );
  });

  it("requires a PaymentIntent before accepting a confirmed payment", async () => {
    const { tx, service } = setup();

    await expect(
      service.process({
        ...scope,
        payloadJson: stripePayload({ payment_intent: null }),
      }),
    ).rejects.toThrow(
      "Paid Finance Checkout event has no PaymentIntent identifier",
    );

    expect(tx.financeReceipt.create).not.toHaveBeenCalled();
    expect(tx.financeCheckoutAttempt.updateMany).not.toHaveBeenCalled();
  });

  it("keeps completed unpaid sessions reserved without creating a receipt", async () => {
    const { tx, service } = setup();
    const payload = stripePayload({ payment_status: "unpaid" });

    await expect(
      service.process({ ...scope, payloadJson: payload }),
    ).resolves.toBe("processed");

    expect(tx.financeReceipt.create).not.toHaveBeenCalled();
    expect(tx.financeReceiptAllocation.create).not.toHaveBeenCalled();
    expect(tx.financeCheckoutAttempt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "COMPLETED" } }),
    );
  });

  it("does not treat a no-payment-required session as a receipt", async () => {
    const { tx, service } = setup();
    const payload = stripePayload({ payment_status: "no_payment_required" });

    await expect(
      service.process({ ...scope, payloadJson: payload }),
    ).rejects.toThrow("did not collect a payment");

    expect(tx.financeReceipt.create).not.toHaveBeenCalled();
    expect(tx.financeReceiptAllocation.create).not.toHaveBeenCalled();
  });

  it.each([
    {
      eventType: "checkout.session.async_payment_failed",
      status: "complete",
      attemptStatus: "FAILED",
    },
    {
      eventType: "checkout.session.expired",
      status: "expired",
      attemptStatus: "EXPIRED",
    },
  ])("releases the checkout reservation after $eventType", async (testCase) => {
    const { tx, service } = setup();
    const eventType = testCase.eventType;
    const payload = stripePayload(
      { payment_status: "unpaid", status: testCase.status },
      { type: eventType },
    );

    await expect(
      service.process({ ...scope, eventType, payloadJson: payload }),
    ).resolves.toBe("processed");

    expect(tx.financeReceipt.create).not.toHaveBeenCalled();
    expect(tx.financeReceiptAllocation.create).not.toHaveBeenCalled();
    expect(tx.financeCheckoutAttempt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: testCase.attemptStatus } }),
    );
  });

  it("keeps excess confirmed funds unapplied when the invoice is already settled", async () => {
    const { tx, service } = setup("0");

    await service.process({ ...scope, payloadJson: stripePayload() });

    expect(tx.financeReceipt.create).toHaveBeenCalledTimes(1);
    expect(tx.financeReceiptAllocation.create).not.toHaveBeenCalled();
  });

  it("replays a duplicate payment event without creating a second receipt", async () => {
    const { tx, service } = setup();
    tx.financeReceipt.findFirst.mockResolvedValue({
      id: "receipt-existing",
      tenantId: scope.tenantId,
      orgId: scope.orgId,
      payerAccountId: "payer-1",
      amountMinor: 5000n,
      currency: "GBP",
      status: "CONFIRMED",
      confirmedAt: new Date(),
    });

    await service.process({ ...scope, payloadJson: stripePayload() });

    expect(tx.financeReceipt.create).not.toHaveBeenCalled();
    expect(tx.financeReceiptAllocation.create).not.toHaveBeenCalled();
    expect(tx.financeCheckoutAttempt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          status: "PAID",
          stripePaymentIntentId: "pi_finance_payment_1",
        },
      }),
    );
  });

  it("rejects mismatched account, amount, metadata, mode, and event identity", async () => {
    const cases: Array<{
      session?: Record<string, unknown>;
      event?: Record<string, unknown>;
    }> = [
      { event: { account: "acct_other_school" } },
      { session: { amount_total: 4999 } },
      {
        session: {
          metadata: {
            finance_checkout_attempt_id: "other",
            finance_invoice_id: "invoice-1",
          },
        },
      },
      { event: { livemode: true } },
      { event: { type: "checkout.session.expired" } },
    ];
    for (const testCase of cases) {
      const { tx, service } = setup();
      const payload = stripePayload(testCase.session, testCase.event);
      await expect(
        service.process({ ...scope, payloadJson: payload }),
      ).rejects.toThrow();
      expect(tx.financeReceipt.create).not.toHaveBeenCalled();
    }
  });
});
