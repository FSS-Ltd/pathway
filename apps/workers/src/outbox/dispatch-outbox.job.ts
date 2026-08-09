import { prisma, type Prisma } from "@pathway/db";

export type OutboxIntentForDispatch = {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Prisma.JsonValue;
  idempotencyKey: string;
};

type PendingOutboxEvent = OutboxIntentForDispatch & {
  id: string;
  attempts: number;
};

export interface OutboxDispatchClient {
  outboxEvent: {
    findMany(args: unknown): Promise<PendingOutboxEvent[]>;
    updateMany(args: unknown): Promise<{ count: number }>;
    update(args: unknown): Promise<unknown>;
  };
}

export interface OutboxDispatcher {
  dispatch(intent: OutboxIntentForDispatch): Promise<void>;
}

const outboxClient = prisma as unknown as OutboxDispatchClient;
const MAX_ATTEMPTS = 5;

/**
 * Claims durable outbox events with a conditional update before dispatching.
 * The claim is what prevents two worker processes from delivering one key twice.
 */
export class DispatchOutboxJob {
  constructor(
    private readonly client: OutboxDispatchClient = outboxClient,
    private readonly dispatcher: OutboxDispatcher = {
      dispatch: async () => undefined,
    },
  ) {}

  async run(
    now: Date = new Date(),
  ): Promise<{ dispatched: number; retried: number; deadLettered: number }> {
    const events = await this.client.outboxEvent.findMany({
      where: { status: "PENDING", nextAttemptAt: { lte: now } },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    const result = { dispatched: 0, retried: 0, deadLettered: 0 };
    for (const event of events) {
      const claim = await this.client.outboxEvent.updateMany({
        where: { id: event.id, status: "PENDING" },
        data: { status: "PROCESSING", attempts: { increment: 1 } },
      });
      if (claim.count !== 1) continue;
      try {
        await this.dispatcher.dispatch(toIntent(event));
        await this.client.outboxEvent.update({
          where: { id: event.id },
          data: { status: "DISPATCHED", dispatchedAt: now, lastError: null },
        });
        result.dispatched += 1;
      } catch (error) {
        const attempts = event.attempts + 1;
        const deadLetter = attempts >= MAX_ATTEMPTS;
        await this.client.outboxEvent.update({
          where: { id: event.id },
          data: deadLetter
            ? {
                status: "DEAD_LETTER",
                failedAt: now,
                lastError: errorMessage(error),
              }
            : {
                status: "PENDING",
                nextAttemptAt: new Date(now.getTime() + attempts * 60_000),
                lastError: errorMessage(error),
              },
        });
        if (deadLetter) result.deadLettered += 1;
        else result.retried += 1;
      }
    }
    return result;
  }
}

function toIntent(event: PendingOutboxEvent): OutboxIntentForDispatch {
  const { aggregateType, aggregateId, eventType, payload, idempotencyKey } =
    event;
  return { aggregateType, aggregateId, eventType, payload, idempotencyKey };
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message.slice(0, 1_000)
    : "Outbox dispatch failed";
}
