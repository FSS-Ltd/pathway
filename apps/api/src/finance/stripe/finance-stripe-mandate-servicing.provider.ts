import type { FinanceStripeServicingConfig } from "./finance-stripe-servicing.config";
import type { FinanceStripeAccountScope } from "./finance-stripe-references";
import {
  FinanceStripeMandateServicingError,
  type FinanceStripeMandateServicingProvider,
  type FinanceMandateServicingObject,
  type FinanceMandateServicingResource,
  type FinanceMandatePaymentMethodCancellation,
  type FinanceMandateSetupExpiry,
  parseFinanceMandateServicingObject,
  parseFinanceMandateSetupSession,
} from "./finance-stripe-mandate-servicing.contracts";
import { StripeFinanceReconciliationProvider } from "./finance-stripe-reconciliation.provider";

const resources = {
  setupIntents: { path: "/v1/setup_intents", prefix: "seti_" },
  mandates: { path: "/v1/mandates", prefix: "mandate_" },
  paymentMethods: { path: "/v1/payment_methods", prefix: "pm_" },
} satisfies Record<
  FinanceMandateServicingResource,
  { path: string; prefix: string }
>;

function assertId(prefix: string, id: string): void {
  if (id.length > 255 || !new RegExp(`^${prefix}[A-Za-z0-9_]+$`).test(id))
    throw new FinanceStripeMandateServicingError("INVALID_SCOPE");
}
function assertOperationKey(key: string): void {
  if (!/^[A-Za-z0-9_-]{1,255}$/.test(key))
    throw new FinanceStripeMandateServicingError("INVALID_SCOPE");
}

export class StripeFinanceMandateServicingProvider implements FinanceStripeMandateServicingProvider {
  constructor(
    private readonly config: FinanceStripeServicingConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  async retrieve(
    scope: FinanceStripeAccountScope,
    resource: FinanceMandateServicingResource,
    id: string,
  ): Promise<FinanceMandateServicingObject> {
    const target = resources[resource];
    if (!target) throw new FinanceStripeMandateServicingError("INVALID_SCOPE");
    assertId(target.prefix, id);
    const payload = await this.request(
      scope,
      `${target.path}/${encodeURIComponent(id)}`,
    );
    return parseFinanceMandateServicingObject(scope, resource, id, payload);
  }
  async detachPaymentMethod(
    input: FinanceMandatePaymentMethodCancellation,
  ): Promise<void> {
    assertOperationKey(input.idempotencyKey);
    assertId("cus_", input.customerId);
    const object = await this.retrieve(
      input,
      "paymentMethods",
      input.paymentMethodId,
    );
    if (
      object.object !== "payment_method" ||
      object.type !== "bacs_debit" ||
      (object.customer !== null && object.customer !== input.customerId)
    )
      throw new FinanceStripeMandateServicingError("INVALID_RESPONSE");
    if (object.customer === null) return;
    const payload = await this.request(
      input,
      `/v1/payment_methods/${encodeURIComponent(input.paymentMethodId)}/detach`,
      input.idempotencyKey,
    );
    const detached = parseFinanceMandateServicingObject(
      input,
      "paymentMethods",
      input.paymentMethodId,
      payload,
    );
    if (
      detached.object !== "payment_method" ||
      detached.type !== "bacs_debit" ||
      detached.customer !== null
    )
      throw new FinanceStripeMandateServicingError("INVALID_RESPONSE");
  }
  async expireMandateSetupSession(
    input: FinanceMandateSetupExpiry,
  ): Promise<void> {
    assertOperationKey(input.idempotencyKey);
    assertId("cs_", input.sessionId);
    assertId("cus_", input.customerId);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(input.mandateId))
      throw new FinanceStripeMandateServicingError("INVALID_SCOPE");
    this.assertScope(input);
    const reader = new StripeFinanceReconciliationProvider(
      this.config.mode === "disabled" ? "" : this.config.secretKey,
      this.fetcher,
    );
    const current = parseFinanceMandateSetupSession(
      input,
      await reader.retrieve(input, "checkoutSessions", input.sessionId),
    );
    if (current.status === "expired") return;
    if (current.status !== "open")
      throw new FinanceStripeMandateServicingError("UNAVAILABLE");
    const expired = parseFinanceMandateSetupSession(
      input,
      await this.request(
        input,
        `/v1/checkout/sessions/${encodeURIComponent(input.sessionId)}/expire`,
        input.idempotencyKey,
      ),
    );
    if (expired.status !== "expired")
      throw new FinanceStripeMandateServicingError("INVALID_RESPONSE");
  }

  private assertScope(scope: FinanceStripeAccountScope): void {
    if (this.config.mode === "disabled")
      throw new FinanceStripeMandateServicingError("UNAVAILABLE");
    if (
      scope.livemode !== (this.config.mode === "live") ||
      !new RegExp(`^(?:sk|rk)_${this.config.mode}_`).test(
        this.config.secretKey,
      ) ||
      !/^acct_[A-Za-z0-9_]{1,250}$/.test(scope.stripeAccountId)
    )
      throw new FinanceStripeMandateServicingError("INVALID_SCOPE");
  }

  private async request(
    scope: FinanceStripeAccountScope,
    path: string,
    operationKey?: string,
  ): Promise<unknown> {
    this.assertScope(scope);
    if (this.config.mode === "disabled")
      throw new FinanceStripeMandateServicingError("UNAVAILABLE");
    try {
      const response = await this.fetcher(`https://api.stripe.com${path}`, {
        method: operationKey ? "POST" : "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${this.config.secretKey}`,
          "Stripe-Version": "2026-09-30.endive",
          "Stripe-Account": scope.stripeAccountId,
          ...(operationKey
            ? {
                "Idempotency-Key": operationKey,
                "Content-Type": "application/x-www-form-urlencoded",
              }
            : {}),
        },
        ...(operationKey ? { body: "" } : {}),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok)
        throw new FinanceStripeMandateServicingError(
          response.status === 404 ? "NOT_FOUND" : "UNAVAILABLE",
        );
      const payload: unknown = await response.json().catch(() => null);
      return payload;
    } catch (error) {
      if (error instanceof FinanceStripeMandateServicingError) throw error;
      throw new FinanceStripeMandateServicingError("UNAVAILABLE");
    }
  }
}
