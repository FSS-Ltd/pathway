import { prisma } from "@pathway/db";
import { FinanceStripeReconciliationError } from "../../stripe/finance-stripe-reconciliation.provider";
import type { FinanceReconciliationStateRepository } from "../finance-reconciliation-state.repository";
import type { FinanceReconciliationLease } from "../finance-reconciliation.types";
import {
  runFinanceReconciliation,
  type FinanceReconciliationPageInput,
} from "../finance-reconciliation-runner";

const now = new Date("2026-10-23T12:00:00Z");
const scope = {
  connectionId: "connection",
  tenantId: "tenant",
  orgId: "org",
  stripeAccountId: "acct_school",
  livemode: false,
};
const window = {
  from: new Date("2026-10-16T12:00:00Z"),
  to: now,
  cursor: null,
  gap: null,
};
const lease: FinanceReconciliationLease = {
  scope,
  stream: "refunds",
  stateId: "state",
  token: "claim",
  window,
};
const object = {
  id: "re_example",
  object: "refund",
  created: now.getTime() / 1000,
  livemode: false,
};
const input = { scope, stream: "refunds" as const, mode: "sync" as const };

function dependencies() {
  const states = {
    preview: jest
      .fn<
        ReturnType<FinanceReconciliationStateRepository["preview"]>,
        Parameters<FinanceReconciliationStateRepository["preview"]>
      >()
      .mockResolvedValue(window),
    claim: jest
      .fn<
        ReturnType<FinanceReconciliationStateRepository["claim"]>,
        Parameters<FinanceReconciliationStateRepository["claim"]>
      >()
      .mockResolvedValue(lease),
    commitPage: jest
      .fn<
        ReturnType<FinanceReconciliationStateRepository["commitPage"]>,
        Parameters<FinanceReconciliationStateRepository["commitPage"]>
      >()
      .mockImplementation(async (_lease, _cursor, _now, persist) => {
        await persist(prisma);
        return { kind: "completed" };
      }),
    release: jest
      .fn<
        ReturnType<FinanceReconciliationStateRepository["release"]>,
        Parameters<FinanceReconciliationStateRepository["release"]>
      >()
      .mockResolvedValue(),
    fail: jest
      .fn<
        ReturnType<FinanceReconciliationStateRepository["fail"]>,
        Parameters<FinanceReconciliationStateRepository["fail"]>
      >()
      .mockResolvedValue(),
  };
  const provider = {
    listPage: jest.fn().mockResolvedValue({ data: [object], nextCursor: null }),
  };
  const handlePage = jest
    .fn<
      Promise<{ recoverable: number; exceptions: number }>,
      [FinanceReconciliationPageInput]
    >()
    .mockResolvedValue({ recoverable: 1, exceptions: 0 });
  const preparePage = async (
    _scope: typeof scope,
    _stream: FinanceReconciliationLease["stream"],
    objects: (typeof object)[],
  ) => objects;
  return { states, provider, preparePage, handlePage, clock: () => now };
}

describe("bounded Finance reconciliation", () => {
  it("finishes remote enrichment before opening the page transaction", async () => {
    const deps = dependencies();
    let prepared = false;
    deps.preparePage = async () => {
      expect(deps.states.commitPage).not.toHaveBeenCalled();
      prepared = true;
      return [{ ...object, payment_intent: "pi_verified" }];
    };
    deps.handlePage.mockImplementation(async (page) => {
      expect(prepared).toBe(true);
      expect(page.objects[0]).toHaveProperty("payment_intent", "pi_verified");
      return { recoverable: 1, exceptions: 0 };
    });
    expect(await runFinanceReconciliation(input, deps)).toMatchObject({
      status: "completed",
    });
  });

  it("retains the cursor when provider enrichment fails", async () => {
    const deps = dependencies();
    deps.preparePage = async () => {
      throw new FinanceStripeReconciliationError("UNAVAILABLE");
    };
    expect(await runFinanceReconciliation(input, deps)).toMatchObject({
      status: "failed",
      reason: "UNAVAILABLE",
      pages: 0,
    });
    expect(deps.states.commitPage).not.toHaveBeenCalled();
  });
  it("counts evidence only after its transaction commits", async () => {
    const deps = dependencies();
    expect(await runFinanceReconciliation(input, deps)).toMatchObject({
      status: "completed",
      pages: 1,
      objects: 1,
      recoverable: 1,
    });
    expect(deps.handlePage).toHaveBeenCalledWith({
      mode: "capture",
      tx: prisma,
      scope,
      stream: "refunds",
      objects: [object],
      now,
    });
    expect(deps.states.release).not.toHaveBeenCalled();
  });
  it("makes dry-run pages inspectable without claiming, committing or changing coverage", async () => {
    const deps = dependencies();
    const result = await runFinanceReconciliation(
      { ...input, mode: "dry-run" },
      deps,
    );
    expect(result).toMatchObject({
      mode: "dry-run",
      status: "completed",
      pages: 1,
      objects: 1,
      recoverable: 1,
    });
    expect(deps.handlePage).toHaveBeenCalledWith({
      mode: "dry-run",
      scope,
      stream: "refunds",
      objects: [object],
      now,
    });
    for (const method of [
      deps.states.claim,
      deps.states.commitPage,
      deps.states.release,
      deps.states.fail,
    ])
      expect(method).not.toHaveBeenCalled();
  });

  it("does not read Stripe when another worker owns the lease", async () => {
    const deps = dependencies();
    deps.states.claim.mockResolvedValue(null);
    expect(await runFinanceReconciliation(input, deps)).toMatchObject({
      status: "busy",
      pages: 0,
    });
    expect(deps.provider.listPage).not.toHaveBeenCalled();
  });

  it("carries a fixed window and cursor across bounded dry-run pages", async () => {
    const deps = dependencies();
    deps.provider.listPage
      .mockResolvedValueOnce({ data: [object], nextCursor: "re_example" })
      .mockResolvedValueOnce({ data: [], nextCursor: null });
    expect(
      await runFinanceReconciliation({ ...input, mode: "dry-run" }, deps),
    ).toMatchObject({ status: "completed", pages: 2, objects: 1 });
    expect(deps.provider.listPage).toHaveBeenNthCalledWith(
      2,
      scope,
      "refunds",
      { from: window.from, to: now, startingAfter: "re_example", pageSize: 10 },
    );
  });

  it("returns a durable continuation at a configured job page budget", async () => {
    const deps = { ...dependencies(), maxPages: 1 };
    deps.provider.listPage.mockResolvedValue({
      data: [object],
      nextCursor: "re_continued",
    });
    deps.states.commitPage.mockImplementation(async (current, nextCursor) => ({
      kind: "continued",
      lease: { ...current, window: { ...current.window, cursor: nextCursor } },
    }));
    expect(
      await runFinanceReconciliation({ ...input, mode: "sync" }, deps),
    ).toMatchObject({ status: "continued", pages: 1 });
    expect(deps.provider.listPage).toHaveBeenCalledTimes(1);
  });

  it("stops after ten pages and releases the persisted continuation", async () => {
    const deps = dependencies();
    let page = 0;
    deps.provider.listPage.mockImplementation(async () => ({
      data: [object],
      nextCursor: `re_page_${++page}`,
    }));
    deps.states.commitPage.mockImplementation(async (current, nextCursor) => ({
      kind: "continued",
      lease: { ...current, window: { ...current.window, cursor: nextCursor } },
    }));
    expect(await runFinanceReconciliation(input, deps)).toMatchObject({
      status: "continued",
      pages: 10,
      objects: 10,
    });
    expect(deps.provider.listPage).toHaveBeenCalledTimes(10);
    expect(deps.states.release).toHaveBeenCalledWith(
      expect.objectContaining({
        window: expect.objectContaining({ cursor: "re_page_10" }),
      }),
    );
  });

  it("does not call the capture handler when the page lease has been lost", async () => {
    const deps = dependencies();
    deps.states.commitPage.mockResolvedValue({ kind: "lost" });
    expect(await runFinanceReconciliation(input, deps)).toMatchObject({
      status: "lost",
      pages: 0,
      objects: 0,
    });
    expect(deps.handlePage).not.toHaveBeenCalled();
  });

  it("records a provider outage without claiming completion", async () => {
    const deps = dependencies();
    deps.provider.listPage.mockRejectedValue(
      new FinanceStripeReconciliationError("UNAVAILABLE"),
    );
    expect(await runFinanceReconciliation(input, deps)).toMatchObject({
      status: "failed",
      reason: "UNAVAILABLE",
      pages: 0,
    });
    expect(deps.states.fail).toHaveBeenCalledWith(lease, "UNAVAILABLE", now);
    expect(deps.states.commitPage).not.toHaveBeenCalled();
  });

  it("does not persist failures in dry-run mode", async () => {
    const deps = dependencies();
    deps.provider.listPage.mockRejectedValue(
      new FinanceStripeReconciliationError("INVALID_CURSOR"),
    );
    expect(
      await runFinanceReconciliation({ ...input, mode: "dry-run" }, deps),
    ).toMatchObject({ status: "failed", reason: "INVALID_CURSOR" });
    expect(deps.states.fail).not.toHaveBeenCalled();
  });

  it("keeps a failed capture distinct from provider unavailability", async () => {
    const deps = dependencies();
    deps.states.commitPage.mockRejectedValue(new Error("Inbox insert failed"));
    expect(await runFinanceReconciliation(input, deps)).toMatchObject({
      status: "failed",
      reason: "CAPTURE_FAILED",
    });
    expect(deps.states.fail).toHaveBeenCalledWith(lease, "CAPTURE_FAILED", now);
  });
});
