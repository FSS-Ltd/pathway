import { ForbiddenException } from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import type { FinanceAccessService } from "../access/finance-access.service";
import type { FinanceBalanceService } from "../finance-balance.service";
import type { FinanceStatementDocumentService } from "../finance-statement-document.service";
import { FinanceStatementService } from "../finance-statement.service";

jest.mock("@pathway/db", () => ({ withTenantRlsContext: jest.fn() }));

describe("FinanceStatementService payer access", () => {
  const actor = { tenantId: "tenant-a", orgId: "org-a", userId: "payer-a" };
  const payerAccountId = "397d71dd-0284-47a2-b13a-b9d3b2ad47c2";

  beforeEach(() => jest.clearAllMocks());

  it("checks the payer grant before reading or creating a statement", async () => {
    const access = {
      assertPayerAction: jest
        .fn()
        .mockRejectedValue(
          new ForbiddenException("Finance access unavailable"),
        ),
    };
    const documents = { ensureReady: jest.fn() };
    const service = new FinanceStatementService(
      access as unknown as FinanceAccessService,
      {} as FinanceBalanceService,
      documents as unknown as FinanceStatementDocumentService,
    );

    await expect(
      service.requestForPayer(actor, payerAccountId, "request-key", {
        periodStart: "2026-09-01T00:00:00.000Z",
        periodEnd: "2026-10-01T00:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(access.assertPayerAction).toHaveBeenCalledWith(
      actor,
      actor.userId,
      payerAccountId,
      "READ_STATEMENTS",
    );
    expect(withTenantRlsContext).not.toHaveBeenCalled();
    expect(documents.ensureReady).not.toHaveBeenCalled();
  });
});
