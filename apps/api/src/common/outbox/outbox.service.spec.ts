import type { Prisma } from "@pathway/db";
import { OutboxService, type OutboxIntent } from "./outbox.service";

const intent: OutboxIntent = {
  aggregateType: "user-access",
  aggregateId: "user-1",
  eventType: "access.assignment.changed",
  payload: {
    orgId: "org-1",
    assignmentId: "assignment-1",
    requestId: "request-1",
  },
  idempotencyKey: "access-assignment:request-1:assignment-1",
};

describe("OutboxService", () => {
  it("enqueues the exact shared intent without accepting caller-controlled tenancy", async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const findFirstOrThrow = jest
      .fn()
      .mockResolvedValue({ id: "event-1", ...intent });
    const service = new OutboxService();

    await expect(
      service.enqueue(
        {
          outboxEvent: { createMany, findFirstOrThrow },
        } as unknown as Prisma.TransactionClient,
        intent,
      ),
    ).resolves.toEqual({ id: "event-1", ...intent });

    expect(createMany).toHaveBeenCalledWith({
      data: [intent],
      skipDuplicates: true,
    });
    expect(findFirstOrThrow).toHaveBeenCalledWith({
      where: { idempotencyKey: intent.idempotencyKey },
    });
  });

  it("returns the original durable event for a duplicate idempotency key", async () => {
    const events = new Map<string, { id: string } & OutboxIntent>();
    const createMany = jest.fn().mockImplementation(
      async ({ data }: { data: OutboxIntent[] }) => {
        const event = data[0];
        if (!event || events.has(event.idempotencyKey)) return { count: 0 };
        events.set(event.idempotencyKey, { id: "event-1", ...event });
        return { count: 1 };
      },
    );
    const findFirstOrThrow = jest.fn().mockImplementation(
      async ({ where }: { where: { idempotencyKey: string } }) =>
        events.get(where.idempotencyKey),
    );
    const service = new OutboxService();
    const tx = {
      outboxEvent: { createMany, findFirstOrThrow },
    } as unknown as Prisma.TransactionClient;

    const first = await service.enqueue(tx, intent);
    const duplicate = await service.enqueue(tx, {
      ...intent,
      payload: { ignored: "duplicate payload must not replace the first event" },
    });

    expect(first).toEqual(duplicate);
    expect(events.size).toBe(1);
  });
});
