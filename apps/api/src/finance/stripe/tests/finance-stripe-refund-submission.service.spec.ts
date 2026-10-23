import { FinanceStripeRefundSubmissionService } from "../finance-stripe-refund-submission.service";
import {
  FinanceStripeRefundProviderError,
  FinanceStripeRefundUnknownOutcomeError,
  type FinanceStripeRefundProvider,
} from "../finance-stripe-refund.provider";

interface MockRefund {
  id: string;
  receiptId: string;
  financeProfileId: string;
  source: "STRIPE_CARD";
  status: "APPROVED" | "FAILED" | "PENDING";
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
  providerAttemptStartedAt: Date | null;
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
  financeRefund: { findFirst: jest.Mock; updateMany: jest.Mock };
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

const now = new Date("2026-10-23T12:00:00Z");
const actor = { tenantId: "tenant-1", orgId: "org-1", userId: "approver-1" };

describe("FinanceStripeRefundSubmissionService", () => {
  let refund: MockRefund;
  let provider: FinanceStripeRefundProvider;
  let createRefund: jest.MockedFunction<
    FinanceStripeRefundProvider["createRefund"]
  >;
  let service: FinanceStripeRefundSubmissionService;

  beforeEach(() => {
    jest.useFakeTimers({ now });
    refund = {
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
      createdAt: new Date("2026-10-19T11:00:00Z"),
      approvedAt: new Date("2026-10-19T11:30:00Z"),
      providerAttemptStartedAt: null,
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
        updateMany: jest
          .fn()
          .mockImplementation(
            async ({ data }: { data: Partial<MockRefund> }) => {
              Object.assign(refund, data);
              return { count: 1 };
            },
          ),
      },
      financeRefundEvent: {
        create: jest
          .fn()
          .mockImplementation(
            async ({ data }: { data: MockRefund["events"][number] }) => {
              const event = { ...data, createdAt: now };
              refund.events.push(event);
              return event;
            },
          ),
      },
      financeReceipt: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ sourceReference: "cs_test_1" }),
      },
      financeCheckoutAttempt: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ stripePaymentIntentId: "pi_test_1" }),
      },
      financeReceiptMovement: { findFirst: jest.fn(), create: jest.fn() },
    };
    createRefund = jest
      .fn<
        ReturnType<FinanceStripeRefundProvider["createRefund"]>,
        Parameters<FinanceStripeRefundProvider["createRefund"]>
      >()
      .mockRejectedValue(new FinanceStripeRefundProviderError(false));
    provider = { retrieveChargePaymentIntent: jest.fn(), createRefund };
    service = new FinanceStripeRefundSubmissionService(provider);
  });

  afterEach(() => jest.useRealTimers());

  it("records a permanent provider rejection as a failed refund", async () => {
    const result = await service.submit(actor, refund.id);
    expect(result.status).toBe("FAILED");
    expect(refund.failedAt).toBeInstanceOf(Date);
    expect(refund.events).toHaveLength(1);
    expect(refund.events[0]?.type).toBe("FAILED");
  });

  it("persists the first-attempt time before calling Stripe and permits a first submission", async () => {
    createRefund.mockImplementation(async (input) => {
      expect(refund.providerAttemptStartedAt).toEqual(now);
      expect(input.creationPermitted).toBe(true);
      throw new FinanceStripeRefundProviderError(true);
    });
    await expect(service.submit(actor, refund.id)).rejects.toThrow("approved");
    expect(refund.submittedAt).toBeNull();
    expect(refund.status).toBe("APPROVED");
  });

  it.each([23, 24, 26])(
    "only permits read-only recovery after an unknown outcome at %s hours",
    async (hours) => {
      const startedAt = new Date(now.getTime() - hours * 60 * 60_000);
      refund.providerAttemptStartedAt = startedAt;
      createRefund.mockRejectedValue(
        new FinanceStripeRefundUnknownOutcomeError(),
      );
      await expect(service.submit(actor, refund.id)).rejects.toThrow(
        "No new refund was sent",
      );
      expect(createRefund).toHaveBeenCalledWith(
        expect.objectContaining({ creationPermitted: false }),
      );
      expect(refund.providerAttemptStartedAt).toBe(startedAt);
      expect(mockTransaction.financeRefund.updateMany).not.toHaveBeenCalled();
      expect(
        mockTransaction.financeReceiptMovement.create,
      ).not.toHaveBeenCalled();
      expect(refund.status).toBe("APPROVED");
    },
  );

  it("retains the original time and key for a recent retry", async () => {
    refund.providerAttemptStartedAt = new Date(now.getTime() - 60_000);
    createRefund.mockRejectedValue(new FinanceStripeRefundProviderError(true));
    await expect(service.submit(actor, refund.id)).rejects.toThrow("approved");
    expect(createRefund).toHaveBeenCalledWith(
      expect.objectContaining({ refundId: refund.id, creationPermitted: true }),
    );
    expect(mockTransaction.financeRefund.updateMany).not.toHaveBeenCalled();
  });

  it("does not start an unapproved refund", async () => {
    refund.status = "PENDING";
    await expect(service.submit(actor, refund.id)).rejects.toThrow(
      "not approved",
    );
    expect(createRefund).not.toHaveBeenCalled();
    expect(mockTransaction.financeRefund.updateMany).not.toHaveBeenCalled();
  });

  it("does not overwrite a same-second terminal webhook status", async () => {
    const providerCreatedAt = new Date("2026-10-19T12:00:00Z");
    createRefund.mockImplementation(async () => {
      refund.status = "FAILED";
      refund.providerStatusAt = providerCreatedAt;
      return {
        id: "re_test_1",
        amountMinor: 500n,
        currency: "GBP",
        status: "succeeded",
        createdAt: providerCreatedAt,
      };
    });
    const result = await service.submit(actor, refund.id);
    expect(result.status).toBe("FAILED");
    expect(mockTransaction.financeRefund.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: expect.any(String) }),
      }),
    );
    expect(
      mockTransaction.financeReceiptMovement.create,
    ).not.toHaveBeenCalled();
  });
});
