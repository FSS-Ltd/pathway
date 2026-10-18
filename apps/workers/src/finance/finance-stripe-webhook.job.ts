import { randomUUID } from "node:crypto";

export interface FinanceStripeWebhookScope {
  tenantId: string;
  orgId: string;
}

export interface ClaimedFinanceStripeWebhook extends FinanceStripeWebhookScope {
  id: string;
  claimToken: string;
  attempts: number;
}

export interface FinanceStripeWebhookStore {
  findDueScopes(now: Date): Promise<FinanceStripeWebhookScope[]>;
  claim(
    scope: FinanceStripeWebhookScope,
    now: Date,
    reclaimBefore: Date,
    claimToken: string,
    limit: number,
  ): Promise<ClaimedFinanceStripeWebhook[]>;
  renew(event: ClaimedFinanceStripeWebhook, claimedAt: Date): Promise<boolean>;
  complete(event: ClaimedFinanceStripeWebhook): Promise<boolean>;
  defer(event: ClaimedFinanceStripeWebhook): Promise<boolean>;
  retry(
    event: ClaimedFinanceStripeWebhook,
    nextAttemptAt: Date,
    error: string,
  ): Promise<boolean>;
  deadLetter(
    event: ClaimedFinanceStripeWebhook,
    error: string,
  ): Promise<boolean>;
}

export interface FinanceStripeWebhookProcessor {
  process(
    event: ClaimedFinanceStripeWebhook,
  ): Promise<"processed" | "deferred">;
}

const BATCH_SIZE = 50;
const CLAIM_LEASE_MS = 5 * 60_000;
const MAX_ATTEMPTS = 8;

export class FinanceStripeWebhookJob {
  constructor(
    private readonly store: FinanceStripeWebhookStore,
    private readonly processor: FinanceStripeWebhookProcessor,
  ) {}

  async run(now = new Date()): Promise<{
    completed: number;
    deferred: number;
    retried: number;
    deadLettered: number;
  }> {
    const result = { completed: 0, deferred: 0, retried: 0, deadLettered: 0 };

    for (const scope of await this.store.findDueScopes(now)) {
      const claimNow = new Date();
      const reclaimBefore = new Date(claimNow.getTime() - CLAIM_LEASE_MS);
      const claimed = await this.store.claim(
        scope,
        claimNow,
        reclaimBefore,
        randomUUID(),
        BATCH_SIZE,
      );
      for (const event of claimed) {
        try {
          if (!(await this.store.renew(event, new Date()))) continue;
          const disposition = await this.processor.process(event);
          const updated =
            disposition === "processed"
              ? await this.store.complete(event)
              : await this.store.defer(event);
          if (updated && disposition === "processed") result.completed += 1;
          if (updated && disposition === "deferred") result.deferred += 1;
        } catch (error) {
          const message = errorMessage(error);
          if (event.attempts >= MAX_ATTEMPTS) {
            if (await this.store.deadLetter(event, message)) {
              result.deadLettered += 1;
            }
          } else if (
            await this.store.retry(event, retryTime(event, now), message)
          ) {
            result.retried += 1;
          }
        }
      }
    }
    return result;
  }
}

function retryTime(event: ClaimedFinanceStripeWebhook, now: Date): Date {
  const minutes = Math.min(60, 2 ** Math.min(event.attempts, 6));
  return new Date(now.getTime() + minutes * 60_000);
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message.slice(0, 1_000)
    : "Finance Stripe webhook replay failed";
}
