import { Injectable } from "@nestjs/common";
import type { Prisma } from "@pathway/db";

export interface OutboxIntent {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Prisma.InputJsonValue;
  idempotencyKey: string;
}

@Injectable()
export class OutboxService {
  async enqueue(tx: Prisma.TransactionClient, intent: OutboxIntent) {
    await tx.outboxEvent.createMany({
      data: [intent],
      skipDuplicates: true,
    });
    return tx.outboxEvent.findFirstOrThrow({
      where: { idempotencyKey: intent.idempotencyKey },
    });
  }
}
