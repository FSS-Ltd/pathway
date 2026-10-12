import {
  BillingOperationReviewError,
  BillingWorkerJob,
  type BillingOperationExecutor,
} from "../billing-worker.job";
import {
  type BillingOperationStore,
  type ClaimedBillingOperation,
} from "../billing-operation.store";

const now = new Date("2026-10-12T12:00:00.000Z");
const claimed: ClaimedBillingOperation = {
  id: "operation-1",
  orgId: "org-1",
  attempts: 1,
  dueAt: new Date("2026-10-12T11:59:00.000Z"),
  claimToken: "token-1",
};

function setup(operation: ClaimedBillingOperation = claimed) {
  const store: jest.Mocked<BillingOperationStore> = {
    claim: jest.fn().mockResolvedValue([operation]),
    complete: jest.fn().mockResolvedValue(true),
    retry: jest.fn().mockResolvedValue(true),
    review: jest.fn().mockResolvedValue(true),
    alertCounts: jest.fn().mockResolvedValue({ overdue: 0, needsReview: 0 }),
  };
  const executor: jest.Mocked<BillingOperationExecutor> = {
    execute: jest.fn().mockResolvedValue(undefined),
  };
  return { store, executor, job: new BillingWorkerJob(store, executor) };
}

describe("BillingWorkerJob", () => {
  it("claims with a lease and completes only the owned operation", async () => {
    const { store, executor, job } = setup();
    await expect(job.run(now)).resolves.toEqual({
      completed: 1,
      retried: 0,
      reviewRequired: 0,
      overdue: 0,
    });
    expect(store.claim).toHaveBeenCalledWith(
      now,
      new Date("2026-10-12T12:05:00.000Z"),
      expect.any(String),
      50,
    );
    expect(executor.execute).toHaveBeenCalledWith("operation-1");
    expect(store.complete).toHaveBeenCalledWith(claimed, expect.any(Date));
  });

  it("retries transient failures with a future due time", async () => {
    const { store, executor, job } = setup();
    executor.execute.mockRejectedValue(new Error("provider timeout"));
    await expect(job.run(now)).resolves.toMatchObject({ retried: 1 });
    expect(store.retry).toHaveBeenCalledWith(
      claimed,
      new Date("2026-10-12T12:02:00.000Z"),
      "provider timeout",
    );
    expect(store.complete).not.toHaveBeenCalled();
  });

  it("sends permanent failures and exhausted retries to review", async () => {
    const { store, executor, job } = setup();
    executor.execute.mockRejectedValue(
      new BillingOperationReviewError("stale snapshot"),
    );
    store.alertCounts.mockResolvedValue({ overdue: 0, needsReview: 1 });
    await expect(job.run(now)).resolves.toMatchObject({ reviewRequired: 1 });
    expect(store.review).toHaveBeenCalledWith(claimed, "stale snapshot");
    expect(store.retry).not.toHaveBeenCalled();

    const exhausted = setup({ ...claimed, attempts: 8 });
    exhausted.executor.execute.mockRejectedValue(
      new Error("uncertain provider result"),
    );
    await exhausted.job.run(now);
    expect(exhausted.store.review).toHaveBeenCalled();
  });

  it("does not count a stale worker's completion and reports overdue work", async () => {
    const { store, job } = setup();
    store.complete.mockResolvedValue(false);
    store.alertCounts.mockResolvedValue({ overdue: 2, needsReview: 0 });
    await expect(job.run(now)).resolves.toMatchObject({
      completed: 0,
      overdue: 2,
    });
    expect(store.alertCounts).toHaveBeenCalledWith(
      new Date("2026-10-12T11:30:00.000Z"),
    );
  });
});
