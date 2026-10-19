import { FinanceStripeRefundSubmissionService } from "../finance-stripe-refund-submission.service";
import {
  FinanceStripeRefundProviderError,
  type FinanceStripeRefundProvider,
} from "../finance-stripe-refund.provider";

interface MockRefund {
  id: string;
  receiptId: string;
  financeProfileId: string;
  source: "STRIPE_CARD";
  status: "APPROVED" | "FAILED";
  amountMinor: bigint;
  currency: "GBP";
  reason: string;
  decisionReason: string | null;
  bankTransactionReference: string | null;
  stripeAccountId: string;
  stripeRefundId: string | null;
  requestedByUserId: string;
  approvedByUserId: string | null;
  createdAt: Date;
  approvedAt: Date | null;
  submittedAt: Date | null;
  providerStatusAt: Date | null;
  confirmedAt: Date | null;
  failedAt: Date | null;
  returnedAt: Date | null;
  events: Array<{
    type: "FAILED";
    reason: string | null;
    actorUserId: string | null;
    createdAt: Date;
  }>;
}

let mockTransaction: {
  $queryRaw: jest.Mock;
  financeRefund: {
    findFirst: jest.Mock;
    updateMany: jest.Mock;
  };
  financeRefundEvent: { create: jest.Mock };
  financeReceipt: { findFirst: jest.Mock };
  financeCheckoutAttempt: { findFirst: jest.Mock };
  financeReceiptMovement: { findFirst: jest.Mock; create: jest.Mock };
};

jest.mock("@pathway/db", () => ({
  withTenantRlsContext: jest.fn(
    async (
      _tenantId: string,
      _orgId: string,
      callback: (tx: unknown) => unknown,
    ) => callback(mockTransaction),
  ),
}));

describe("FinanceStripeRefundSubmissionService", () => {
  it("records a permanent provider rejection as a failed refund", async () => {
    const failedAt = new Date("2026-10-19T12:00:00.000Z");
    const refund: MockRefund = {
      id: "refund-1",
      receiptId: "receipt-1",
      financeProfileId: "profile-1",
      source: "STRIPE_CARD",
      status: "APPROVED",
      amountMinor: 500n,
      currency: "GBP",
      reason: "Duplicate payment",
      decisionReason: "Approved independently",
      bankTransactionReference: null,
      stripeAccountId: "acct_school_1",
      stripeRefundId: null,
      requestedByUserId: "requester-1",
      approvedByUserId: "approver-1",
      createdAt: new Date("2026-10-19T11:00:00.000Z"),
      approvedAt: new Date("2026-10-19T11:30:00.000Z"),
      submittedAt: null,
      providerStatusAt: null,
      confirmedAt: null,
      failedAt: null,
      returnedAt: null,
      events: [],
    };
    mockTransaction = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      financeRefund: {
        findFirst: jest.fn().mockImplementation(async () => ({ ...refund })),
        updateMany: jest.fn().mockImplementation(async (input) => {
          Object.assign(refund, input.data);
          return { count: 1 };
        }),
      },
      financeRefundEvent: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          const event = { ...data, createdAt: failedAt };
          refund.events.push(event);
          return event;
        }),
      },
      financeReceipt: {
        findFirst: jest.fn().mockResolvedValue({
          sourceReference: "cs_test_1",
        }),
      },
      financeCheckoutAttempt: {
        findFirst: jest.fn().mockResolvedValue({
          stripePaymentIntentId: "pi_test_1",
        }),
      },
      financeReceiptMovement: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    };
    const provider: FinanceStripeRefundProvider = {
      retrieveChargePaymentIntent: jest.fn(),
      createRefund: jest
        .fn()
        .mockRejectedValue(new FinanceStripeRefundProviderError(false)),
    };
    const service = new FinanceStripeRefundSubmissionService(provider);

    const result = await service.submit(
      { tenantId: "tenant-1", orgId: "org-1", userId: "approver-1" },
      refund.id,
    );

    expect(result.status).toBe("FAILED");
    expect(refund.failedAt).toBeInstanceOf(Date);
    expect(refund.events).toHaveLength(1);
    expect(refund.events[0]?.type).toBe("FAILED");
  });

  it("does not overwrite a same-second terminal webhook status", async () => {
    const providerCreatedAt = new Date("2026-10-19T12:00:00.000Z");
    const refund: MockRefund = {
      id: "refund-2",
      receiptId: "receipt-2",
      financeProfileId: "profile-1",
      source: "STRIPE_CARD",
      status: "APPROVED",
      amountMinor: 500n,
      currency: "GBP",
      reason: "Duplicate payment",
      decisionReason: "Approved independently",
      bankTransactionReference: null,
      stripeAccountId: "acct_school_1",
      stripeRefundId: null,
      requestedByUserId: "requester-1",
      approvedByUserId: "approver-1",
      createdAt: new Date("2026-10-19T11:00:00.000Z"),
      approvedAt: new Date("2026-10-19T11:30:00.000Z"),
      submittedAt: null,
      providerStatusAt: null,
      confirmedAt: null,
      failedAt: null,
      returnedAt: null,
      events: [],
    };
    mockTransaction = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      financeRefund: {
        findFirst: jest.fn().mockImplementation(async () => ({ ...refund })),
        updateMany: jest.fn().mockImplementation(async ({ data }) => {
          Object.assign(refund, data);
          return { count: 1 };
        }),
      },
      financeRefundEvent: { create: jest.fn() },
      financeReceipt: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ sourceReference: "cs_test_2" }),
      },
      financeCheckoutAttempt: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ stripePaymentIntentId: "pi_test_2" }),
      },
      financeReceiptMovement: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    };
    const provider: FinanceStripeRefundProvider = {
      retrieveChargePaymentIntent: jest.fn(),
      createRefund: jest.fn().mockImplementation(async () => {
        refund.status = "FAILED";
        refund.providerStatusAt = providerCreatedAt;
        return {
          id: "re_test_2",
          amountMinor: 500n,
          currency: "GBP",
          status: "succeeded",
          createdAt: providerCreatedAt,
        };
      }),
    };
    const service = new FinanceStripeRefundSubmissionService(provider);

    const result = await service.submit(
      { tenantId: "tenant-1", orgId: "org-1", userId: "approver-1" },
      refund.id,
    );

    expect(result.status).toBe("FAILED");
    expect(mockTransaction.financeRefund.updateMany).not.toHaveBeenCalled();
    expect(
      mockTransaction.financeReceiptMovement.create,
    ).not.toHaveBeenCalled();
  });
});
