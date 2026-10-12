import { randomUUID } from "node:crypto";
import {
  type BillingOperationStore,
  type ClaimedBillingOperation,
} from "./billing-operation.store";

export interface BillingOperationExecutor {
  execute(operationId: string): Promise<void>;
}

export class BillingOperationReviewError extends Error {}

const LEASE_MS = 5 * 60_000;
const OVERDUE_MS = 30 * 60_000;
const MAX_ATTEMPTS = 8;
const BATCH_SIZE = 50;

export class BillingWorkerJob {
  constructor(
    private readonly store: BillingOperationStore,
    private readonly executor: BillingOperationExecutor,
  ) {}

  async run(now = new Date()): Promise<{
    completed: number;
    retried: number;
    reviewRequired: number;
    overdue: number;
  }> {
    const token = randomUUID();
    const claimed = await this.store.claim(
      now,
      new Date(now.getTime() + LEASE_MS),
      token,
      BATCH_SIZE,
    );
    let completed = 0;
    let retried = 0;
    for (const operation of claimed) {
      try {
        await this.executor.execute(operation.id);
        if (await this.store.complete(operation, new Date())) completed += 1;
      } catch (error) {
        const message = errorMessage(error);
        if (
          error instanceof BillingOperationReviewError ||
          operation.attempts >= MAX_ATTEMPTS
        ) {
          await this.store.review(operation, message);
        } else {
          const retryAt = retryTime(operation, now);
          if (await this.store.retry(operation, retryAt, message)) retried += 1;
        }
      }
    }
    const alerts = await this.store.alertCounts(
      new Date(now.getTime() - OVERDUE_MS),
    );
    return {
      completed,
      retried,
      reviewRequired: alerts.needsReview,
      overdue: alerts.overdue,
    };
  }
}

function retryTime(operation: ClaimedBillingOperation, now: Date): Date {
  const minutes = Math.min(60, 2 ** Math.min(operation.attempts, 6));
  return new Date(now.getTime() + minutes * 60_000);
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message.slice(0, 1_000)
    : "Billing operation failed";
}
