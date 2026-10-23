import { ServiceUnavailableException } from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import type { FinanceStripeWebhookConfig } from "../finance-stripe-webhook.config";
import type { FinanceStripeAccountSyncService } from "../finance-stripe-account-sync.service";
import {
  FinanceStripeWebhookReplayService,
  FinanceStripeWebhookService,
  type FinanceStripeWebhookInbox,
} from "../finance-stripe-webhook.service";
import type { FinanceStripePaymentWebhookService } from "../finance-stripe-payment-webhook.service";
import type { FinanceStripeBacsWebhookService } from "../finance-stripe-bacs-webhook.service";
import type { FinanceStripeReversalWebhookService } from "../finance-stripe-reversal-webhook.service";

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
      object: {
        id: "cs_finance_service_001",
        object: "checkout.session",
        client_reference_id: "finance-attempt-service-001",
        amount_total: 2500,
        currency: "gbp",
        payment_status: "paid",
        status: "complete",
        metadata: {
          finance_checkout_attempt_id: "finance-attempt-service-001",
          finance_invoice_id: "finance-invoice-service-001",
        },
      },
    },
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type: "checkout.session.completed",
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
  } as unknown as FinanceStripeAccountSyncService;
  const paymentProcess = jest.fn().mockResolvedValue("deferred");
  const payments = {
    process: paymentProcess,
  } as unknown as FinanceStripePaymentWebhookService;
  const reversals = {
    supports: jest.fn().mockReturnValue(false),
    process: jest.fn().mockResolvedValue("deferred"),
  } as unknown as FinanceStripeReversalWebhookService;
  const bacsProcess = jest.fn().mockResolvedValue("deferred");
  const bacs = {
    supports: jest.fn().mockReturnValue(false),
    process: bacsProcess,
  } as unknown as FinanceStripeBacsWebhookService;
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
            stripeEventId: "evt_finance_unit_account",
            payloadJson: {},
          }),
        },
      } as never),
    );
  });

  it("refreshes the latest connected-account state under the event tenant", async () => {
    const service = new FinanceStripeWebhookReplayService(
      config,
      sync,
      bacs,
      payments,
      reversals,
    );

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

  it("defers payment events that have no Finance handler", async () => {
    mockRls.mockImplementationOnce(async (_tenantId, _orgId, callback) =>
      callback({
        financeStripeWebhookEvent: {
          findFirst: jest.fn().mockResolvedValue({
            stripeAccountId: "acct_finance_unit_001",
            eventType: "payment_intent.succeeded",
            livemode: false,
            stripeEventId: "evt_finance_unit_payment",
            payloadJson: {},
          }),
        },
      } as never),
    );
    const service = new FinanceStripeWebhookReplayService(
      config,
      sync,
      bacs,
      payments,
      reversals,
    );

    await expect(
      service.processClaimedEvent({
        eventId: "row-2",
        tenantId: "tenant-a",
        orgId: "org-a",
        claimToken: "claim-b",
      }),
    ).resolves.toBe("deferred");
    expect(sync.refreshFromWebhook).not.toHaveBeenCalled();
    expect(paymentProcess).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeEventId: "evt_finance_unit_payment",
        stripeAccountId: "acct_finance_unit_001",
        eventType: "payment_intent.succeeded",
      }),
    );
  });

  it("routes Checkout Session events to the confirmed receipt handler", async () => {
    const payload = {
      id: "evt_finance_checkout_replay",
      type: "checkout.session.completed",
      livemode: false,
      account: "acct_finance_unit_001",
      data: { object: {} },
    };
    mockRls.mockImplementationOnce(async (_tenantId, _orgId, callback) =>
      callback({
        financeStripeWebhookEvent: {
          findFirst: jest.fn().mockResolvedValue({
            stripeEventId: payload.id,
            stripeAccountId: "acct_finance_unit_001",
            eventType: payload.type,
            livemode: false,
            payloadJson: payload,
          }),
        },
      } as never),
    );
    paymentProcess.mockResolvedValueOnce("processed");
    const service = new FinanceStripeWebhookReplayService(
      config,
      sync,
      bacs,
      payments,
      reversals,
    );

    await expect(
      service.processClaimedEvent({
        eventId: "row-checkout",
        tenantId: "tenant-a",
        orgId: "org-a",
        claimToken: "claim-checkout",
      }),
    ).resolves.toBe("processed");
    expect(paymentProcess).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeEventId: payload.id,
        eventType: payload.type,
        payloadJson: payload,
      }),
    );
  });

  it("routes Bacs events before the card Checkout fallback", async () => {
    const payload = {
      id: "evt_finance_bacs_replay",
      type: "payment_intent.processing",
      livemode: false,
      account: "acct_finance_unit_001",
      data: { object: {} },
    };
    mockRls.mockImplementationOnce(async (_tenantId, _orgId, callback) =>
      callback({
        financeStripeWebhookEvent: {
          findFirst: jest.fn().mockResolvedValue({
            stripeEventId: payload.id,
            stripeAccountId: "acct_finance_unit_001",
            eventType: payload.type,
            livemode: false,
            payloadJson: payload,
          }),
        },
      } as never),
    );
    jest.mocked(bacs.supports).mockReturnValueOnce(true);
    bacsProcess.mockResolvedValueOnce("processed");
    const service = new FinanceStripeWebhookReplayService(
      config,
      sync,
      bacs,
      payments,
      reversals,
    );

    await expect(
      service.processClaimedEvent({
        eventId: "row-bacs",
        tenantId: "tenant-a",
        orgId: "org-a",
        claimToken: "claim-bacs",
      }),
    ).resolves.toBe("processed");
    expect(bacsProcess).toHaveBeenCalledWith(
      expect.objectContaining({ stripeEventId: payload.id }),
    );
    expect(paymentProcess).not.toHaveBeenCalled();
  });
});
