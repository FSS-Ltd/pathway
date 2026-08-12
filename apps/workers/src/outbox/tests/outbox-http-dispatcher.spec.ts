import {
  HttpOutboxDispatcher,
  loadBehaviourOutboxEndpoint,
} from "../outbox-http-dispatcher";

describe("HttpOutboxDispatcher", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as typeof fetch;
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
  });

  it("routes guardian notifications to the API delivery endpoint with the stable outbox key", async () => {
    const dispatcher = new HttpOutboxDispatcher({
      genericUrl: "https://dispatch.example.test/events",
      genericToken: "dispatch-token",
      behaviour: {
        url: "https://api.example.test/internal/outbox/behaviour",
        secret: "behaviour-secret",
      },
    });
    const intent = {
      aggregateType: "BEHAVIOUR_ENTRY",
      aggregateId: "entry-1",
      eventType: "behaviour.guardian-notification.requested",
      payload: { tenantId: "tenant-1" },
      idempotencyKey: "behaviour-guardian-notification:entry-1:2",
    };

    await dispatcher.dispatch(intent);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/internal/outbox/behaviour",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": intent.idempotencyKey,
          "x-pathway-internal-secret": "behaviour-secret",
        },
        body: JSON.stringify(intent),
      },
    );
  });

  it("surfaces a failed delivery so the outbox job can retry", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    const dispatcher = new HttpOutboxDispatcher({
      genericUrl: "https://dispatch.example.test/events",
      behaviour: {
        url: "https://api.example.test/internal/outbox/behaviour",
        secret: "behaviour-secret",
      },
    });

    await expect(
      dispatcher.dispatch({
        aggregateType: "BEHAVIOUR_ENTRY",
        aggregateId: "entry-1",
        eventType: "behaviour.guardian-notification.requested",
        payload: {},
        idempotencyKey: "delivery-key",
      }),
    ).rejects.toThrow("Outbox dispatch endpoint returned 503");
  });

  it("preserves the generic outbox endpoint and does not expose the internal secret", async () => {
    const dispatcher = new HttpOutboxDispatcher({
      genericUrl: "https://dispatch.example.test/events",
      genericToken: "dispatch-token",
      behaviour: {
        url: "https://api.example.test/internal/outbox/behaviour",
        secret: "behaviour-secret",
      },
    });
    const intent = {
      aggregateType: "ACE_NOTICE",
      aggregateId: "notice-1",
      eventType: "ace.notice.published",
      payload: { noticeId: "notice-1" },
      idempotencyKey: "notice-1:published",
    };

    await dispatcher.dispatch(intent);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://dispatch.example.test/events",
      expect.objectContaining({
        headers: {
          "content-type": "application/json",
          "idempotency-key": intent.idempotencyKey,
          authorization: "Bearer dispatch-token",
        },
      }),
    );
  });

  it("rejects insecure or non-behaviour API endpoints before dispatch", () => {
    expect(() =>
      loadBehaviourOutboxEndpoint({
        BEHAVIOUR_OUTBOX_DISPATCH_URL:
          "http://api.example.test/internal/outbox/behaviour",
        BEHAVIOUR_OUTBOX_SECRET: "behaviour-secret",
      }),
    ).toThrow("BEHAVIOUR_OUTBOX_DISPATCH_URL must use HTTPS");
    expect(() =>
      loadBehaviourOutboxEndpoint({
        BEHAVIOUR_OUTBOX_DISPATCH_URL: "https://dispatch.example.test/events",
        BEHAVIOUR_OUTBOX_SECRET: "behaviour-secret",
      }),
    ).toThrow(
      "BEHAVIOUR_OUTBOX_DISPATCH_URL must target /internal/outbox/behaviour",
    );
  });

  it("rejects partial behaviour dispatch configuration without blocking an unconfigured generic dispatcher", async () => {
    expect(() =>
      loadBehaviourOutboxEndpoint({
        BEHAVIOUR_OUTBOX_DISPATCH_URL:
          "https://api.example.test/internal/outbox/behaviour",
      }),
    ).toThrow("BEHAVIOUR_OUTBOX_SECRET is required");

    const dispatcher = new HttpOutboxDispatcher({
      genericUrl: "https://dispatch.example.test/events",
      behaviour: loadBehaviourOutboxEndpoint({}),
    });
    await expect(
      dispatcher.dispatch({
        aggregateType: "BEHAVIOUR_ENTRY",
        aggregateId: "entry-1",
        eventType: "behaviour.guardian-notification.requested",
        payload: {},
        idempotencyKey: "delivery-key",
      }),
    ).rejects.toThrow("Behaviour outbox dispatch is not configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
