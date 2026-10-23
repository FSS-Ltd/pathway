import { randomInt } from "node:crypto";
import { ServiceUnavailableException } from "@nestjs/common";
import { z } from "zod";
import type { FinanceCurrency } from "@pathway/platform";
import { assertFinanceCollectionAmount } from "../finance-collection-amount";
import type { FinanceStripeCheckoutConfig } from "./finance-stripe-checkout.config";

const STRIPE_API_VERSION = "2026-09-30.endive";
const STRIPE_API_BASE_URL = "https://api.stripe.com";
const CHECKOUT_HOST = "checkout.stripe.com";
const CHECKOUT_SESSION_TTL_MS = 60 * 60 * 1000;

export const FINANCE_STRIPE_CHECKOUT_PROVIDER = Symbol(
  "FINANCE_STRIPE_CHECKOUT_PROVIDER",
);

const checkoutSessionSchema = z.object({
  id: z.string().startsWith("cs_"),
  livemode: z.boolean(),
  url: z.string().url(),
  expires_at: z.number().int().positive(),
});
const checkoutSessionStatusSchema = z.object({
  status: z.enum(["open", "complete", "expired"]),
  payment_status: z.enum(["paid", "unpaid", "no_payment_required"]),
  expires_at: z.number().int().positive(),
});

export interface FinanceStripeCheckoutSession {
  id: string;
  url: string;
  expiresAt: Date;
}

export interface FinanceStripeCheckoutProvider {
  createSession(input: {
    stripeAccountId: string;
    attemptId: string;
    invoiceId: string;
    invoiceNumber: string;
    amountMinor: bigint;
    currency: FinanceCurrency;
    idempotencyKey: string;
    integrationIdentifier: string;
    expiresAt: Date;
  }): Promise<FinanceStripeCheckoutSession>;
  expireSession(input: {
    stripeAccountId: string;
    sessionId: string;
    idempotencyKey: string;
  }): Promise<void>;
  retrieveSession(input: {
    stripeAccountId: string;
    sessionId: string;
  }): Promise<{
    status: "open" | "complete" | "expired";
    paymentStatus: string;
  }>;
}

export class FinanceStripeCheckoutProviderError extends Error {
  constructor(readonly retryable: boolean) {
    super("Stripe Checkout is temporarily unavailable");
    this.name = "FinanceStripeCheckoutProviderError";
  }
}

export class StripeFinanceCheckoutProvider implements FinanceStripeCheckoutProvider {
  constructor(
    private readonly config: Exclude<
      FinanceStripeCheckoutConfig,
      { mode: "disabled" }
    >,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async createSession(input: {
    stripeAccountId: string;
    attemptId: string;
    invoiceId: string;
    invoiceNumber: string;
    amountMinor: bigint;
    currency: FinanceCurrency;
    idempotencyKey: string;
    integrationIdentifier: string;
    expiresAt: Date;
  }): Promise<FinanceStripeCheckoutSession> {
    assertFinanceCollectionAmount({
      method: "card",
      currency: input.currency,
      amountMinor: input.amountMinor,
    });
    const amount = Number(input.amountMinor);

    const form = new URLSearchParams();
    const successUrl = new URL(
      "/family/finance/checkout-return",
      this.config.webAppUrl,
    );
    successUrl.searchParams.set("attempt_id", input.attemptId);
    const serializedSuccessUrl = successUrl.toString();
    const successUrlWithSession = `${serializedSuccessUrl}${successUrl.search ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = new URL(
      `/family/finance/invoices/${encodeURIComponent(input.invoiceId)}`,
      this.config.webAppUrl,
    );
    cancelUrl.searchParams.set("checkout_attempt", input.attemptId);

    form.set("mode", "payment");
    form.set("locale", "en-GB");
    form.set("client_reference_id", input.attemptId);
    form.set("integration_identifier", input.integrationIdentifier);
    form.set("success_url", successUrlWithSession);
    form.set("cancel_url", cancelUrl.toString());
    form.set(
      "expires_at",
      Math.floor(input.expiresAt.getTime() / 1000).toString(),
    );
    form.set("allowed_payment_method_types[0]", "card");
    form.set(
      "line_items[0][price_data][currency]",
      input.currency.toLowerCase(),
    );
    form.set("line_items[0][price_data][unit_amount]", amount.toString());
    form.set(
      "line_items[0][price_data][product_data][name]",
      `Invoice ${input.invoiceNumber}`,
    );
    form.set("line_items[0][quantity]", "1");
    form.set("metadata[finance_checkout_attempt_id]", input.attemptId);
    form.set("metadata[finance_invoice_id]", input.invoiceId);
    form.set(
      "payment_intent_data[metadata][finance_checkout_attempt_id]",
      input.attemptId,
    );
    form.set(
      "payment_intent_data[metadata][finance_invoice_id]",
      input.invoiceId,
    );

    const payload = await this.request(
      "/v1/checkout/sessions",
      input.stripeAccountId,
      input.idempotencyKey,
      form.toString(),
    );
    const parsed = checkoutSessionSchema.safeParse(payload);
    if (
      !parsed.success ||
      parsed.data.livemode !== (this.config.mode === "live")
    ) {
      throw new FinanceStripeCheckoutProviderError(true);
    }
    const url = new URL(parsed.data.url);
    if (url.protocol !== "https:" || url.hostname !== CHECKOUT_HOST) {
      throw new FinanceStripeCheckoutProviderError(true);
    }
    return {
      id: parsed.data.id,
      url: url.toString(),
      expiresAt: new Date(parsed.data.expires_at * 1000),
    };
  }

  async expireSession(input: {
    stripeAccountId: string;
    sessionId: string;
    idempotencyKey: string;
  }): Promise<void> {
    await this.request(
      `/v1/checkout/sessions/${encodeURIComponent(input.sessionId)}/expire`,
      input.stripeAccountId,
      input.idempotencyKey,
      "",
    );
  }

  async retrieveSession(input: {
    stripeAccountId: string;
    sessionId: string;
  }): Promise<{
    status: "open" | "complete" | "expired";
    paymentStatus: string;
  }> {
    const path = `/v1/checkout/sessions/${encodeURIComponent(input.sessionId)}`;
    const payload = await this.request(path, input.stripeAccountId, undefined);
    const parsed = checkoutSessionStatusSchema.safeParse(payload);
    if (!parsed.success) throw new FinanceStripeCheckoutProviderError(true);
    return {
      status: parsed.data.status,
      paymentStatus: parsed.data.payment_status,
    };
  }

  private async request(
    path: string,
    stripeAccountId: string,
    idempotencyKey: string | undefined,
    body?: string,
  ): Promise<unknown> {
    try {
      const response = await this.fetcher(`${STRIPE_API_BASE_URL}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: `Bearer ${this.config.secretKey}`,
          "Stripe-Version": STRIPE_API_VERSION,
          "Stripe-Account": stripeAccountId,
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
          ...(body !== undefined
            ? { "Content-Type": "application/x-www-form-urlencoded" }
            : {}),
        },
        ...(body !== undefined ? { body } : {}),
        signal: AbortSignal.timeout(10_000),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new FinanceStripeCheckoutProviderError(
          response.status === 408 ||
            response.status === 409 ||
            response.status === 429 ||
            response.status >= 500,
        );
      }
      return payload;
    } catch (error) {
      if (error instanceof FinanceStripeCheckoutProviderError) throw error;
      throw new FinanceStripeCheckoutProviderError(true);
    }
  }
}

export class DisabledFinanceStripeCheckoutProvider implements FinanceStripeCheckoutProvider {
  async createSession(): Promise<FinanceStripeCheckoutSession> {
    throw new ServiceUnavailableException(
      "Finance Stripe Checkout is not configured",
    );
  }

  async expireSession(): Promise<void> {
    throw new ServiceUnavailableException(
      "Finance Stripe Checkout is not configured",
    );
  }

  async retrieveSession(): Promise<{
    status: "open" | "complete" | "expired";
    paymentStatus: string;
  }> {
    throw new ServiceUnavailableException(
      "Finance Stripe Checkout is not configured",
    );
  }
}

export function financeCheckoutIntegrationIdentifier(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  let suffix = "";
  for (let index = 0; index < 8; index += 1) {
    suffix += alphabet[randomInt(alphabet.length)];
  }
  return `nexsteps-finance-${suffix}`;
}

export function financeCheckoutSessionExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + CHECKOUT_SESSION_TTL_MS);
}
