import { ServiceUnavailableException } from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import type { FinanceStripeWebhookConfig } from "../finance-stripe-webhook.config";
import type { FinanceStripeConnectionService } from "../finance-stripe-connection.service";
import {
  FinanceStripeWebhookReplayService,
  FinanceStripeWebhookService,
  type FinanceStripeWebhookInbox,
} from "../finance-stripe-webhook.service";

jest.mock("@pathway/db", () => ({
  runTransaction: jest.fn(),
  withTenantRlsContext: jest.fn(),
}));

const testConfig = {
  mode: "test",
  secretKey: "sk_test_finance_unit_fixture",
  webhookSecret: "whsec_finance_unit_fixture",
} satisfies Exclude<FinanceStripeWebhookConfig, { mode: "disabled" }>;

function signedEvent() {
  const Stripe = jest.requireActual<typeof import("stripe")>("stripe").default;
  const payload = JSON.stringify({
    id: "evt_finance_service_001",
    object: "event",
    api_version: "2026-09-30.endive",
    created: Math.floor(Date.now() / 1_000),
    data: {
      object: { id: "pi_finance_service_001", object: "payment_intent" },
    },
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type: "payment_intent.succeeded",
    account: "acct_finance_unit_001",
  });
  const stripe = new Stripe(testConfig.secretKey, { apiVersion: "2023-10-16" });
  return {
    rawBody: Buffer.from(payload),
    signature: stripe.webhooks.generateTestHeaderString({
      payload,
      secret: testConfig.webhookSecret,
    }),
  };
}

describe("FinanceStripeWebhookService", () => {
  it("returns accepted only after the inbox has durably stored the event", async () => {
    const capture = jest.fn().mockResolvedValue("accepted");
    const inbox: FinanceStripeWebhookInbox = { capture };
    const service = new FinanceStripeWebhookService(testConfig, inbox);
    const signed = signedEvent();

    await expect(
      service.receive(signed.rawBody, signed.signature),
    ).resolves.toEqual({
      status: "accepted",
      eventId: "evt_finance_service_001",
    });
    expect(capture).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "evt_finance_service_001" }),
    );
  });

  it("returns a retryable service error when durable storage fails", async () => {
    const inbox: FinanceStripeWebhookInbox = {
      capture: jest.fn().mockRejectedValue(new Error("database unavailable")),
    };
    const service = new FinanceStripeWebhookService(testConfig, inbox);
    const signed = signedEvent();

    await expect(
      service.receive(signed.rawBody, signed.signature),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe("FinanceStripeWebhookReplayService", () => {
  const mockRls = jest.mocked(withTenantRlsContext);
  const sync = {
    refreshFromWebhook: jest.fn().mockResolvedValue(undefined),
  } as unknown as FinanceStripeConnectionService;
  const config: FinanceStripeWebhookConfig = testConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRls.mockImplementation(async (_tenantId, _orgId, callback) =>
      callback({
        financeStripeWebhookEvent: {
          findFirst: jest.fn().mockResolvedValue({
            stripeAccountId: "acct_finance_unit_001",
            eventType: "account.updated",
            livemode: false,
          }),
        },
      } as never),
    );
  });

  it("refreshes the latest connected-account state under the event tenant", async () => {
    const service = new FinanceStripeWebhookReplayService(config, sync);

    await expect(
      service.processClaimedEvent({
        eventId: "row-1",
        tenantId: "tenant-a",
        orgId: "org-a",
        claimToken: "claim-a",
      }),
    ).resolves.toBe("processed");
    expect(mockRls).toHaveBeenCalledWith(
      "tenant-a",
      "org-a",
      expect.any(Function),
    );
    expect(sync.refreshFromWebhook).toHaveBeenCalledWith(
      "tenant-a",
      "org-a",
      "acct_finance_unit_001",
    );
  });

  it("defers payment events until the receipt-posting step owns their semantics", async () => {
    mockRls.mockImplementationOnce(async (_tenantId, _orgId, callback) =>
      callback({
        financeStripeWebhookEvent: {
          findFirst: jest.fn().mockResolvedValue({
            stripeAccountId: "acct_finance_unit_001",
            eventType: "payment_intent.succeeded",
            livemode: false,
          }),
        },
      } as never),
    );
    const service = new FinanceStripeWebhookReplayService(config, sync);

    await expect(
      service.processClaimedEvent({
        eventId: "row-2",
        tenantId: "tenant-a",
        orgId: "org-a",
        claimToken: "claim-b",
      }),
    ).resolves.toBe("deferred");
    expect(sync.refreshFromWebhook).not.toHaveBeenCalled();
  });
});
