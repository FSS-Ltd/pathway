import { assertFinanceCollectionAmount } from "../finance-collection-amount";
import { ServiceUnavailableException } from "@nestjs/common";
import { z } from "zod";
import type { FinanceStripeCheckoutConfig } from "./finance-stripe-checkout.config";

const STRIPE_API_VERSION = "2026-09-30.endive";
const STRIPE_API_BASE_URL = "https://api.stripe.com";
const CHECKOUT_HOST = "checkout.stripe.com";

export const FINANCE_STRIPE_BACS_PROVIDER = Symbol(
  "FINANCE_STRIPE_BACS_PROVIDER",
);

const stripeCustomerSchema = z.object({
  id: z.string().startsWith("cus_"),
  livemode: z.boolean(),
});

const checkoutSessionSchema = z.object({
  id: z.string().startsWith("cs_"),
  livemode: z.boolean(),
  url: z.string().url(),
  expires_at: z.number().int().positive(),
});

const paymentIntentSchema = z.object({
  id: z.string().startsWith("pi_"),
  livemode: z.boolean(),
  amount: z.number().int().positive(),
  currency: z.string().length(3),
  customer: z.union([z.string(), z.object({ id: z.string() })]),
  payment_method: z.union([z.string(), z.object({ id: z.string() })]),
  status: z.string().min(1),
});

export interface FinanceStripeBacsCustomer {
  id: string;
}

export interface FinanceStripeBacsSetupSession {
  id: string;
  url: string;
  expiresAt: Date;
}

export type FinanceStripeBacsPaymentIntentStatus =
  | "processing"
  | "succeeded"
  | "requires_payment_method"
  | "requires_action"
  | "requires_confirmation"
  | "canceled"
  | "unknown";

export interface FinanceStripeBacsPaymentIntent {
  id: string;
  status: FinanceStripeBacsPaymentIntentStatus;
}

export interface FinanceStripeBacsProvider {
  createCustomer(input: {
    stripeAccountId: string;
    payerAccountId: string;
    displayName: string;
    idempotencyKey: string;
  }): Promise<FinanceStripeBacsCustomer>;
  createMandateSetupSession(input: {
    stripeAccountId: string;
    stripeCustomerId: string;
    mandateId: string;
    payerAccountId: string;
    consentVersion: string;
    idempotencyKey: string;
  }): Promise<FinanceStripeBacsSetupSession>;
  createDebit(input: {
    stripeAccountId: string;
    customerId: string;
    paymentMethodId: string;
    debitAttemptId: string;
    instalmentId: string;
    amountMinor: bigint;
    idempotencyKey: string;
  }): Promise<FinanceStripeBacsPaymentIntent>;
}

export class FinanceStripeBacsProviderError extends Error {
  constructor(readonly retryable: boolean) {
    super("Stripe Bacs collection is temporarily unavailable");
    this.name = "FinanceStripeBacsProviderError";
  }
}

export class StripeFinanceBacsProvider implements FinanceStripeBacsProvider {
  constructor(
    private readonly config: Extract<
      FinanceStripeCheckoutConfig,
      { mode: "test" | "live" }
    >,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  /** Provider objects must be in the same Stripe mode as this configuration. */
  private get isLive(): boolean {
    return this.config.mode === "live";
  }

  async createCustomer(input: {
    stripeAccountId: string;
    payerAccountId: string;
    displayName: string;
    idempotencyKey: string;
  }): Promise<FinanceStripeBacsCustomer> {
    const form = new URLSearchParams({ name: input.displayName });
    form.set("metadata[finance_payer_account_id]", input.payerAccountId);
    const payload = await this.request(
      "/v1/customers",
      input.stripeAccountId,
      input.idempotencyKey,
      form.toString(),
    );
    const parsed = stripeCustomerSchema.safeParse(payload);
    if (!parsed.success || parsed.data.livemode !== this.isLive) {
      throw new FinanceStripeBacsProviderError(true);
    }
    return { id: parsed.data.id };
  }

  async createMandateSetupSession(input: {
    stripeAccountId: string;
    stripeCustomerId: string;
    mandateId: string;
    payerAccountId: string;
    consentVersion: string;
    idempotencyKey: string;
  }): Promise<FinanceStripeBacsSetupSession> {
    const successUrl = new URL(
      "/family/finance/mandate-return",
      this.config.webAppUrl,
    );
    successUrl.searchParams.set("mandate_id", input.mandateId);
    const successUrlWithSession = `${successUrl.toString()}&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = new URL(
      "/family/finance/payment-methods",
      this.config.webAppUrl,
    );
    cancelUrl.searchParams.set("mandate_id", input.mandateId);

    const form = new URLSearchParams();
    form.set("mode", "setup");
    form.set("locale", "en-GB");
    form.set("currency", "gbp");
    form.set("customer", input.stripeCustomerId);
    form.set("success_url", successUrlWithSession);
    form.set("cancel_url", cancelUrl.toString());
    form.set("allowed_payment_method_types[0]", "bacs_debit");
    form.set("metadata[finance_mandate_id]", input.mandateId);
    form.set("metadata[finance_payer_account_id]", input.payerAccountId);
    form.set(
      "setup_intent_data[metadata][finance_mandate_id]",
      input.mandateId,
    );
    form.set(
      "setup_intent_data[metadata][finance_payer_account_id]",
      input.payerAccountId,
    );
    form.set(
      "setup_intent_data[metadata][finance_consent_version]",
      input.consentVersion,
    );

    const payload = await this.request(
      "/v1/checkout/sessions",
      input.stripeAccountId,
      input.idempotencyKey,
      form.toString(),
    );
    const parsed = checkoutSessionSchema.safeParse(payload);
    if (!parsed.success || parsed.data.livemode !== this.isLive) {
      throw new FinanceStripeBacsProviderError(true);
    }
    const url = new URL(parsed.data.url);
    if (url.protocol !== "https:" || url.hostname !== CHECKOUT_HOST) {
      throw new FinanceStripeBacsProviderError(true);
    }
    return {
      id: parsed.data.id,
      url: url.toString(),
      expiresAt: new Date(parsed.data.expires_at * 1_000),
    };
  }

  async createDebit(input: {
    stripeAccountId: string;
    customerId: string;
    paymentMethodId: string;
    debitAttemptId: string;
    instalmentId: string;
    amountMinor: bigint;
    idempotencyKey: string;
  }): Promise<FinanceStripeBacsPaymentIntent> {
    assertFinanceCollectionAmount({
      method: "bacs",
      currency: "GBP",
      amountMinor: input.amountMinor,
    });
    const amount = Number(input.amountMinor);

    const form = new URLSearchParams();
    form.set("amount", amount.toString());
    form.set("currency", "gbp");
    form.set("customer", input.customerId);
    form.set("payment_method", input.paymentMethodId);
    form.set("allowed_payment_method_types[0]", "bacs_debit");
    form.set("confirm", "true");
    form.set("off_session", "true");
    form.set("metadata[finance_debit_attempt_id]", input.debitAttemptId);
    form.set("metadata[finance_instalment_id]", input.instalmentId);

    const payload = await this.request(
      "/v1/payment_intents",
      input.stripeAccountId,
      input.idempotencyKey,
      form.toString(),
    );
    const parsed = paymentIntentSchema.safeParse(payload);
    if (
      !parsed.success ||
      parsed.data.livemode !== this.isLive ||
      parsed.data.amount !== amount ||
      parsed.data.currency.toLowerCase() !== "gbp" ||
      providerReference(parsed.data.customer) !== input.customerId ||
      providerReference(parsed.data.payment_method) !== input.paymentMethodId
    ) {
      throw new FinanceStripeBacsProviderError(true);
    }
    return {
      id: parsed.data.id,
      status: paymentIntentStatus(parsed.data.status),
    };
  }

  private async request(
    path: string,
    stripeAccountId: string,
    idempotencyKey: string,
    body: string,
  ): Promise<unknown> {
    try {
      const response = await this.fetcher(`${STRIPE_API_BASE_URL}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.secretKey}`,
          "Stripe-Version": STRIPE_API_VERSION,
          "Stripe-Account": stripeAccountId,
          "Idempotency-Key": idempotencyKey,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new FinanceStripeBacsProviderError(
          response.status === 408 ||
            response.status === 409 ||
            response.status === 429 ||
            response.status >= 500,
        );
      }
      return payload;
    } catch (error) {
      if (error instanceof FinanceStripeBacsProviderError) throw error;
      throw new FinanceStripeBacsProviderError(true);
    }
  }
}

export class DisabledFinanceStripeBacsProvider implements FinanceStripeBacsProvider {
  async createCustomer(): Promise<FinanceStripeBacsCustomer> {
    throw new ServiceUnavailableException(
      "Finance Bacs collection is not configured",
    );
  }

  async createMandateSetupSession(): Promise<FinanceStripeBacsSetupSession> {
    throw new ServiceUnavailableException(
      "Finance Bacs collection is not configured",
    );
  }

  async createDebit(): Promise<FinanceStripeBacsPaymentIntent> {
    throw new ServiceUnavailableException(
      "Finance Bacs collection is not configured",
    );
  }
}

function providerReference(value: string | { id: string }): string {
  return typeof value === "string" ? value : value.id;
}

function paymentIntentStatus(
  value: string,
): FinanceStripeBacsPaymentIntentStatus {
  switch (value) {
    case "processing":
    case "succeeded":
    case "requires_payment_method":
    case "requires_action":
    case "requires_confirmation":
    case "canceled":
      return value;
    default:
      return "unknown";
  }
}
