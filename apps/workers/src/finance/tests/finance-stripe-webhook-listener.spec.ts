import {
  FinanceStripeWebhookListener,
  type FinanceWebhookSubscription,
  type FinanceWebhookWakePlan,
} from "../finance-stripe-webhook-listener";
import { FinanceWebhookSubscriptionError } from "../finance-webhook-subscription-error";
import type { FinanceWebhookFailure } from "../finance-webhook-subscription-error";
import type { FinanceWebhookListenerState } from "../finance-webhook-subscription";
import type {
  FinanceStripeWebhookRunResult,
  FinanceStripeWebhookScope,
} from "../finance-stripe-webhook.job";

const scope = { tenantId: "tenant-a", orgId: "org-a" };
const empty: FinanceWebhookWakePlan = { scopes: [], nextWakeAt: null };
const processed = { completed: 1, deferred: 0, retried: 0, deadLettered: 0 };

function subscription() {
  let wake = () => {};
  let disconnect: (error: unknown) => void = () => {};
  const source: jest.Mocked<FinanceWebhookSubscription> = {
    start: jest.fn(async (onWake, onDisconnect) => {
      wake = onWake;
      disconnect = onDisconnect;
    }),
    readPlan: jest.fn().mockResolvedValue(empty),
    close: jest.fn().mockResolvedValue(undefined),
  };
  return {
    source,
    wake: () => wake(),
    disconnect: (error: unknown) => disconnect(error),
  };
}

function setup() {
  const first = subscription();
  const next = subscription();
  const createSubscription = jest
    .fn<FinanceWebhookSubscription, []>()
    .mockReturnValueOnce(first.source)
    .mockReturnValue(next.source);
  const runScopes = jest
    .fn<
      Promise<FinanceStripeWebhookRunResult>,
      [readonly FinanceStripeWebhookScope[], AbortSignal]
    >()
    .mockResolvedValue(processed);
  const onState = jest.fn<
    void,
    [FinanceWebhookListenerState, FinanceWebhookFailure?]
  >();
  const listener = new FinanceStripeWebhookListener({
    createSubscription,
    runScopes,
    onState,
  });
  return { listener, first, next, createSubscription, runScopes, onState };
}

describe("event-driven Finance inbox delivery", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-10-23T21:00:00Z"));
  });
  afterEach(() => jest.useRealTimers());

  it("subscribes before catch-up and makes no further SQL discovery while idle", async () => {
    const f = setup();
    await f.listener.start();
    expect(f.first.source.start.mock.invocationCallOrder[0]).toBeLessThan(
      f.first.source.readPlan.mock.invocationCallOrder[0],
    );
    await jest.advanceTimersByTimeAsync(24 * 60 * 60_000);
    expect(f.first.source.readPlan).toHaveBeenCalledTimes(1);
    expect(f.runScopes).not.toHaveBeenCalled();
    await f.listener.stop();
    expect(jest.getTimerCount()).toBe(0);
  });

  it("drains subsequent batches after a single coalesced wake", async () => {
    const f = setup();
    f.first.source.readPlan
      .mockResolvedValueOnce({ scopes: [scope], nextWakeAt: null })
      .mockResolvedValueOnce({ scopes: [scope], nextWakeAt: null })
      .mockResolvedValueOnce(empty);
    await f.listener.start();
    expect(f.runScopes).toHaveBeenCalledTimes(2);
    expect(f.first.source.readPlan).toHaveBeenCalledTimes(3);
    await f.listener.stop();
  });

  it("coalesces duplicate notifications and never runs concurrent pumps", async () => {
    const f = setup();
    await f.listener.start();
    let release: (plan: FinanceWebhookWakePlan) => void = () => {};
    f.first.source.readPlan.mockImplementationOnce(
      () => new Promise((resolve) => (release = resolve)),
    );
    for (let duplicate = 0; duplicate < 20; duplicate++) f.first.wake();
    expect(f.first.source.readPlan).toHaveBeenCalledTimes(2);
    release(empty);
    await jest.advanceTimersByTimeAsync(0);
    expect(f.first.source.readPlan).toHaveBeenCalledTimes(3);
    expect(f.runScopes).not.toHaveBeenCalled();
    await f.listener.stop();
  });

  it("wakes at a persisted deadline, then becomes idle again", async () => {
    const f = setup();
    f.first.source.readPlan
      .mockResolvedValueOnce({
        scopes: [],
        nextWakeAt: new Date("2026-10-23T21:01:00Z"),
      })
      .mockResolvedValueOnce({ scopes: [scope], nextWakeAt: null })
      .mockResolvedValueOnce(empty);
    await f.listener.start();
    await jest.advanceTimersByTimeAsync(59_999);
    expect(f.first.source.readPlan).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(f.runScopes).toHaveBeenCalledTimes(1);
    expect(f.first.source.readPlan).toHaveBeenCalledTimes(3);
    await jest.advanceTimersByTimeAsync(60 * 60_000);
    expect(f.first.source.readPlan).toHaveBeenCalledTimes(3);
    await f.listener.stop();
  });

  it("re-subscribes before reconnect catch-up after connection loss", async () => {
    const f = setup();
    await f.listener.start();
    f.next.source.readPlan
      .mockResolvedValueOnce({ scopes: [scope], nextWakeAt: null })
      .mockResolvedValueOnce(empty);
    f.first.disconnect(new FinanceWebhookSubscriptionError("CONNECTION"));
    await jest.advanceTimersByTimeAsync(250);
    expect(f.next.source.start).toHaveBeenCalledTimes(1);
    expect(f.next.source.start.mock.invocationCallOrder[0]).toBeLessThan(
      f.next.source.readPlan.mock.invocationCallOrder[0],
    );
    expect(f.runScopes).toHaveBeenCalledTimes(1);
    await f.listener.stop();
  });

  it("stops intake on revoked query permission without a discovery loop", async () => {
    const f = setup();
    f.first.source.readPlan.mockRejectedValue(
      new FinanceWebhookSubscriptionError("PERMISSION"),
    );
    await f.listener.start();
    await jest.advanceTimersByTimeAsync(60 * 60_000);
    expect(f.listener.state).toBe("failed");
    expect(f.onState).toHaveBeenCalledWith("failed", "PERMISSION");
    expect(f.first.source.readPlan).toHaveBeenCalledTimes(1);
    expect(f.createSubscription).toHaveBeenCalledTimes(1);
    expect(f.first.source.close).toHaveBeenCalledTimes(1);
    await f.listener.stop();
  });

  it("bounds zero-progress contention instead of spinning on due scopes", async () => {
    const f = setup();
    f.first.source.readPlan.mockResolvedValue({
      scopes: [scope],
      nextWakeAt: null,
    });
    f.runScopes.mockResolvedValue({ ...processed, completed: 0 });
    await f.listener.start();
    expect(f.runScopes).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(249);
    expect(f.runScopes).toHaveBeenCalledTimes(2);
    await f.listener.stop();
  });

  it("aborts active work and discards queued notifications on shutdown", async () => {
    const f = setup();
    await f.listener.start();
    f.first.source.readPlan.mockResolvedValue({
      scopes: [scope],
      nextWakeAt: null,
    });
    let finish: () => void = () => {};
    f.runScopes.mockImplementationOnce(
      () => new Promise((resolve) => (finish = () => resolve(processed))),
    );
    f.first.wake();
    await Promise.resolve();
    const signal: AbortSignal = f.runScopes.mock.calls[0][1];
    f.first.wake();
    const stopped = f.listener.stop();
    expect(signal.aborted).toBe(true);
    finish();
    await stopped;
    f.first.wake();
    await jest.advanceTimersByTimeAsync(60 * 60_000);
    expect(f.runScopes).toHaveBeenCalledTimes(1);
    expect(f.first.source.close).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("does not open a subscription when stopped immediately after start", async () => {
    const f = setup();
    try {
      const starting = f.listener.start();
      const stopping = f.listener.stop();
      await Promise.all([starting, stopping]);
      expect(f.createSubscription).not.toHaveBeenCalled();
      expect(f.listener.state).toBe("stopped");
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      await f.listener.stop();
    }
  });
});
