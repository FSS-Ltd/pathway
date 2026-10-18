import {
  ForbiddenException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Prisma } from "@pathway/db";
import type { FinanceAccessService } from "../../access/finance-access.service";
import type { FinanceBalanceService } from "../../finance-balance.service";
import {
  FinanceStripeCheckoutProviderError,
  type FinanceStripeCheckoutProvider,
} from "../finance-stripe-checkout.provider";
import type { FinanceStripeCheckoutConfig } from "../finance-stripe-checkout.config";

const mockWithTenantRlsContext = jest.fn();

jest.mock("@pathway/db", () => ({
  withTenantRlsContext: mockWithTenantRlsContext,
}));

import { FinanceStripeCheckoutAttemptService } from "../finance-stripe-checkout-attempt.service";
import { FinanceStripeCheckoutService } from "../finance-stripe-checkout.service";

describe("FinanceStripeCheckoutService", () => {
  const actor = {
    tenantId: "tenant-a",
    orgId: "org-a",
    userId: "payer-a",
  };
  const config: FinanceStripeCheckoutConfig = {
    mode: "test",
    secretKey: "sk_test_finance_fixture",
    webAppUrl: "https://family.example.test",
  };
  const mockAssertPayerAction = jest.fn();
  const mockCreateSession = jest.fn();
  const mockExpireSession = jest.fn();
  const mockRetrieveSession = jest.fn();
  const mockInvoiceFindFirst = jest.fn();
  const mockPayerGrantFindFirst = jest.fn();
  const mockConnectionFindFirst = jest.fn();
  const mockCheckoutAttemptFindFirst = jest.fn();
  const mockCheckoutAttemptCreate = jest.fn();
  const mockCheckoutAttemptUpdateMany = jest.fn();
  const mockQueryRaw = jest.fn();
  const mockBalanceForInvoices = jest.fn();
  let attemptState: Record<string, unknown> | null;

  const financeAccess = {
    assertPayerAction: mockAssertPayerAction,
  } as unknown as FinanceAccessService;
  const attempts = new FinanceStripeCheckoutAttemptService(
    financeAccess,
    { forInvoices: mockBalanceForInvoices } as unknown as FinanceBalanceService,
    config,
  );
  const service = new FinanceStripeCheckoutService(
    financeAccess,
    attempts,
    config,
    {
      createSession: mockCreateSession,
      expireSession: mockExpireSession,
      retrieveSession: mockRetrieveSession,
    } as unknown as FinanceStripeCheckoutProvider,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    attemptState = null;
    mockWithTenantRlsContext.mockImplementation(
      async (
        _tenantId: string,
        _orgId: string,
        callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
      ) =>
        callback({
          $queryRaw: mockQueryRaw,
          financeInvoice: { findFirst: mockInvoiceFindFirst },
          financePayerGrant: { findFirst: mockPayerGrantFindFirst },
          financeStripeConnection: { findFirst: mockConnectionFindFirst },
          financeCheckoutAttempt: {
            findFirst: mockCheckoutAttemptFindFirst,
            create: mockCheckoutAttemptCreate,
            updateMany: mockCheckoutAttemptUpdateMany,
          },
        } as unknown as Prisma.TransactionClient),
    );
    mockAssertPayerAction.mockResolvedValue(undefined);
    mockQueryRaw.mockResolvedValue([{ id: "grant-a" }]);
    mockInvoiceFindFirst.mockResolvedValue({
      id: "invoice-a",
      financeProfileId: "profile-a",
      invoiceNumber: 1001n,
      status: "ISSUED",
      totalMinor: 12500n,
    });
    mockPayerGrantFindFirst.mockResolvedValue({ id: "grant-a" });
    mockConnectionFindFirst.mockResolvedValue({
      id: "connection-a",
      stripeAccountId: "acct_school_test",
      livemode: false,
    });
    mockBalanceForInvoices.mockResolvedValue(
      new Map([["invoice-a", { outstandingMinor: "12500" }]]),
    );
    mockCheckoutAttemptFindFirst.mockImplementation(
      ({
        select,
        where,
      }: {
        select: Record<string, unknown>;
        where?: { status?: { in?: string[] } };
      }) => {
        if (select.payerGrant) {
          return {
            payerGrant: { financePayerAccountId: "payer-account-a" },
          };
        }
        if (select.stripeConnectionId) {
          const allowedStatuses = where?.status?.in;
          if (
            !attemptState ||
            (allowedStatuses &&
              !allowedStatuses.includes(String(attemptState.status)))
          ) {
            return null;
          }
          return attemptState;
        }
        if (select.checkoutUrl) {
          return attemptState
            ? {
                id: attemptState.id,
                status: attemptState.status,
                checkoutUrl: attemptState.checkoutUrl,
                expiresAt: attemptState.expiresAt,
              }
            : null;
        }
        return attemptState;
      },
    );
    mockCheckoutAttemptCreate.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => {
        attemptState = {
          ...data,
          status: "CREATING",
          createdAt: new Date(),
          stripeCheckoutSessionId: null,
          checkoutUrl: null,
          expiresAt: null,
          invoiceNumber: 1001n,
        };
        return attemptState;
      },
    );
    mockCheckoutAttemptUpdateMany.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => {
        if (attemptState) attemptState = { ...attemptState, ...data };
        return { count: 1 };
      },
    );
  });

  it("creates one connected-account session for the server-calculated outstanding balance", async () => {
    mockCreateSession.mockResolvedValue({
      id: "cs_test_finance_1",
      url: "https://checkout.stripe.com/c/pay/cs_test_finance_1",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    await expect(
      service.startCheckout(actor, "payer-account-a", "invoice-a"),
    ).resolves.toMatchObject({
      status: "OPEN",
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_finance_1",
    });
    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeAccountId: "acct_school_test",
        invoiceId: "invoice-a",
        amountMinor: 12500n,
      }),
    );
    expect(mockCheckoutAttemptCreate).toHaveBeenCalledTimes(1);
  });

  it("returns the existing open session instead of creating another attempt", async () => {
    attemptState = {
      id: "attempt-existing",
      financeProfileId: "profile-a",
      stripeConnectionId: "connection-a",
      stripeAccountId: "acct_school_test",
      invoiceId: "invoice-a",
      amountMinor: 12500n,
      idempotencyKey: "finance-checkout-attempt-existing",
      integrationIdentifier: "nexsteps-finance-abcdefgh",
      stripeCheckoutSessionId: "cs_test_finance_existing",
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_finance_existing",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      createdAt: new Date(),
      status: "OPEN",
    };

    await expect(
      service.startCheckout(actor, "payer-account-a", "invoice-a"),
    ).resolves.toMatchObject({
      attemptId: "attempt-existing",
      status: "OPEN",
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_finance_existing",
    });
    expect(mockCheckoutAttemptCreate).not.toHaveBeenCalled();
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it("expires an open session when the invoice balance has changed", async () => {
    attemptState = {
      id: "attempt-existing",
      financeProfileId: "profile-a",
      stripeConnectionId: "connection-a",
      stripeAccountId: "acct_school_test",
      payerGrantId: "grant-a",
      invoiceId: "invoice-a",
      amountMinor: 9000n,
      idempotencyKey: "finance-checkout-attempt-existing",
      integrationIdentifier: "nexsteps-finance-abcdefgh",
      stripeCheckoutSessionId: "cs_test_finance_existing",
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_finance_existing",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      createdAt: new Date(),
      status: "OPEN",
    };
    mockRetrieveSession.mockResolvedValue({
      status: "open",
      paymentStatus: "unpaid",
    });
    mockExpireSession.mockResolvedValue(undefined);
    mockCreateSession.mockResolvedValue({
      id: "cs_test_finance_replacement",
      url: "https://checkout.stripe.com/c/pay/cs_test_finance_replacement",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    await expect(
      service.startCheckout(actor, "payer-account-a", "invoice-a"),
    ).resolves.toMatchObject({
      status: "OPEN",
      checkoutUrl:
        "https://checkout.stripe.com/c/pay/cs_test_finance_replacement",
    });

    expect(mockExpireSession).toHaveBeenCalledWith({
      stripeAccountId: "acct_school_test",
      sessionId: "cs_test_finance_existing",
      idempotencyKey: "finance-checkout-expire-attempt-existing",
    });
    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({ amountMinor: 12500n }),
    );
  });

  it("retries a provider timeout with the same durable Stripe idempotency key", async () => {
    mockCreateSession
      .mockRejectedValueOnce(new FinanceStripeCheckoutProviderError(true))
      .mockResolvedValueOnce({
        id: "cs_test_finance_1",
        url: "https://checkout.stripe.com/c/pay/cs_test_finance_1",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

    await expect(
      service.startCheckout(actor, "payer-account-a", "invoice-a"),
    ).rejects.toThrow(ServiceUnavailableException);
    await expect(
      service.startCheckout(actor, "payer-account-a", "invoice-a"),
    ).resolves.toMatchObject({ status: "OPEN" });

    expect(mockCheckoutAttemptCreate).toHaveBeenCalledTimes(1);
    expect(mockCreateSession).toHaveBeenCalledTimes(2);
    expect(mockCreateSession.mock.calls[0][0].idempotencyKey).toBe(
      mockCreateSession.mock.calls[1][0].idempotencyKey,
    );
  });

  it("blocks checkout when the explicit payer grant has been revoked", async () => {
    mockAssertPayerAction.mockRejectedValueOnce(
      new ForbiddenException("Finance access unavailable"),
    );
    await expect(
      service.startCheckout(actor, "payer-account-a", "invoice-a"),
    ).rejects.toThrow(ForbiddenException);
    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(mockCheckoutAttemptCreate).not.toHaveBeenCalled();
  });
});
