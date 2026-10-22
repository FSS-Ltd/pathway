import { ForbiddenException } from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import type { FinanceAccessService } from "../../access/finance-access.service";
import type { FinanceBalanceService } from "../../finance-balance.service";
import { type FinanceStripeCheckoutConfig } from "../finance-stripe-checkout.config";
import { FinanceStripeCheckoutAttemptService } from "../finance-stripe-checkout-attempt.service";

jest.mock("@pathway/db", () => ({ withTenantRlsContext: jest.fn() }));

describe("FinanceStripeCheckoutAttemptService payer status", () => {
  const actor = { tenantId: "tenant-a", orgId: "org-a", userId: "payer-a" };
  const attemptId = "3a61c729-b6d1-4a4f-8e63-145e0bbd8489";
  const payerAccountId = "397d71dd-0284-47a2-b13a-b9d3b2ad47c2";

  beforeEach(() => jest.clearAllMocks());

  function createService(
    attempt: object | null,
    assertPayerAction = jest.fn().mockResolvedValue(undefined),
  ) {
    const tx = {
      financeCheckoutAttempt: {
        findFirst: jest.fn().mockResolvedValue(attempt),
      },
    };
    jest
      .mocked(withTenantRlsContext)
      .mockImplementation(async (_tenant, _org, work) => work(tx as never));
    const access = { assertPayerAction };
    const service = new FinanceStripeCheckoutAttemptService(
      access as unknown as FinanceAccessService,
      {} as FinanceBalanceService,
      { mode: "test" } as FinanceStripeCheckoutConfig,
    );
    return { service, tx, assertPayerAction };
  }

  it.each([
    ["CREATING", "CHECKING"],
    ["OPEN", "CHECKING"],
    ["COMPLETED", "CHECKING"],
    ["PAID", "CONFIRMED"],
    ["EXPIRED", "EXPIRED"],
    ["FAILED", "FAILED"],
  ] as const)("maps %s to the server status %s", async (stored, expected) => {
    const { service, assertPayerAction } = createService({
      id: attemptId,
      invoiceId: "invoice-a",
      status: stored,
      payerGrant: {
        financePayerAccountId: payerAccountId,
        payerUserId: actor.userId,
        revokedAt: null,
      },
    });

    await expect(service.getPayerStatus(actor, attemptId)).resolves.toEqual(
      expect.objectContaining({
        attemptId,
        invoiceId: "invoice-a",
        payerAccountId,
        status: expected,
      }),
    );
    expect(assertPayerAction).toHaveBeenCalledWith(
      actor,
      actor.userId,
      payerAccountId,
      "READ_ACCOUNT",
    );
  });

  it("blocks a status read after the attempt's payer grant is revoked", async () => {
    const { service, assertPayerAction } = createService({
      id: attemptId,
      invoiceId: "invoice-a",
      status: "PAID",
      payerGrant: {
        financePayerAccountId: payerAccountId,
        payerUserId: actor.userId,
        revokedAt: new Date(),
      },
    });

    await expect(
      service.getPayerStatus(actor, attemptId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(assertPayerAction).not.toHaveBeenCalled();
  });

  it("blocks an attempt belonging to another payer", async () => {
    const { service, assertPayerAction } = createService({
      id: attemptId,
      invoiceId: "invoice-a",
      status: "OPEN",
      payerGrant: {
        financePayerAccountId: payerAccountId,
        payerUserId: "payer-b",
        revokedAt: null,
      },
    });

    await expect(
      service.getPayerStatus(actor, attemptId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(assertPayerAction).not.toHaveBeenCalled();
  });
});
