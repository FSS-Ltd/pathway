import { HttpOutboxDispatcher } from "../outbox-http-dispatcher";

describe("HttpOutboxDispatcher", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as typeof fetch;
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
  });

  it("routes guardian notifications to the API delivery endpoint with the stable outbox key", async () => {
    const dispatcher = new HttpOutboxDispatcher(
      "https://api.example.test/",
      "dispatch-token",
      "internal-secret",
    );
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
          authorization: "Bearer dispatch-token",
          "x-pathway-internal-secret": "internal-secret",
        },
        body: JSON.stringify(intent),
      },
    );
  });

  it("surfaces a failed delivery so the outbox job can retry", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    const dispatcher = new HttpOutboxDispatcher("https://api.example.test");

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
    const dispatcher = new HttpOutboxDispatcher(
      "https://dispatch.example.test/events",
      "dispatch-token",
      "internal-secret",
    );
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
});
