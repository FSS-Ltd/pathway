import {
  prepareFinanceUnresolvedOperation,
  type FinanceUnresolvedProviders,
} from "../finance-unresolved-preparation";
import type { FinanceUnresolvedContext } from "../finance-unresolved-context.persistence";
import { FinanceStripeReconciliationError } from "../../stripe/finance-stripe-reconciliation.provider";
const scope = {
  tenantId: "tenant",
  orgId: "org",
  connectionId: "connection",
  stripeAccountId: "acct_school",
  livemode: false,
};
const now = new Date("2026-10-23T12:00:00Z");
function context(): FinanceUnresolvedContext {
  return {
    operation: {
      key: "checkout:local",
      kind: "checkout",
      id: "local",
      createdAt: new Date("2026-10-01"),
      resourceId: null,
    },
    attemptedAt: new Date("2026-10-01"),
    search: null,
    mandate: null,
  };
}
function providers() {
  return {
    provider: {
      listPage: jest
        .fn<
          ReturnType<FinanceUnresolvedProviders["provider"]["listPage"]>,
          Parameters<FinanceUnresolvedProviders["provider"]["listPage"]>
        >()
        .mockResolvedValue({ data: [], nextCursor: null }),
      retrieve: jest.fn<
        ReturnType<FinanceUnresolvedProviders["provider"]["retrieve"]>,
        Parameters<FinanceUnresolvedProviders["provider"]["retrieve"]>
      >(),
    },
    mandates: {
      retrieve: jest.fn<
        ReturnType<FinanceUnresolvedProviders["mandates"]["retrieve"]>,
        Parameters<FinanceUnresolvedProviders["mandates"]["retrieve"]>
      >(),
      detachPaymentMethod: jest.fn().mockResolvedValue(undefined),
      expireMandateSetupSession: jest.fn().mockResolvedValue(undefined),
    },
  };
}
describe("bounded unresolved provider preparation", () => {
  it("searches one page and preserves continuation without consuming unrelated money", async () => {
    const deps = providers();
    deps.provider.listPage.mockResolvedValue({
      data: [
        {
          id: "cs_unrelated",
          object: "checkout.session",
          created: 1,
          metadata: { finance_checkout_attempt_id: "other" },
        },
      ],
      nextCursor: "cs_next",
    });
    const result = await prepareFinanceUnresolvedOperation(
      scope,
      context(),
      now,
      "sync",
      deps,
    );
    expect(result.objects).toEqual([]);
    expect(result.search).toMatchObject({
      cursor: "cs_next",
      exhausted: false,
    });
    expect(deps.provider.listPage).toHaveBeenCalledTimes(1);
  });
  it("keeps a stale search window but clears its invalid provider cursor for the next sweep", async () => {
    const deps = providers();
    deps.provider.listPage.mockRejectedValue(
      new FinanceStripeReconciliationError("INVALID_CURSOR"),
    );
    const result = await prepareFinanceUnresolvedOperation(
      scope,
      context(),
      now,
      "sync",
      deps,
    );
    expect(result.search).toMatchObject({ cursor: null, exhausted: false });
    expect(result.issue).toBe("INVALID_SEARCH_CURSOR");
  });
  it("propagates remote failure so the local operation cursor cannot advance", async () => {
    const deps = providers();
    deps.provider.listPage.mockRejectedValue(
      new FinanceStripeReconciliationError("UNAVAILABLE"),
    );
    await expect(
      prepareFinanceUnresolvedOperation(scope, context(), now, "sync", deps),
    ).rejects.toMatchObject({ reason: "UNAVAILABLE" });
  });
  it("never cancels during dry run and never reads a fabricated mandate creation time", async () => {
    const deps = providers();
    const value = context();
    value.operation = {
      ...value.operation,
      kind: "mandate",
      key: "mandate:local",
      resourceId: "seti_known",
    };
    value.mandate = {
      id: "local",
      status: "CANCELLED",
      stripeSetupIntentId: "seti_known",
      stripeMandateId: "mandate_known",
      stripeCheckoutSessionId: "cs_setup",
      stripePaymentMethodId: "pm_known",
      providerCancellationPending: true,
      stripeCustomer: { stripeCustomerId: "cus_known" },
    };
    deps.mandates.retrieve.mockImplementation(async (_scope, resource, id) => {
      if (resource === "mandates")
        return {
          id,
          object: "mandate",
          livemode: false,
          status: "inactive",
          payment_method: "pm_known",
          acceptedAt: null,
        };
      if (resource === "paymentMethods")
        return {
          id,
          object: "payment_method",
          livemode: false,
          created: 1,
          type: "bacs_debit",
          customer: null,
        };
      return {
        id,
        object: "setup_intent",
        livemode: false,
        created: 1,
        status: "processing",
        customer: "cus_known",
        payment_method: "pm_known",
        mandate: "mandate_known",
        metadata: {},
      };
    });
    const result = await prepareFinanceUnresolvedOperation(
      scope,
      value,
      now,
      "dry-run",
      deps,
    );
    expect(deps.mandates.detachPaymentMethod).not.toHaveBeenCalled();
    expect(deps.mandates.expireMandateSetupSession).not.toHaveBeenCalled();
    expect(result.mandateObjects).toHaveLength(3);
    expect(result.mandateObjects[1]).not.toHaveProperty("created");
    expect(result.cancellationAcknowledged).toBe(false);
  });
  it("recovers a late successful setup before retrying obsolete setup expiry", async () => {
    const deps = providers();
    const value = context();
    value.operation = {
      ...value.operation,
      kind: "mandate",
      key: "mandate:local",
    };
    value.mandate = {
      id: "local",
      status: "CANCELLED",
      stripeSetupIntentId: null,
      stripeMandateId: null,
      stripeCheckoutSessionId: "cs_setup",
      stripePaymentMethodId: null,
      providerCancellationPending: true,
      stripeCustomer: { stripeCustomerId: "cus_known" },
    };
    deps.mandates.expireMandateSetupSession.mockRejectedValue(
      new Error("Completed setup cannot expire"),
    );
    deps.provider.listPage.mockResolvedValue({
      data: [
        {
          id: "seti_late",
          object: "setup_intent",
          created: 1,
          livemode: false,
          status: "succeeded",
          customer: "cus_known",
          payment_method: "pm_known",
          mandate: "mandate_known",
          metadata: { finance_mandate_id: "local" },
        },
      ],
      nextCursor: null,
    });
    const result = await prepareFinanceUnresolvedOperation(
      scope,
      value,
      now,
      "sync",
      deps,
    );
    expect(result.mandateObjects).toHaveLength(1);
    expect(deps.mandates.expireMandateSetupSession).not.toHaveBeenCalled();
    expect(result.cancellationAcknowledged).toBe(false);
  });
});
