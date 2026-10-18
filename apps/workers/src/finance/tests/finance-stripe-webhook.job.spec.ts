import {
  FinanceStripeWebhookJob,
  type ClaimedFinanceStripeWebhook,
  type FinanceStripeWebhookProcessor,
  type FinanceStripeWebhookStore,
} from "../finance-stripe-webhook.job";

function setup() {
  const event: ClaimedFinanceStripeWebhook = {
    id: "event-row-1",
    tenantId: "tenant-a",
    orgId: "org-a",
    claimToken: "claim-1",
    attempts: 1,
  };
  const store: jest.Mocked<FinanceStripeWebhookStore> = {
    findDueScopes: jest
      .fn()
      .mockResolvedValue([{ tenantId: "tenant-a", orgId: "org-a" }]),
    claim: jest.fn().mockResolvedValue([event]),
    complete: jest.fn().mockResolvedValue(true),
    defer: jest.fn().mockResolvedValue(true),
    retry: jest.fn().mockResolvedValue(true),
    deadLetter: jest.fn().mockResolvedValue(true),
  };
  const processor: jest.Mocked<FinanceStripeWebhookProcessor> = {
    process: jest.fn().mockResolvedValue("processed"),
  };
  return {
    event,
    store,
    processor,
    job: new FinanceStripeWebhookJob(store, processor),
  };
}

describe("FinanceStripeWebhookJob", () => {
  it("replays a claimed event and completes its lease", async () => {
    const { event, store, processor, job } = setup();

    const result = await job.run(new Date("2026-10-18T00:00:00.000Z"));

    expect(processor.process).toHaveBeenCalledWith(event);
    expect(store.complete).toHaveBeenCalledWith(event);
    expect(result).toEqual({
      completed: 1,
      deferred: 0,
      retried: 0,
      deadLettered: 0,
    });
  });

  it("defers event types that a later Finance step will handle", async () => {
    const { store, processor, job } = setup();
    processor.process.mockResolvedValue("deferred");

    const result = await job.run();

    expect(store.defer).toHaveBeenCalledTimes(1);
    expect(store.complete).not.toHaveBeenCalled();
    expect(result.deferred).toBe(1);
  });

  it("retries processor failures with bounded exponential delay", async () => {
    const { event, store, processor, job } = setup();
    processor.process.mockRejectedValue(new Error("temporary outage"));
    const now = new Date("2026-10-18T00:00:00.000Z");

    const result = await job.run(now);

    expect(store.retry).toHaveBeenCalledWith(
      event,
      new Date(now.getTime() + 2 * 60_000),
      "temporary outage",
    );
    expect(result.retried).toBe(1);
  });

  it("dead letters an event after the retry limit", async () => {
    const { event, store, processor, job } = setup();
    const exhausted = { ...event, attempts: 8 };
    store.claim.mockResolvedValue([exhausted]);
    processor.process.mockRejectedValue(new Error("permanent outage"));

    const result = await job.run();

    expect(store.deadLetter).toHaveBeenCalledWith(
      exhausted,
      "permanent outage",
    );
    expect(result.deadLettered).toBe(1);
  });
});
