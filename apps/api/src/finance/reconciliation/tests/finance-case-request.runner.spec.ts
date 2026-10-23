import type { Prisma } from "@pathway/db";
import type { FinanceReconciliationLease } from "../finance-reconciliation.types";
import type {
  FinanceCaseRequest,
  PreparedFinanceCaseRecheck,
} from "../finance-case-request.contracts";
import type { FinanceCaseRequestDependencies } from "../finance-case-request.runner";

const mockRead = jest.fn();
const mockPending = jest.fn();
const mockRequeue = jest.fn();
const mockComplete = jest.fn();
const mockFailure = jest.fn();
const mockTx = {
  $executeRaw: jest.fn().mockResolvedValue(0),
} as unknown as Prisma.TransactionClient;
jest.mock("@pathway/db", () => ({
  withTenantRlsContext: (
    _tenant: string,
    _org: string,
    callback: (tx: Prisma.TransactionClient) => unknown,
  ) => callback(mockTx),
}));
jest.mock("../finance-case-request-failure.persistence", () => ({
  recordFinanceCaseRequestFailure: mockFailure,
}));
jest.mock("../finance-case-request.persistence", () => ({
  readPendingFinanceCaseRequests: mockRead,
  inspectFinanceCaseEvidence: jest.fn(),
  lockPendingFinanceCaseRequest: mockPending,
  requeueFinanceCaseEvidence: mockRequeue,
  completeFinanceCaseRequest: mockComplete,
}));
import { runFinanceCaseRequestsReconciliation } from "../finance-case-request.runner";

const now = new Date("2026-10-23T12:00:00Z");
const scope = {
  tenantId: "tenant",
  orgId: "org",
  connectionId: "connection",
  stripeAccountId: "acct_synthetic",
  livemode: false,
};
const request: FinanceCaseRequest = {
  eventId: "event",
  caseId: "case",
  requestId: "request",
  action: "RECHECK",
  evidenceId: null,
  createdAt: new Date(0),
  caseKey: "unknown:checkout",
  kind: "UNKNOWN_OPERATION",
  resourceReference: null,
  details: {},
};
const window = { from: new Date(0), to: now, cursor: null, gap: null };
const lease: FinanceReconciliationLease = {
  scope,
  stream: "caseRequests",
  stateId: "state",
  token: "token",
  window,
};
function dependencies() {
  const capture = jest
    .fn()
    .mockResolvedValue({ recoverable: 1, exceptions: 0 });
  const states = {
    claim: jest.fn().mockResolvedValue(lease),
    preview: jest.fn().mockResolvedValue(window),
    release: jest.fn().mockResolvedValue(undefined),
    fail: jest.fn().mockResolvedValue(undefined),
    commitPage: jest
      .fn()
      .mockImplementation(
        async (
          _lease: FinanceReconciliationLease,
          _cursor: string | null,
          _now: Date,
          callback: (tx: Prisma.TransactionClient) => Promise<void>,
        ) => {
          await callback(mockTx);
          return { kind: "completed" };
        },
      ),
  };
  const deps: FinanceCaseRequestDependencies = {
    states,
    clock: () => now,
    prepareRecheck: jest
      .fn<
        Promise<PreparedFinanceCaseRecheck>,
        [typeof scope, FinanceCaseRequest]
      >()
      .mockImplementation(async () => {
        expect(states.commitPage).not.toHaveBeenCalled();
        return { outcome: "SCOPED_OBJECT_RECHECKED", capture };
      }),
  };
  return { deps, states, capture };
}
beforeEach(() => {
  jest.clearAllMocks();
  mockRead.mockResolvedValue({ data: [request], nextCursor: null });
  mockPending.mockResolvedValue(true);
  mockRequeue.mockResolvedValue({
    previousStatus: "DEAD_LETTER",
    previousAttempts: 10,
  });
});
describe("durable case request runner", () => {
  it("prepares remote rechecks before atomic capture and completion", async () => {
    const { deps, capture } = dependencies();
    await expect(
      runFinanceCaseRequestsReconciliation({ scope, mode: "sync" }, deps),
    ).resolves.toMatchObject({
      status: "completed",
      objects: 1,
      recoverable: 1,
    });
    expect(capture).toHaveBeenCalledWith(mockTx, scope, now, "sync");
    expect(mockComplete).toHaveBeenCalledWith(
      mockTx,
      scope,
      request,
      now,
      "SCOPED_OBJECT_RECHECKED",
    );
  });
  it("records a failed request independently while advancing the page", async () => {
    const { deps, capture, states } = dependencies();
    capture.mockRejectedValue(new Error("Capture failed"));
    await expect(
      runFinanceCaseRequestsReconciliation({ scope, mode: "sync" }, deps),
    ).resolves.toMatchObject({ status: "completed", exceptions: 1 });
    expect(states.fail).not.toHaveBeenCalled();
    expect(mockFailure).toHaveBeenCalledWith(
      mockTx,
      scope,
      request,
      now,
      "CAPTURE",
    );
    expect(mockComplete).not.toHaveBeenCalled();
  });
  it("does not replay or complete an already consumed request", async () => {
    mockRead.mockResolvedValue({
      data: [{ ...request, action: "REPLAY", evidenceId: "evidence" }],
      nextCursor: null,
    });
    mockPending.mockResolvedValue(false);
    const { deps } = dependencies();
    await runFinanceCaseRequestsReconciliation({ scope, mode: "sync" }, deps);
    expect(mockRequeue).not.toHaveBeenCalled();
    expect(mockComplete).not.toHaveBeenCalled();
  });
  it("reports dry-run rechecks without claiming state or completing requests", async () => {
    const { deps, states, capture } = dependencies();
    await runFinanceCaseRequestsReconciliation(
      { scope, mode: "dry-run" },
      deps,
    );
    expect(capture).toHaveBeenCalledWith(mockTx, scope, now, "dry-run");
    expect(states.claim).not.toHaveBeenCalled();
    expect(states.commitPage).not.toHaveBeenCalled();
    expect(mockComplete).not.toHaveBeenCalled();
    expect(mockRequeue).not.toHaveBeenCalled();
  });
  it("stops after one durable page even with a continuation", async () => {
    mockRead.mockResolvedValue({ data: [request], nextCursor: "next" });
    const { deps, states } = dependencies();
    await expect(
      runFinanceCaseRequestsReconciliation({ scope, mode: "sync" }, deps),
    ).resolves.toMatchObject({ status: "continued", pages: 1 });
    expect(states.commitPage).toHaveBeenCalledTimes(1);
  });
});
