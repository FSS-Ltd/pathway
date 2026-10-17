import { ForbiddenException } from "@nestjs/common";
import { ModuleStatus } from "@pathway/db";
import type { EffectivePermissionsService } from "../../../access-control/effective-permissions.service";
import type { FinanceAccessReader } from "../finance-access.reader";
import { FinanceAccessService } from "../finance-access.service";

describe("FinanceAccessService", () => {
  const scope = { tenantId: "tenant-a", orgId: "org-a" };
  const reader = {
    findModule: jest.fn(),
    hasPayerGrant: jest.fn(),
    hasReceipt: jest.fn(),
  } satisfies jest.Mocked<FinanceAccessReader>;
  const permissions = {
    resolve: jest.fn(),
  } as unknown as Pick<EffectivePermissionsService, "resolve">;
  let service: FinanceAccessService;

  beforeEach(() => {
    jest.clearAllMocks();
    reader.findModule.mockResolvedValue(null);
    reader.hasPayerGrant.mockResolvedValue(false);
    reader.hasReceipt.mockResolvedValue(false);
    (permissions.resolve as jest.Mock).mockResolvedValue({ allowed: true });
    service = new FinanceAccessService(
      reader,
      permissions as EffectivePermissionsService,
    );
  });

  it("denies locked access", async () => {
    await expect(
      service.assertStaffAction(scope, "READ_RECORDS"),
    ).rejects.toThrow(ForbiddenException);
  });

  it("allows active staff actions after the module check", async () => {
    reader.findModule.mockResolvedValue({
      status: ModuleStatus.ACTIVE,
      expiresAt: null,
    });
    await expect(
      service.assertStaffAction(scope, "CREATE_INVOICE"),
    ).resolves.toBeUndefined();
  });

  it("allows servicing reads but blocks new invoice creation", async () => {
    reader.findModule.mockResolvedValue({
      status: ModuleStatus.CANCELLED,
      expiresAt: new Date(),
    });
    await expect(
      service.assertStaffAction(scope, "EXPORT_REPORT"),
    ).resolves.toBeUndefined();
    await expect(
      service.assertStaffAction(scope, "CREATE_INVOICE"),
    ).rejects.toThrow(ForbiddenException);
  });

  it("checks the current payer grant for each request", async () => {
    reader.findModule.mockResolvedValue({
      status: ModuleStatus.ACTIVE,
      expiresAt: null,
    });
    await expect(
      service.assertPayerAction(scope, "payer-a", "account-a", "READ_ACCOUNT"),
    ).rejects.toThrow(ForbiddenException);
    expect(reader.hasPayerGrant).toHaveBeenCalledWith(
      scope,
      "account-a",
      "payer-a",
    );

    reader.hasPayerGrant.mockResolvedValueOnce(true);
    await expect(
      service.assertPayerAction(scope, "payer-a", "account-a", "READ_ACCOUNT"),
    ).resolves.toBeUndefined();
  });

  it("permits only the servicing payer actions for a current grant", async () => {
    reader.findModule.mockResolvedValue({
      status: ModuleStatus.CANCELLED,
      expiresAt: null,
    });
    reader.hasPayerGrant.mockResolvedValue(true);
    await expect(
      service.assertPayerAction(
        scope,
        "payer-a",
        "account-a",
        "SETTLE_ISSUED_INVOICE",
      ),
    ).resolves.toBeUndefined();
  });

  it("rejects self-approval and requires the reviewer permission", async () => {
    reader.findModule.mockResolvedValue({
      status: ModuleStatus.ACTIVE,
      expiresAt: null,
    });
    await expect(
      service.authorizeAutomatedDebitApproval(scope, "staff-a", "staff-a"),
    ).rejects.toThrow(ForbiddenException);
    expect(permissions.resolve).not.toHaveBeenCalled();

    (permissions.resolve as jest.Mock).mockResolvedValueOnce({
      allowed: false,
    });
    await expect(
      service.authorizeAutomatedDebitApproval(scope, "staff-a", "staff-b"),
    ).rejects.toThrow(ForbiddenException);
    expect(permissions.resolve).toHaveBeenCalledWith({
      userId: "staff-b",
      orgId: scope.orgId,
      tenantId: scope.tenantId,
      permission: "finance.approvals.review",
      now: expect.any(Date),
    });
  });

  it("allows a distinct approver with the reviewer permission", async () => {
    reader.findModule.mockResolvedValue({
      status: ModuleStatus.ACTIVE,
      expiresAt: null,
    });
    await expect(
      service.authorizeAutomatedDebitApproval(scope, "staff-a", "staff-b"),
    ).resolves.toBeUndefined();
  });

  it("requires active access and reviewer permission for invoice approvals", async () => {
    await expect(
      service.authorizeIndependentFinanceApproval(scope, "staff-a", "staff-b"),
    ).rejects.toThrow(ForbiddenException);

    reader.findModule.mockResolvedValue({
      status: ModuleStatus.ACTIVE,
      expiresAt: null,
    });
    await expect(
      service.authorizeIndependentFinanceApproval(scope, "staff-a", "staff-b"),
    ).resolves.toBeUndefined();
    expect(permissions.resolve).toHaveBeenCalledWith({
      userId: "staff-b",
      orgId: scope.orgId,
      tenantId: scope.tenantId,
      permission: "finance.approvals.review",
      now: expect.any(Date),
    });
  });

  it("allows an independent reviewer to confirm an in-flight payment in servicing mode", async () => {
    reader.findModule.mockResolvedValue({
      status: ModuleStatus.CANCELLED,
      expiresAt: null,
    });
    await expect(
      Reflect.apply(service.authorizeIndependentFinanceApproval, service, [
        scope,
        "staff-a",
        "staff-b",
        "RECORD_IN_FLIGHT_PAYMENT",
      ]),
    ).resolves.toBeUndefined();
  });

  it("continues servicing an existing receipt regardless of entitlement", async () => {
    reader.hasReceipt.mockResolvedValue(true);
    await expect(
      service.assertExistingReceiptCanBeServiced(scope, "receipt-a"),
    ).resolves.toBeUndefined();
    expect(reader.findModule).not.toHaveBeenCalled();

    reader.hasReceipt.mockResolvedValueOnce(false);
    await expect(
      service.assertExistingReceiptCanBeServiced(scope, "missing-receipt"),
    ).rejects.toThrow(ForbiddenException);
  });
});
