import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PathwayRequestContext } from "@pathway/auth";
import { FinanceAccessGuard } from "../finance-access.guard";
import { FINANCE_ACCESS_REQUIREMENT } from "../finance-access.types";
import type { FinanceAccessService } from "../finance-access.service";

function buildContext(
  params: Record<string, string | undefined> = {},
): ExecutionContext {
  return {
    getClass: () => class FinanceController {},
    getHandler: () => function getFinanceData() {},
    switchToHttp: () => ({ getRequest: () => ({ params }) }),
  } as unknown as ExecutionContext;
}

describe("FinanceAccessGuard", () => {
  const getAllAndOverride = jest.fn<unknown, [string, unknown[]]>();
  const getContext = jest.fn<
    ReturnType<PathwayRequestContext["getContext"]>,
    []
  >();
  const reflector = { getAllAndOverride } as unknown as Reflector;
  const requestContext = { getContext } as unknown as PathwayRequestContext;
  const financeAccess = {
    assertStaffAction: jest.fn(),
    assertPayerAction: jest.fn(),
  } as unknown as Pick<
    FinanceAccessService,
    "assertStaffAction" | "assertPayerAction"
  >;
  let guard: FinanceAccessGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    getContext.mockReturnValue({
      user: { userId: "user-a" },
      org: { orgId: "org-a" },
      tenant: { tenantId: "tenant-a", orgId: "org-a" },
      roles: { org: [], tenant: [] },
      permissions: [],
      rawClaims: {},
    });
    guard = new FinanceAccessGuard(
      reflector,
      requestContext,
      financeAccess as FinanceAccessService,
    );
  });

  it("leaves routes without Finance metadata to their normal guards", async () => {
    getAllAndOverride.mockReturnValue(undefined);
    await expect(guard.canActivate(buildContext())).resolves.toBe(true);
  });

  it.each([
    ["API records", "READ_RECORDS", "finance.invoices.read"],
    ["direct document URLs", "DOWNLOAD_DOCUMENT", "finance.statements.read"],
    ["exports", "EXPORT_REPORT", "finance.exports.create"],
    ["grant revocation", "REVOKE_PAYER_ACCESS", "finance.payer_access.manage"],
  ] as const)(
    "checks the access policy for %s",
    async (_label, action, permission) => {
      getAllAndOverride.mockImplementation((key: string) =>
        key === FINANCE_ACCESS_REQUIREMENT
          ? { kind: "staff", action, permission }
          : undefined,
      );
      await expect(guard.canActivate(buildContext())).resolves.toBe(true);
      expect(financeAccess.assertStaffAction).toHaveBeenCalledWith(
        { tenantId: "tenant-a", orgId: "org-a" },
        action,
      );
    },
  );

  it("checks the payer grant on the account in a direct URL", async () => {
    getAllAndOverride.mockImplementation((key: string) =>
      key === FINANCE_ACCESS_REQUIREMENT
        ? {
            kind: "payer",
            action: "READ_ACCOUNT",
            permission: "finance.family_invoices.read",
            accountParam: "payerAccountId",
          }
        : undefined,
    );
    await expect(
      guard.canActivate(buildContext({ payerAccountId: "account-a" })),
    ).resolves.toBe(true);
    expect(financeAccess.assertPayerAction).toHaveBeenCalledWith(
      { tenantId: "tenant-a", orgId: "org-a" },
      "user-a",
      "account-a",
      "READ_ACCOUNT",
    );
  });

  it("fails closed when a payer URL has no account scope", async () => {
    getAllAndOverride.mockReturnValue({
      kind: "payer",
      action: "READ_ACCOUNT",
      permission: "finance.family_invoices.read",
      accountParam: "payerAccountId",
    });
    await expect(guard.canActivate(buildContext())).rejects.toThrow(
      ForbiddenException,
    );
    expect(financeAccess.assertPayerAction).not.toHaveBeenCalled();
  });

  it("fails closed when trusted tenant context is missing", async () => {
    getAllAndOverride.mockReturnValue({
      kind: "staff",
      action: "READ_RECORDS",
      permission: "finance.invoices.read",
    });
    getContext.mockReturnValue(null);
    await expect(guard.canActivate(buildContext())).rejects.toThrow(
      ForbiddenException,
    );
    expect(financeAccess.assertStaffAction).not.toHaveBeenCalled();
  });
});
