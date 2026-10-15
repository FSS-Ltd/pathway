import { ConflictException, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@pathway/db";

const mockPayerAccountFindFirst = jest.fn();
const mockGrantFindFirst = jest.fn();
const mockGrantCreate = jest.fn();
const mockGrantUpdateMany = jest.fn();
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

describe("FinancePayerGrantService", () => {
  const scope = { tenantId: "tenant-a", orgId: "org-a" };
  const service = new FinancePayerGrantService();

  beforeEach(() => {
    jest.clearAllMocks();
    mockWithTenantRlsContext.mockImplementation(
      async (
        _tenantId: string,
        _orgId: string,
        callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
      ) =>
        callback({
          financePayerAccount: { findFirst: mockPayerAccountFindFirst },
          financePayerGrant: {
            findFirst: mockGrantFindFirst,
            create: mockGrantCreate,
            updateMany: mockGrantUpdateMany,
          },
        } as unknown as Prisma.TransactionClient),
    );
    mockPayerAccountFindFirst.mockResolvedValue({ id: "account-a" });
    mockGrantFindFirst.mockResolvedValue(null);
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

  it("does not disclose a grant outside the account or active set", async () => {
    mockGrantUpdateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.revoke(scope, "account-a", "other-grant", "staff-a"),
    ).rejects.toThrow(NotFoundException);
  });
});
