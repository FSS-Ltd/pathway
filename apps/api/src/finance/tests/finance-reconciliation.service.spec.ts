import { randomUUID } from "node:crypto";
import { ForbiddenException } from "@nestjs/common";
import type { FinanceAccessService } from "../access/finance-access.service";
import type { EffectivePermissionsService } from "../../access-control/effective-permissions.service";

const mockTenant = jest.fn();
jest.mock("@pathway/db", () => ({
  Prisma: { JsonNull: null },
  withTenantRlsContext: mockTenant,
}));
import { FinanceReconciliationService } from "../finance-reconciliation.service";

const actor = {
  tenantId: randomUUID(),
  orgId: randomUUID(),
  userId: randomUUID(),
};
const seen = new Date("2026-10-23T12:00:00Z");
const row = {
  id: randomUUID(),
  tenantId: actor.tenantId,
  orgId: actor.orgId,
  stripeConnectionId: randomUUID(),
  kind: "UNMATCHED_MONEY",
  status: "OPEN",
  amountMinor: 1000n,
  currency: "GBP",
  resourceReference: "pi_example",
  details: {},
  lastSeenAt: seen,
  createdAt: seen,
  acknowledgedAt: null,
  resolvedAt: null,
  stripeConnection: {
    id: randomUUID(),
    stripeAccountId: "acct_example",
    livemode: false,
    status: "READY",
    disconnectedAt: null,
    financeProfile: { legalEntityName: "Synthetic school" },
  },
};

describe("FinanceReconciliationService safe actions", () => {
  const access = { assertStaffAction: jest.fn(), resolveMode: jest.fn() };
  const permissions = { resolve: jest.fn() };
  const tx = {
    $queryRaw: jest.fn(),
    financeReconciliationCase: { findFirst: jest.fn(), update: jest.fn() },
    financeReconciliationCaseEvent: { findFirst: jest.fn(), create: jest.fn() },
    financeStripeWebhookEvent: { findFirst: jest.fn() },
  };
  const service = new FinanceReconciliationService(
    access as unknown as FinanceAccessService,
    permissions as unknown as EffectivePermissionsService,
  );
  const input = () => ({
    requestId: randomUUID(),
    reason: "Review stored evidence",
    expectedLastSeenAt: seen.toISOString(),
  });
  beforeEach(() => {
    jest.resetAllMocks();
    access.assertStaffAction.mockResolvedValue(undefined);
    access.resolveMode.mockResolvedValue("SERVICING_ONLY");
    permissions.resolve.mockResolvedValue({ allowed: true });
    tx.financeReconciliationCase.findFirst.mockResolvedValue(row);
    tx.financeReconciliationCaseEvent.findFirst.mockResolvedValue(null);
    mockTenant.mockImplementation(
      (
        _tenant: string,
        _org: string,
        callback: (client: typeof tx) => unknown,
      ) => callback(tx),
    );
  });
  it("acknowledges without resolving and audits its actor", async () => {
    await service.act(actor, row.id, "ACKNOWLEDGE", input());
    expect(tx.financeReconciliationCase.update).toHaveBeenCalledWith({
      where: { id: row.id },
      data: { status: "ACKNOWLEDGED", acknowledgedAt: expect.any(Date) },
    });
    expect(tx.financeReconciliationCaseEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: actor.userId,
        type: "ACKNOWLEDGED",
      }),
    });
  });
  it("stores a durable recheck without changing money or resolving the case", async () => {
    const request = input();
    const result = await service.act(actor, row.id, "RECHECK", request);
    expect(result).toMatchObject({
      requestId: request.requestId,
      status: "REQUESTED",
      accessMode: "SERVICING_ONLY",
      connection: { mode: "TEST", accountId: "acct_example" },
    });
    expect(tx.financeReconciliationCaseEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "REPLAY_REQUESTED",
        details: expect.objectContaining({
          action: "RECHECK",
          requestId: request.requestId,
        }),
      }),
    });
    expect(tx.financeReconciliationCase.update).not.toHaveBeenCalled();
  });
  it("rejects changed evidence and a missing tenant-scoped case", async () => {
    await expect(
      service.act(actor, row.id, "RECHECK", {
        ...input(),
        expectedLastSeenAt: new Date(0).toISOString(),
      }),
    ).rejects.toThrow("Case changed");
    tx.financeReconciliationCase.findFirst.mockResolvedValue(null);
    await expect(
      service.act(actor, row.id, "RECHECK", input()),
    ).rejects.toThrow("case unavailable");
    expect(tx.financeReconciliationCaseEvent.create).not.toHaveBeenCalled();
  });
  it("rejects unscoped replay evidence", async () => {
    tx.financeStripeWebhookEvent.findFirst.mockResolvedValue(null);
    await expect(
      service.act(actor, row.id, "REPLAY", {
        ...input(),
        evidenceId: randomUUID(),
      }),
    ).rejects.toThrow("Scoped evidence unavailable");
    expect(tx.financeStripeWebhookEvent.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        stripeAccountId: "acct_example",
        livemode: false,
      }),
    });
    expect(tx.financeReconciliationCaseEvent.create).not.toHaveBeenCalled();
  });
  it("reuses a pending request across repeated taps", async () => {
    const request = input();
    tx.financeReconciliationCaseEvent.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        type: "REPLAY_REQUESTED",
        details: {
          action: "RECHECK",
          requestId: request.requestId,
          evidenceId: null,
        },
      })
      .mockResolvedValueOnce(null);
    await expect(
      service.act(actor, row.id, "RECHECK", input()),
    ).resolves.toMatchObject({
      requestId: request.requestId,
      status: "ALREADY_REQUESTED",
    });
    expect(tx.financeReconciliationCaseEvent.create).not.toHaveBeenCalled();
  });
  it("rechecks revoked permission before writing", async () => {
    permissions.resolve
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: false });
    await expect(
      service.act(actor, row.id, "ACKNOWLEDGE", input()),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.financeReconciliationCaseEvent.create).not.toHaveBeenCalled();
    expect(tx.financeReconciliationCase.update).not.toHaveBeenCalled();
  });
});
