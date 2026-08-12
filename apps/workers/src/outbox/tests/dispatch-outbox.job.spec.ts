import {
  DispatchOutboxJob,
  discoverDueOutboxOrgIds,
  type OutboxEventDelegate,
  type OutboxDispatcher,
  type OutboxDispatchClient,
} from "../dispatch-outbox.job";
import { runTransaction } from "@pathway/db";

jest.mock("@pathway/db", () => ({
  applyTenantContext: jest.fn(),
  runTransaction: jest.fn(),
}));

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

const behaviourNotificationEvent = {
  ...event,
  aggregateType: "BEHAVIOUR_ENTRY",
  aggregateId: "entry-1",
  eventType: "behaviour.guardian-notification.requested",
  payload: {
    behaviourEntryId: "entry-1",
    childId: "child-1",
    tenantId: "tenant-1",
    orgId: "org-1",
    stage: 2,
    demeritPolicyVersion: 3,
    occurredOn: "2026-08-12",
    recipientUserIds: ["guardian-1"],
  },
  idempotencyKey: "behaviour-guardian-notification:entry-1:2",
};

function createClient(outboxEvent: OutboxEventDelegate): OutboxDispatchClient {
  return {
    findOrgIds: jest.fn().mockResolvedValue(["org-1"]),
    runForOrg: async <T>(
      _orgId: string,
      callback: (events: OutboxEventDelegate) => Promise<T>,
    ) => callback(outboxEvent),
  };
}

describe("DispatchOutboxJob", () => {
  it("discovers due organisation IDs without a deployment allow-list", async () => {
    const query = jest
      .fn()
      .mockResolvedValue([{ orgId: "org-1" }, { orgId: "org-2" }]);
    jest
      .mocked(runTransaction)
      .mockImplementation(async (callback) =>
        callback({ $queryRaw: query } as never),
      );

    await expect(discoverDueOutboxOrgIds()).resolves.toEqual([
      "org-1",
      "org-2",
    ]);
  });
  it("claims a duplicate-key event once before dispatching it", async () => {
    const outboxEvent = {
      findMany: jest.fn().mockResolvedValue([event]),
      updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const client = createClient(outboxEvent);
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
    expect(outboxEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "DISPATCHED" }),
      }),
    );
  });

  it("preserves trusted behaviour tenant and organisation scope in the consumer intent", async () => {
    const behaviourEvent = {
      ...event,
      aggregateType: "BEHAVIOUR_ENTRY",
      aggregateId: "entry-1",
      eventType: "behaviour.merit-awarded",
      payload: {
        behaviourEntryId: "entry-1",
        childId: "child-1",
        tenantId: "tenant-1",
        orgId: "org-1",
        pointsDelta: 3,
        correctsBehaviourEntryId: null,
      },
      idempotencyKey: "behaviour-merit-awarded:entry-1",
    };
    const outboxEvent = {
      findMany: jest.fn().mockResolvedValue([behaviourEvent]),
      updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const dispatcher: jest.Mocked<OutboxDispatcher> = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    };

    await new DispatchOutboxJob(createClient(outboxEvent), dispatcher).run();

    expect(dispatcher.dispatch).toHaveBeenCalledWith({
      aggregateType: "BEHAVIOUR_ENTRY",
      aggregateId: "entry-1",
      eventType: "behaviour.merit-awarded",
      payload: {
        behaviourEntryId: "entry-1",
        childId: "child-1",
        tenantId: "tenant-1",
        orgId: "org-1",
        pointsDelta: 3,
        correctsBehaviourEntryId: null,
      },
      idempotencyKey: "behaviour-merit-awarded:entry-1",
    });
  });

  it("does not dispatch an event another worker already claimed", async () => {
    const outboxEvent = {
      findMany: jest.fn().mockResolvedValue([event]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn(),
    };
    const client = createClient(outboxEvent);
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
    const outboxEvent = {
      findMany: jest.fn().mockResolvedValue([
        {
          ...event,
          attempts: 1,
          claimedAt: new Date("2026-08-09T10:00:00.000Z"),
        },
      ]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const client = createClient(outboxEvent);
    const dispatcher: jest.Mocked<OutboxDispatcher> = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    };

    await new DispatchOutboxJob(client, dispatcher).run(
      new Date("2026-08-09T10:10:00.000Z"),
    );

    expect(outboxEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ OR: expect.any(Array) }),
      }),
    );
    expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
  });

  it("returns a failed behaviour notification to durable retry state", async () => {
    const outboxEvent = {
      findMany: jest.fn().mockResolvedValue([behaviourNotificationEvent]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const dispatcher: jest.Mocked<OutboxDispatcher> = {
      dispatch: jest.fn().mockRejectedValue(new Error("provider unavailable")),
    };
    const now = new Date("2026-08-12T12:00:00.000Z");

    await expect(
      new DispatchOutboxJob(createClient(outboxEvent), dispatcher).run(now),
    ).resolves.toEqual({
      dispatched: 0,
      retried: 1,
      deadLettered: 0,
    });
    expect(outboxEvent.update).toHaveBeenCalledWith({
      where: { id: behaviourNotificationEvent.id },
      data: {
        status: "PENDING",
        nextAttemptAt: new Date("2026-08-12T12:01:00.000Z"),
        claimedAt: null,
        lastError: "provider unavailable",
      },
    });
  });

  it("dead-letters the fifth failed delivery attempt", async () => {
    const outboxEvent = {
      findMany: jest
        .fn()
        .mockResolvedValue([{ ...behaviourNotificationEvent, attempts: 4 }]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const client = createClient(outboxEvent);
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
    expect(outboxEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "DEAD_LETTER",
          claimedAt: null,
        }),
      }),
    );
  });
});
