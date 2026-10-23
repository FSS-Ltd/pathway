import { ForbiddenException } from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import type { EffectivePermissionsService } from "../../access-control/effective-permissions.service";
import type { FinanceAccessService } from "../access/finance-access.service";
import { FinanceFamilyService } from "../finance-family.service";
import type { FinanceBalanceService } from "../finance-balance.service";

jest.mock("@pathway/db", () => ({ withTenantRlsContext: jest.fn() }));

describe("FinanceFamilyService", () => {
  const actor = { tenantId: "tenant-a", orgId: "org-a", userId: "payer-a" };
  const payerAccountId = "397d71dd-0284-47a2-b13a-b9d3b2ad47c2";
  const account = {
    id: payerAccountId,
    displayName: "Alex Example",
  };

  beforeEach(() => jest.clearAllMocks());

  it("lists only active payer accounts granted to the current user", async () => {
    const access = { resolveMode: jest.fn().mockResolvedValue("ACTIVE") };
    const permissions = {
      resolve: jest.fn().mockResolvedValue({ allowed: true }),
    };
    const tx = {
      financePayerGrant: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { payerAccount: account },
            { payerAccount: account },
          ]),
      },
    };
    jest
      .mocked(withTenantRlsContext)
      .mockImplementation(async (_tenant, _org, work) => work(tx as never));
    const service = new FinanceFamilyService(
      access as unknown as FinanceAccessService,
      permissions as unknown as EffectivePermissionsService,
      {} as FinanceBalanceService,
    );

    await expect(service.listPayerAccounts(actor)).resolves.toEqual({
      items: [account],
    });
    expect(tx.financePayerGrant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          payerUserId: actor.userId,
          revokedAt: null,
        },
      }),
    );
    expect(permissions.resolve).toHaveBeenCalledTimes(3);
  });

  it("does not query accounts when Finance is locked", async () => {
    const access = { resolveMode: jest.fn().mockResolvedValue("LOCKED") };
    const permissions = { resolve: jest.fn() };
    const service = new FinanceFamilyService(
      access as unknown as FinanceAccessService,
      permissions as unknown as EffectivePermissionsService,
      {} as FinanceBalanceService,
    );

    await expect(service.listPayerAccounts(actor)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(permissions.resolve).not.toHaveBeenCalled();
    expect(withTenantRlsContext).not.toHaveBeenCalled();
  });

  it("requires at least one family Finance permission", async () => {
    const access = { resolveMode: jest.fn().mockResolvedValue("ACTIVE") };
    const permissions = {
      resolve: jest.fn().mockResolvedValue({ allowed: false }),
    };
    const service = new FinanceFamilyService(
      access as unknown as FinanceAccessService,
      permissions as unknown as EffectivePermissionsService,
      {} as FinanceBalanceService,
    );

    await expect(service.listPayerAccounts(actor)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(withTenantRlsContext).not.toHaveBeenCalled();
  });

  it("limits family invoice reads to issued and void invoices for the granted account", async () => {
    const access = {
      assertPayerAction: jest.fn().mockResolvedValue(undefined),
    };
    const permissions = { resolve: jest.fn() };
    const invoice = {
      id: "invoice-a",
      payerAccountId,
      invoiceNumber: 12n,
      status: "ISSUED",
      currency: "GBP",
      subtotalMinor: 1000n,
      taxMinor: 0n,
      totalMinor: 1000n,
      issuedAt: new Date("2026-10-01T00:00:00.000Z"),
      dueAt: new Date("2026-10-31T00:00:00.000Z"),
      createdAt: new Date("2026-10-01T00:00:00.000Z"),
      voidedAt: null,
      lines: [
        {
          id: "line-a",
          lineOrder: 0,
          description: "School trip",
          quantity: { toString: () => "1" },
          totalMinor: 1000n,
        },
      ],
    };
    const tx = {
      financeInvoice: { findMany: jest.fn().mockResolvedValue([invoice]) },
      financeCheckoutAttempt: { findMany: jest.fn().mockResolvedValue([]) },
    };
    jest
      .mocked(withTenantRlsContext)
      .mockImplementation(async (_tenant, _org, work) => work(tx as never));
    const balances = {
      forInvoices: jest.fn().mockResolvedValue(
        new Map([
          [
            invoice.id,
            {
              issuedGrossMinor: "1000",
              issuedCreditsMinor: "0",
              allocatedReceiptsMinor: "0",
              outstandingMinor: "1000",
              creditBalanceMinor: "0",
            },
          ],
        ]),
      ),
    };
    const service = new FinanceFamilyService(
      access as unknown as FinanceAccessService,
      permissions as unknown as EffectivePermissionsService,
      balances as unknown as FinanceBalanceService,
    );

    const result = await service.listInvoices(actor, payerAccountId, {
      limit: 50,
    });

    expect(access.assertPayerAction).toHaveBeenCalledWith(
      actor,
      actor.userId,
      payerAccountId,
      "READ_ACCOUNT",
    );
    expect(tx.financeInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          payerAccountId,
          status: { in: ["ISSUED", "VOID"] },
        }),
      }),
    );
    expect(tx.financeCheckoutAttempt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          payerGrant: {
            is: expect.objectContaining({
              payerUserId: actor.userId,
              revokedAt: null,
            }),
          },
        }),
      }),
    );
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: invoice.id,
        invoiceNumber: "12",
        balance: expect.objectContaining({ outstandingMinor: "1000" }),
        cardPayment: { eligible: true, reason: null },
        lines: [expect.objectContaining({ description: "School trip" })],
      }),
    );
    balances.forInvoices.mockResolvedValue(
      new Map([
        [
          invoice.id,
          {
            issuedGrossMinor: "1000",
            issuedCreditsMinor: "0",
            allocatedReceiptsMinor: "971",
            outstandingMinor: "29",
            creditBalanceMinor: "0",
          },
        ],
      ]),
    );
    const smallBalance = await service.listInvoices(actor, payerAccountId, {
      limit: 50,
    });
    expect(smallBalance.items[0]).toMatchObject({
      totalMinor: "1000",
      balance: { outstandingMinor: "29" },
      cardPayment: {
        eligible: false,
        reason:
          "Card payments require at least £0.30. Choose another payment method for this amount.",
      },
    });
  });

  it("does not read an invoice when the payer grant is denied", async () => {
    const access = {
      assertPayerAction: jest
        .fn()
        .mockRejectedValue(
          new ForbiddenException("Finance access unavailable"),
        ),
    };
    const tx = { financeInvoice: { findFirst: jest.fn() } };
    jest
      .mocked(withTenantRlsContext)
      .mockImplementation(async (_tenant, _org, work) => work(tx as never));
    const service = new FinanceFamilyService(
      access as unknown as FinanceAccessService,
      {} as EffectivePermissionsService,
      {} as FinanceBalanceService,
    );

    await expect(
      service.getInvoice(actor, payerAccountId, "invoice-a"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(withTenantRlsContext).not.toHaveBeenCalled();
  });
});
