import type { Prisma } from "@pathway/db";
import { FINANCE_BACS_MANDATE_CONSENT_VERSION } from "../../domain/finance-collection-terms";
import type { FinanceBalanceService } from "../../finance-balance.service";
import type { FinanceStripeBacsWebhookInput } from "../finance-stripe-bacs-webhook.contracts";
import { FinanceStripeBacsWebhookService } from "../finance-stripe-bacs-webhook.service";

let mockTransaction: Record<string, unknown>;

jest.mock("@pathway/db", () => ({
  withTenantRlsContext: jest.fn(
    async (
      _tenantId: string,
      _orgId: string,
      callback: (client: unknown) => Promise<unknown>,
    ) => callback(mockTransaction),
  ),
}));

jest.mock("../../finance-invoice-operations", () => ({
  lockInvoice: jest.fn(),
}));

const accountId = "acct_school";

function setupEvent(livemode: boolean): FinanceStripeBacsWebhookInput {
  return {
    stripeEventId: "evt_setup_1",
    tenantId: "tenant-1",
    orgId: "org-1",
    stripeAccountId: accountId,
    eventType: "setup_intent.succeeded",
    livemode,
    payloadJson: {
      id: "evt_setup_1",
      type: "setup_intent.succeeded",
      created: 1_800_000_000,
      livemode,
      account: accountId,
      data: {
        object: {
          id: "seti_school_1",
          object: "setup_intent",
          status: "succeeded",
          customer: "cus_school_1",
          payment_method: "pm_school_1",
          mandate: "mandate_school_1",
          metadata: {
            finance_mandate_id: "mandate-1",
            finance_payer_account_id: "payer-1",
            finance_consent_version: FINANCE_BACS_MANDATE_CONSENT_VERSION,
          },
        },
      },
    } as Prisma.JsonValue,
  };
}

function mandateRecord(livemode: boolean) {
  return {
    id: "mandate-1",
    status: "PENDING_SETUP",
    financeProfileId: "profile-1",
    payerAccountId: "payer-1",
    stripeConnectionId: "connection-1",
    stripeAccountId: accountId,
    livemode,
    stripeSetupIntentId: null,
    stripeCheckoutSessionId: "cs_1",
    stripePaymentMethodId: null,
    stripeMandateId: null,
    stripeCustomer: {
      stripeCustomerId: "cus_school_1",
      stripeAccountId: accountId,
      stripeConnectionId: "connection-1",
      payerAccountId: "payer-1",
      livemode,
    },
    createdByUserId: "payer-user-1",
    consentVersion: FINANCE_BACS_MANDATE_CONSENT_VERSION,
    providerStatusAt: null,
    stripeConnection: {
      id: "connection-1",
      stripeAccountId: accountId,
      livemode,
      financeProfileId: "profile-1",
    },
  };
}

describe("Bacs mandate setup activation", () => {
  it.each([
    ["live", true],
    ["test", false],
  ])("activates a mandate from a %s-mode setup event", async (_name, live) => {
    const update = jest.fn();
    mockTransaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: "grant-1" }]),
      financeMandate: {
        findFirst: jest.fn().mockResolvedValue(mandateRecord(live)),
        update,
      },
    };
    const service = new FinanceStripeBacsWebhookService(
      { resolveMode: jest.fn().mockResolvedValue("ACTIVE") },
      {} as FinanceBalanceService,
      { detachPaymentMethod: jest.fn() },
    );
    await expect(service.process(setupEvent(live))).resolves.toBe("processed");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "ACTIVE",
          providerCancellationPending: false,
        }),
      }),
    );
  });

  it("does not activate a live mandate while Finance is only servicing", async () => {
    const update = jest.fn();
    mockTransaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: "grant-1" }]),
      financeMandate: {
        findFirst: jest.fn().mockResolvedValue(mandateRecord(true)),
        update,
      },
    };
    const detach = jest.fn();
    const service = new FinanceStripeBacsWebhookService(
      { resolveMode: jest.fn().mockResolvedValue("SERVICING_ONLY") },
      {} as FinanceBalanceService,
      { detachPaymentMethod: detach },
    );
    await service.process(setupEvent(true));
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "CANCELLED" }),
      }),
    );
  });
});
