import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Prisma } from "@pathway/db";

const mockPayerAccountFindFirst = jest.fn();
const mockGrantFindFirst = jest.fn();
const mockGrantCreate = jest.fn();
const mockGrantUpdateMany = jest.fn();
const mockCheckoutAttemptsFindMany = jest.fn();
const mockCheckoutAttemptsUpdateMany = jest.fn();
const mockCheckoutAttemptsCount = jest.fn();
const mockQueryRaw = jest.fn();
const mockRetrieveSession = jest.fn();
const mockExpireSession = jest.fn();
const mockWithTenantRlsContext = jest.fn();
const mockKnownRequestErrorClass = class extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
};

jest.mock("@pathway/db", () => ({
  Prisma: { PrismaClientKnownRequestError: mockKnownRequestErrorClass },
  withTenantRlsContext: mockWithTenantRlsContext,
}));

import { FinancePayerGrantService } from "../finance-payer-grant.service";
import type { FinanceStripeCheckoutProvider } from "../../stripe/finance-stripe-checkout.provider";

describe("FinancePayerGrantService", () => {
  const scope = { tenantId: "tenant-a", orgId: "org-a" };
  const service = new FinancePayerGrantService({
    retrieveSession: mockRetrieveSession,
    expireSession: mockExpireSession,
  } as unknown as FinanceStripeCheckoutProvider);

  beforeEach(() => {
    jest.clearAllMocks();
    mockWithTenantRlsContext.mockImplementation(
      async (
        _tenantId: string,
        _orgId: string,
        callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
      ) =>
        callback({
          $queryRaw: mockQueryRaw,
          financePayerAccount: { findFirst: mockPayerAccountFindFirst },
          financePayerGrant: {
            findFirst: mockGrantFindFirst,
            create: mockGrantCreate,
            updateMany: mockGrantUpdateMany,
          },
          financeCheckoutAttempt: {
            findMany: mockCheckoutAttemptsFindMany,
            updateMany: mockCheckoutAttemptsUpdateMany,
            count: mockCheckoutAttemptsCount,
          },
        } as unknown as Prisma.TransactionClient),
    );
    mockPayerAccountFindFirst.mockResolvedValue({ id: "account-a" });
    mockGrantFindFirst.mockResolvedValue(null);
    mockGrantUpdateMany.mockResolvedValue({ count: 1 });
    mockCheckoutAttemptsFindMany.mockResolvedValue([]);
    mockCheckoutAttemptsUpdateMany.mockResolvedValue({ count: 1 });
    mockCheckoutAttemptsCount.mockResolvedValue(0);
    mockQueryRaw.mockResolvedValue([{ id: "grant-a" }]);
  });

  it("creates grants with server-resolved tenant, organisation and actor scope", async () => {
    const created = {
      id: "grant-a",
      payerUserId: "payer-a",
      grantedAt: new Date(),
    };
    mockGrantCreate.mockResolvedValue(created);
    await expect(
      service.grant(scope, "account-a", "payer-a", "staff-a"),
    ).resolves.toEqual(created);
    expect(mockGrantCreate).toHaveBeenCalledWith({
      data: {
        financePayerAccountId: "account-a",
        tenantId: "tenant-a",
        orgId: "org-a",
        payerUserId: "payer-a",
        grantedByUserId: "staff-a",
      },
      select: { id: true, payerUserId: true, grantedAt: true },
    });
  });

  it("returns the current grant for a repeated request", async () => {
    const current = {
      id: "grant-a",
      payerUserId: "payer-a",
      grantedAt: new Date(),
    };
    mockGrantFindFirst.mockResolvedValue(current);
    await expect(
      service.grant(scope, "account-a", "payer-a", "staff-a"),
    ).resolves.toEqual(current);
    expect(mockGrantCreate).not.toHaveBeenCalled();
  });

  it("does not create a grant for an account outside the current tenant scope", async () => {
    mockPayerAccountFindFirst.mockResolvedValue(null);
    await expect(
      service.grant(scope, "account-b", "payer-a", "staff-a"),
    ).rejects.toThrow(NotFoundException);
    expect(mockGrantCreate).not.toHaveBeenCalled();
  });

  it("maps a racing active-grant uniqueness conflict to a safe conflict", async () => {
    mockGrantCreate.mockRejectedValue(
      new mockKnownRequestErrorClass("Unique constraint", "P2002"),
    );
    await expect(
      service.grant(scope, "account-a", "payer-a", "staff-a"),
    ).rejects.toThrow(ConflictException);
  });

  it("revokes only the matching active grant and records the actor", async () => {
    mockGrantFindFirst.mockResolvedValue({ id: "grant-a" });
    mockGrantUpdateMany.mockResolvedValue({ count: 1 });
    await expect(
      service.revoke(scope, "account-a", "grant-a", "staff-a"),
    ).resolves.toBeUndefined();
    expect(mockGrantUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "grant-a",
        financePayerAccountId: "account-a",
        tenantId: "tenant-a",
        orgId: "org-a",
        revokedAt: null,
      },
      data: { revokedAt: expect.any(Date), revokedByUserId: "staff-a" },
    });
  });

  it("expires open Stripe sessions before revoking payer access", async () => {
    mockGrantFindFirst.mockResolvedValue({ id: "grant-a" });
    mockCheckoutAttemptsFindMany.mockResolvedValue([
      {
        id: "attempt-a",
        stripeAccountId: "acct_school",
        stripeCheckoutSessionId: "cs_test_open",
      },
    ]);
    mockRetrieveSession
      .mockResolvedValueOnce({ status: "open", paymentStatus: "unpaid" })
      .mockResolvedValueOnce({ status: "expired", paymentStatus: "unpaid" });
    mockExpireSession.mockResolvedValue(undefined);

    await expect(
      service.revoke(scope, "account-a", "grant-a", "staff-a"),
    ).resolves.toBeUndefined();

    expect(mockExpireSession).toHaveBeenCalledWith({
      stripeAccountId: "acct_school",
      sessionId: "cs_test_open",
      idempotencyKey: "finance-checkout-expire-attempt-a",
    });
    expect(mockCheckoutAttemptsUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "attempt-a",
        tenantId: "tenant-a",
        orgId: "org-a",
        status: "OPEN",
      },
      data: { status: "EXPIRED" },
    });
    expect(mockGrantUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "grant-a", revokedAt: null }),
        data: expect.objectContaining({
          revokedAt: expect.any(Date),
          revokedByUserId: "staff-a",
        }),
      }),
    );
  });

  it("preserves a completed Stripe payment while revoking future access", async () => {
    mockGrantFindFirst.mockResolvedValue({ id: "grant-a" });
    mockCheckoutAttemptsFindMany.mockResolvedValue([
      {
        id: "attempt-a",
        stripeAccountId: "acct_school",
        stripeCheckoutSessionId: "cs_test_complete",
      },
    ]);
    mockRetrieveSession.mockResolvedValue({
      status: "complete",
      paymentStatus: "paid",
    });

    await expect(
      service.revoke(scope, "account-a", "grant-a", "staff-a"),
    ).resolves.toBeUndefined();

    expect(mockExpireSession).not.toHaveBeenCalled();
    expect(mockCheckoutAttemptsUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "attempt-a",
        tenantId: "tenant-a",
        orgId: "org-a",
        status: "OPEN",
      },
      data: { status: "COMPLETED" },
    });
  });

  it("does not revoke payer access when an open Stripe session cannot be secured", async () => {
    mockGrantFindFirst.mockResolvedValue({ id: "grant-a" });
    mockCheckoutAttemptsFindMany.mockResolvedValue([
      {
        id: "attempt-a",
        stripeAccountId: "acct_school",
        stripeCheckoutSessionId: "cs_test_open",
      },
    ]);
    mockRetrieveSession.mockRejectedValue(new Error("provider unavailable"));

    await expect(
      service.revoke(scope, "account-a", "grant-a", "staff-a"),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(mockGrantUpdateMany).not.toHaveBeenCalled();
  });

  it("does not disclose a grant outside the account or active set", async () => {
    mockGrantFindFirst.mockResolvedValue(null);
    await expect(
      service.revoke(scope, "account-a", "other-grant", "staff-a"),
    ).rejects.toThrow(NotFoundException);
  });
});
