import { applyTenantContext, runTransaction, type Prisma } from "@pathway/db";

export type OutboxIntentForDispatch = {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Prisma.JsonValue;
  idempotencyKey: string;
};

type PendingOutboxEvent = OutboxIntentForDispatch & {
  id: string;
  orgId: string;
  attempts: number;
  claimedAt: Date | null;
};

export interface OutboxEventDelegate {
  findMany(args: unknown): Promise<PendingOutboxEvent[]>;
  updateMany(args: unknown): Promise<{ count: number }>;
  update(args: unknown): Promise<unknown>;
}

export interface OutboxDispatchClient {
  findOrgIds(): Promise<string[]>;
  runForOrg<T>(
    orgId: string,
    callback: (events: OutboxEventDelegate) => Promise<T>,
  ): Promise<T>;
}

export interface OutboxDispatcher {
  dispatch(intent: OutboxIntentForDispatch): Promise<void>;
}

const MAX_ATTEMPTS = 5;
const CLAIM_LEASE_MS = 5 * 60_000;

const productionClient: OutboxDispatchClient = {
  async findOrgIds() {
    return parseOutboxOrgIds(process.env.OUTBOX_ORG_IDS);
  },
  async runForOrg<T>(
    orgId: string,
    callback: (events: OutboxEventDelegate) => Promise<T>,
  ): Promise<T> {
    return runTransaction(async (tx) => {
      await applyTenantContext(tx, "", orgId);
      return callback(tx.outboxEvent);
    });
  },
};

/**
 * Claims each event in an organisation-scoped transaction before an external
 * dispatcher runs. The dispatcher must be supplied by the runtime so an event
 * can never be silently acknowledged without a real delivery mechanism.
 */
export class DispatchOutboxJob {
  constructor(
    private readonly client: OutboxDispatchClient,
    private readonly dispatcher: OutboxDispatcher,
  ) {}

  async run(
    now: Date = new Date(),
  ): Promise<{ dispatched: number; retried: number; deadLettered: number }> {
    const result = { dispatched: 0, retried: 0, deadLettered: 0 };
    const leaseCutoff = new Date(now.getTime() - CLAIM_LEASE_MS);
    for (const orgId of await this.client.findOrgIds()) {
      const claimed = await this.client.runForOrg(orgId, async (events) => {
        const candidates = await events.findMany({
          where: {
            OR: [
              { status: "PENDING", nextAttemptAt: { lte: now } },
              { status: "PROCESSING", claimedAt: { lte: leaseCutoff } },
            ],
          },
          orderBy: { createdAt: "asc" },
          take: 100,
        });
        const owned: PendingOutboxEvent[] = [];
        for (const event of candidates) {
          const claim = await events.updateMany({
            where: {
              id: event.id,
              OR: [
                { status: "PENDING" },
                { status: "PROCESSING", claimedAt: { lte: leaseCutoff } },
              ],
            },
            data: {
              status: "PROCESSING",
              attempts: { increment: 1 },
              claimedAt: now,
            },
          });
          if (claim.count === 1) owned.push(event);
        }
        return owned;
      });
      for (const event of claimed) {
        try {
          await this.dispatcher.dispatch(toIntent(event));
          await this.client.runForOrg(orgId, (events) =>
            events.update({
              where: { id: event.id },
              data: {
                status: "DISPATCHED",
                dispatchedAt: now,
                claimedAt: null,
                lastError: null,
              },
            }),
          );
          result.dispatched += 1;
        } catch (error) {
          const attempts = event.attempts + 1;
          const deadLetter = attempts >= MAX_ATTEMPTS;
          await this.client.runForOrg(orgId, (events) =>
            events.update({
              where: { id: event.id },
              data: deadLetter
                ? {
                    status: "DEAD_LETTER",
                    failedAt: now,
                    claimedAt: null,
                    lastError: errorMessage(error),
                  }
                : {
                    status: "PENDING",
                    nextAttemptAt: new Date(now.getTime() + attempts * 60_000),
                    claimedAt: null,
                    lastError: errorMessage(error),
                  },
            }),
          );
          if (deadLetter) result.deadLettered += 1;
          else result.retried += 1;
        }
      }
    }
    return result;
  }
}

export function createDispatchOutboxJob(
  dispatcher: OutboxDispatcher,
): DispatchOutboxJob {
  return new DispatchOutboxJob(productionClient, dispatcher);
}

export function parseOutboxOrgIds(value: string | undefined): string[] {
  const orgIds = (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!orgIds.length) {
    throw new Error("OUTBOX_ORG_IDS is required for outbox dispatch");
  }
  return [...new Set(orgIds)];
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
