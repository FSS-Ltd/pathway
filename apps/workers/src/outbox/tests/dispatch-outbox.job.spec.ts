import {
  DispatchOutboxJob,
  type OutboxDispatcher,
  type OutboxDispatchClient,
} from "../dispatch-outbox.job";

const event = {
  id: "event-1",
  aggregateType: "ace-notice",
  aggregateId: "notice-1",
  eventType: "ace.notice.published",
  payload: { noticeId: "notice-1" },
  idempotencyKey: "notice-1:published",
  attempts: 0,
};

describe("DispatchOutboxJob", () => {
  it("claims a duplicate-key event once before dispatching it", async () => {
    const client: jest.Mocked<OutboxDispatchClient> = {
      outboxEvent: {
        findMany: jest.fn().mockResolvedValue([event]),
        updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
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
    const client: jest.Mocked<OutboxDispatchClient> = {
      outboxEvent: {
        findMany: jest.fn().mockResolvedValue([event]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn(),
      },
    };
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
});
