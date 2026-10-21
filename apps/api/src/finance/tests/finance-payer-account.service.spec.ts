import { ForbiddenException } from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import type { FinanceAccessService } from "../access/finance-access.service";
import type { FinanceCommandService } from "../finance-command.service";
import { FinancePayerAccountService } from "../finance-payer-account.service";

jest.mock("@pathway/db", () => ({ withTenantRlsContext: jest.fn() }));

describe("FinancePayerAccountService", () => {
  const actor = { tenantId: "tenant-a", orgId: "org-a", userId: "staff-a" };
  const firstId = "397d71dd-0284-47a2-b13a-b9d3b2ad47c2";
  const secondId = "f16377e8-88f4-4231-8d3e-87d3f2d6f020";
  const thirdId = "c088cf6d-eef4-4a96-9d6b-f280dfc64f9c";
  const rows = [firstId, secondId, thirdId].map((id, index) => ({
    id,
    displayName: `Family ${index + 1}`,
    createdAt: new Date(`2026-10-0${index + 1}T09:00:00.000Z`),
  }));
  const findMany = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    findMany.mockResolvedValue(rows);
    (withTenantRlsContext as jest.Mock).mockImplementation(
      (
        _tenantId: string,
        _orgId: string,
        operation: (tx: unknown) => unknown,
      ) => operation({ financePayerAccount: { findMany } }),
    );
  });

  it("returns an opaque next cursor and maps one page", async () => {
    const access = {
      assertStaffAction: jest.fn().mockResolvedValue(undefined),
    };
    const service = new FinancePayerAccountService(
      access as unknown as FinanceAccessService,
      {} as FinanceCommandService,
    );

    await expect(service.list(actor, { limit: 2 })).resolves.toEqual({
      nextCursor: secondId,
      items: rows.slice(0, 2).map(({ id, displayName, createdAt }) => ({
        id,
        displayName,
        createdAt: createdAt.toISOString(),
      })),
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: actor.tenantId, orgId: actor.orgId },
        orderBy: [{ displayName: "asc" }, { id: "asc" }],
        take: 3,
      }),
    );
  });

  it("continues after the requested cursor", async () => {
    findMany.mockResolvedValue(rows.slice(1));
    const access = {
      assertStaffAction: jest.fn().mockResolvedValue(undefined),
    };
    const service = new FinancePayerAccountService(
      access as unknown as FinanceAccessService,
      {} as FinanceCommandService,
    );

    await expect(
      service.list(actor, { limit: 2, cursor: firstId }),
    ).resolves.toMatchObject({
      nextCursor: null,
      items: rows.slice(1).map(({ id, displayName }) => ({ id, displayName })),
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { id: firstId }, skip: 1 }),
    );
  });

  it("checks staff access before reading accounts", async () => {
    const access = {
      assertStaffAction: jest
        .fn()
        .mockRejectedValue(
          new ForbiddenException("Finance access unavailable"),
        ),
    };
    const service = new FinancePayerAccountService(
      access as unknown as FinanceAccessService,
      {} as FinanceCommandService,
    );

    await expect(service.list(actor, { limit: 2 })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(access.assertStaffAction).toHaveBeenCalledWith(
      actor,
      "READ_RECORDS",
    );
    expect(withTenantRlsContext).not.toHaveBeenCalled();
  });
});
