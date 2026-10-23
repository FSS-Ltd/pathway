import type { Prisma } from "@pathway/db";
import type { FinanceCaseRequest } from "../finance-case-request.contracts";
const mockTx = {} as Prisma.TransactionClient;
const mockLocal = jest.fn();
const mockScope = jest.fn();
const mockPrepareLocal = jest.fn();
const mockCaptureLocal = jest
  .fn()
  .mockResolvedValue({ recoverable: 1, exceptions: 0 });
const mockCapturePage = jest
  .fn()
  .mockResolvedValue({ recoverable: 1, exceptions: 0 });
jest.mock("@pathway/db", () => ({
  withTenantRlsContext: (
    _tenant: string,
    _org: string,
    callback: (tx: Prisma.TransactionClient) => unknown,
  ) => callback(mockTx),
}));
jest.mock("../finance-reconciliation-scope", () => ({
  assertReconciliationScope: mockScope,
}));
jest.mock("../finance-case-unresolved.persistence", () => ({
  readFinanceCaseUnresolvedContext: mockLocal,
}));
jest.mock("../finance-unresolved-preparation", () => ({
  prepareFinanceUnresolvedOperation: mockPrepareLocal,
}));
jest.mock("../finance-unresolved-capture.persistence", () => ({
  captureFinanceUnresolvedOperation: mockCaptureLocal,
}));
jest.mock("../finance-recovery-page-capture", () => ({
  captureFinanceRecoveryPage: mockCapturePage,
}));
import { createFinanceCaseRecheckPreparation } from "../finance-case-recheck.preparation";
const scope = {
  tenantId: "tenant",
  orgId: "org",
  connectionId: "connection",
  stripeAccountId: "acct_school",
  livemode: false,
};
const now = new Date("2026-10-23T12:00:00Z");
const request: FinanceCaseRequest = {
  eventId: "event",
  caseId: "case",
  requestId: "request",
  action: "RECHECK",
  evidenceId: null,
  createdAt: now,
  caseKey: "provider:example",
  kind: "UNKNOWN_OPERATION",
  resourceReference: "pi_known",
  details: {},
};
function dependencies() {
  return {
    clock: () => now,
    provider: {
      retrieve: jest.fn().mockResolvedValue({
        id: "pi_known",
        object: "payment_intent",
        created: 1,
        livemode: false,
      }),
      listPage: jest.fn(),
    },
    mandates: {
      retrieve: jest.fn(),
      detachPaymentMethod: jest.fn(),
      expireMandateSetupSession: jest.fn(),
    },
    payouts: { listPage: jest.fn() },
  };
}
describe("executable scoped case rechecks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockScope.mockResolvedValue(undefined);
  });
  it("reads an allowlisted resource in the stored account and captures canonically only afterwards", async () => {
    const deps = dependencies();
    const prepared = await createFinanceCaseRecheckPreparation(deps)(
      scope,
      request,
    );
    expect(deps.provider.retrieve).toHaveBeenCalledWith(
      scope,
      "paymentIntents",
      "pi_known",
    );
    expect(mockCapturePage).not.toHaveBeenCalled();
    await prepared.capture(mockTx, scope, now, "sync");
    expect(mockCapturePage).toHaveBeenCalledWith(
      mockTx,
      scope,
      "paymentIntents",
      [{ kind: "ordinary", raw: expect.objectContaining({ id: "pi_known" }) }],
      now,
      "capture",
    );
  });
  it("reports manual review for unsupported resources without resolving anything", async () => {
    const deps = dependencies();
    const prepared = await createFinanceCaseRecheckPreparation(deps)(scope, {
      ...request,
      resourceReference: "customer_secret",
    });
    expect(prepared.outcome).toMatch(/MANUAL_REVIEW/);
    expect(await prepared.capture(mockTx, scope, now, "sync")).toEqual({
      recoverable: 0,
      exceptions: 1,
    });
    expect(deps.provider.retrieve).not.toHaveBeenCalled();
    expect(mockCapturePage).not.toHaveBeenCalled();
  });
  it("uses exact local scope lookup and prepares unresolved work read-only even before a sync capture", async () => {
    const deps = dependencies();
    const context = { operation: { key: "checkout:local" } };
    const localPrepared = { context };
    mockLocal.mockResolvedValue(context);
    mockPrepareLocal.mockResolvedValue(localPrepared);
    const prepared = await createFinanceCaseRecheckPreparation(deps)(scope, {
      ...request,
      caseKey: "unresolved:checkout:local",
      resourceReference: null,
    });
    expect(mockLocal).toHaveBeenCalledWith(
      mockTx,
      scope,
      "unresolved:checkout:local",
    );
    expect(mockPrepareLocal).toHaveBeenCalledWith(
      scope,
      context,
      now,
      "dry-run",
      deps,
    );
    await prepared.capture(mockTx, scope, now, "dry-run");
    expect(mockCaptureLocal).toHaveBeenCalledWith(
      mockTx,
      scope,
      localPrepared,
      now,
      "dry-run",
    );
    expect(deps.mandates.detachPaymentMethod).not.toHaveBeenCalled();
  });
  it("holds a missing local reference rather than falling through to a provider resource", async () => {
    const deps = dependencies();
    mockLocal.mockResolvedValue(null);
    const prepared = await createFinanceCaseRecheckPreparation(deps)(scope, {
      ...request,
      caseKey: "unresolved:refund:foreign",
    });
    expect(prepared.outcome).toMatch(/MANUAL_REVIEW/);
    expect(deps.provider.retrieve).not.toHaveBeenCalled();
  });
  it("rejects capture in another connection scope", async () => {
    const prepared = await createFinanceCaseRecheckPreparation(dependencies())(
      scope,
      request,
    );
    await expect(
      prepared.capture(
        mockTx,
        { ...scope, connectionId: "other" },
        now,
        "sync",
      ),
    ).rejects.toThrow(/scope/);
    expect(mockCapturePage).not.toHaveBeenCalled();
  });
  it("verifies the persisted connection scope before any provider read", async () => {
    const deps = dependencies();
    mockScope.mockRejectedValue(new Error("Stored scope mismatch"));
    await expect(
      createFinanceCaseRecheckPreparation(deps)(scope, request),
    ).rejects.toThrow("scope");
    expect(deps.provider.retrieve).not.toHaveBeenCalled();
  });
});
