import {
  HttpOutboxDispatcher,
  loadBehaviourOutboxEndpoint,
  loadInstitutionalAddonTrialOutboxEndpoint,
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

  it("routes add-on trial expiry events to the authenticated billing API", async () => {
    const endpoint = loadInstitutionalAddonTrialOutboxEndpoint({
      BILLING_INTERNAL_API_URL: "https://api.example.test",
      INTERNAL_AUTH_SECRET: "internal-secret",
    });
    const dispatcher = new HttpOutboxDispatcher({
      genericUrl: "https://dispatch.example.test/events",
      genericToken: "dispatch-token",
      institutionalAddonTrials: endpoint,
    });
    const intent = {
      aggregateType: "institutional_addon_trial",
      aggregateId: "trial-1",
      eventType: "institutional.addon_trial.expired",
      payload: { orgId: "org-1", trialId: "trial-1" },
      idempotencyKey: "institutional-addon-trial-expiry:trial-1",
    };

    await dispatcher.dispatch(intent);

    expect(endpoint?.url).toBe(
      "https://api.example.test/billing/institutional/internal/addons/expiry-email",
    );
    expect(fetchMock).toHaveBeenCalledWith(endpoint?.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": intent.idempotencyKey,
        "x-pathway-internal-secret": "internal-secret",
      },
      body: JSON.stringify(intent),
    });
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

  it("requires an HTTPS internal billing endpoint for trial expiry delivery", () => {
    expect(() =>
      loadInstitutionalAddonTrialOutboxEndpoint({
        BILLING_INTERNAL_API_URL: "http://api.example.test",
        INTERNAL_AUTH_SECRET: "internal-secret",
      }),
    ).toThrow("BILLING_INTERNAL_API_URL must use HTTPS or local HTTP");
    expect(() =>
      loadInstitutionalAddonTrialOutboxEndpoint({
        BILLING_INTERNAL_API_URL: "https://api.example.test",
      }),
    ).toThrow("INTERNAL_AUTH_SECRET is required for add-on trial dispatch");
  });
});
