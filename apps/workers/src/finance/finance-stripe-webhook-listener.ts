import {
  FinanceWebhookSubscriptionError,
  type FinanceWebhookFailure,
} from "./finance-webhook-subscription-error";
import type {
  FinanceWebhookListenerOptions,
  FinanceWebhookListenerState,
  FinanceWebhookSubscription,
} from "./finance-webhook-subscription";

export type {
  FinanceWebhookSubscription,
  FinanceWebhookWakePlan,
} from "./finance-webhook-subscription";

const MAX_TIMER_MS = 2_147_483_647;
const SHUTDOWN_MS = 30_000;

/** Notifications are hints. Only the subscribed database's durable plan is read. */
export class FinanceStripeWebhookListener {
  private currentState: FinanceWebhookListenerState = "stopped";
  private started = false;
  private readonly stopping = new AbortController();
  private connection = new AbortController();
  private source: FinanceWebhookSubscription | null = null;
  private closing: Promise<void> | null = null;
  private active: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending = false;
  private failure: unknown = null;
  private reconnectAttempts = 0;

  constructor(private readonly options: FinanceWebhookListenerOptions) {}

  get state(): FinanceWebhookListenerState {
    return this.currentState;
  }

  start(): Promise<void> {
    if (this.started)
      throw new Error("Finance webhook listener already started");
    this.started = true;
    this.setState("starting");
    this.pending = true;
    return this.kick();
  }

  async stop(): Promise<void> {
    this.stopping.abort();
    this.connection.abort();
    this.pending = false;
    this.clearTimer();
    const settled = Promise.all([this.closeSource(), this.active]);
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        settled,
        new Promise<never>((_resolve, reject) => {
          deadline = setTimeout(
            () =>
              reject(
                new Error("Finance webhook shutdown exceeded its deadline"),
              ),
            SHUTDOWN_MS,
          );
        }),
      ]);
      this.setState("stopped");
    } finally {
      if (deadline) clearTimeout(deadline);
    }
  }

  private kick(): Promise<void> {
    if (this.stopping.signal.aborted || this.state === "failed")
      return Promise.resolve();
    if (!this.active) {
      this.active = this.pump().finally(() => {
        this.active = null;
        if (this.pending) void this.kick();
      });
    }
    return this.active;
  }

  private wake(source: FinanceWebhookSubscription): void {
    if (this.source !== source || this.stopping.signal.aborted) return;
    this.clearTimer();
    this.pending = true;
    void this.kick();
  }

  private async connect(): Promise<void> {
    await this.closing;
    if (this.stopping.signal.aborted) return;
    this.closing = null;
    this.connection = new AbortController();
    const source = this.options.createSubscription();
    this.source = source;
    await source.start(
      () => this.wake(source),
      (error) => {
        if (this.source !== source || this.stopping.signal.aborted) return;
        this.failure =
          error instanceof FinanceWebhookSubscriptionError
            ? error
            : new FinanceWebhookSubscriptionError("CONFIGURATION");
        this.connection.abort();
        // Closing interrupts a pending read; the active pump remains serial.
        void this.closeSource().catch(() => undefined);
        this.pending = true;
        void this.kick();
      },
    );
    if (this.failure) throw this.failure;
    if (this.stopping.signal.aborted) return;
    this.setState("listening");
  }

  private async pump(): Promise<void> {
    let zeroProgress = 0;
    try {
      if (this.failure) throw this.failure;
      if (!this.source) await this.connect();
      while (this.pending && !this.stopping.signal.aborted) {
        this.pending = false;
        if (this.failure) throw this.failure;
        const source = this.source;
        if (!source) return;
        const plan = await source.readPlan(new Date());
        if (this.failure) throw this.failure;
        if (this.source !== source || this.stopping.signal.aborted) return;
        this.reconnectAttempts = 0;
        if (plan.scopes.length === 0) {
          if (!this.pending && plan.nextWakeAt)
            this.armDeadline(plan.nextWakeAt);
          continue;
        }
        const result = await this.options.runScopes(
          plan.scopes,
          this.connection.signal,
        );
        if (this.failure) throw this.failure;
        if (this.stopping.signal.aborted) return;
        this.pending = true;
        const progressed = Object.values(result).some((count) => count > 0);
        zeroProgress = progressed ? 0 : zeroProgress + 1;
        if (zeroProgress >= 2) {
          this.pending = false;
          this.armDelay(250);
          return;
        }
      }
    } catch (error) {
      await this.recover(error);
    }
  }

  private async recover(error: unknown): Promise<void> {
    this.failure = null;
    this.pending = false;
    this.clearTimer();
    this.connection.abort();
    try {
      await this.closeSource();
    } catch {
      // The subscription is already unusable. Its original failure decides
      // whether reconnecting is appropriate; no close error is logged raw.
    }
    if (this.stopping.signal.aborted) return;
    if (
      error instanceof FinanceWebhookSubscriptionError &&
      error.reason === "CONNECTION"
    ) {
      this.setState("reconnecting", "CONNECTION");
      const delay = Math.min(
        30_000,
        250 * 2 ** Math.min(this.reconnectAttempts, 7),
      );
      this.reconnectAttempts++;
      this.armDelay(delay);
    } else {
      this.setState(
        "failed",
        error instanceof FinanceWebhookSubscriptionError
          ? error.reason
          : "CONFIGURATION",
      );
    }
  }

  private closeSource(): Promise<void> {
    if (this.source) {
      const source = this.source;
      this.source = null;
      this.closing = source.close();
    }
    return this.closing ?? Promise.resolve();
  }

  private armDeadline(at: Date): void {
    if (!Number.isFinite(at.getTime()))
      throw new FinanceWebhookSubscriptionError("CONFIGURATION");
    const remaining = at.getTime() - Date.now();
    if (remaining > MAX_TIMER_MS) {
      this.clearTimer();
      this.timer = setTimeout(() => this.armDeadline(at), MAX_TIMER_MS);
    } else {
      this.armDelay(Math.max(1, remaining));
    }
  }

  private armDelay(delay: number): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.stopping.signal.aborted) return;
      this.pending = true;
      void this.kick();
    }, delay);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private setState(
    state: FinanceWebhookListenerState,
    reason?: FinanceWebhookFailure,
  ): void {
    this.currentState = state;
    this.options.onState?.(state, reason);
  }
}
