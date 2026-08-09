import {
  DispatchOutboxJob,
  type OutboxDispatcher,
  type OutboxDispatchClient,
} from "../dispatch-outbox.job";

const event = {
  id: "event-1",
  orgId: "org-1",
  aggregateType: "ace-notice",
  aggregateId: "notice-1",
  eventType: "ace.notice.published",
  payload: { noticeId: "notice-1" },
  idempotencyKey: "notice-1:published",
  attempts: 0,
  claimedAt: null,
};

function createClient(
  outboxEvent: OutboxDispatchClient["outboxEvent"],
): OutboxDispatchClient {
  return {
    findOrgIds: jest.fn().mockResolvedValue(["org-1"]),
    runForOrg: async <T>(
      _orgId: string,
      callback: (events: OutboxDispatchClient["outboxEvent"]) => Promise<T>,
    ) => callback(outboxEvent),
    outboxEvent,
  };
}

describe("DispatchOutboxJob", () => {
  it("claims a duplicate-key event once before dispatching it", async () => {
    const client = createClient({
      findMany: jest.fn().mockResolvedValue([event]),
      updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }),
      update: jest.fn().mockResolvedValue(undefined),
    });
    const dispatcher: jest.Mocked<OutboxDispatcher> = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    };

    await expect(
      new DispatchOutboxJob(client, dispatcher).run(),
    ).resolves.toEqual({
      dispatched: 1,
      retried: 0,
      deadLettered: 0,
    });

    expect(dispatcher.dispatch).toHaveBeenCalledWith({
      aggregateType: "ace-notice",
      aggregateId: "notice-1",
      eventType: "ace.notice.published",
      payload: { noticeId: "notice-1" },
      idempotencyKey: "notice-1:published",
    });
    expect(client.outboxEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "DISPATCHED" }),
      }),
    );
  });

  it("does not dispatch an event another worker already claimed", async () => {
    const client = createClient({
      findMany: jest.fn().mockResolvedValue([event]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn(),
    });
    const dispatcher: jest.Mocked<OutboxDispatcher> = { dispatch: jest.fn() };

    await expect(
      new DispatchOutboxJob(client, dispatcher).run(),
    ).resolves.toEqual({
      dispatched: 0,
      retried: 0,
      deadLettered: 0,
    });
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it("reclaims an expired processing lease after a worker crash", async () => {
    const client = createClient({
      findMany: jest.fn().mockResolvedValue([
        {
          ...event,
          attempts: 1,
          claimedAt: new Date("2026-08-09T10:00:00.000Z"),
        },
      ]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue(undefined),
    });
    const dispatcher: jest.Mocked<OutboxDispatcher> = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    };

    await new DispatchOutboxJob(client, dispatcher).run(
      new Date("2026-08-09T10:10:00.000Z"),
    );

    expect(client.outboxEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ OR: expect.any(Array) }),
      }),
    );
    expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
  });

  it("dead-letters the fifth failed delivery attempt", async () => {
    const client = createClient({
      findMany: jest.fn().mockResolvedValue([{ ...event, attempts: 4 }]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue(undefined),
    });
    const dispatcher: jest.Mocked<OutboxDispatcher> = {
      dispatch: jest.fn().mockRejectedValue(new Error("transport unavailable")),
    };

    await expect(
      new DispatchOutboxJob(client, dispatcher).run(),
    ).resolves.toEqual({
      dispatched: 0,
      retried: 0,
      deadLettered: 1,
    });
    expect(client.outboxEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "DEAD_LETTER",
          claimedAt: null,
        }),
      }),
    );
  });
});
