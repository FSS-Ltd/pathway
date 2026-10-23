import { ServiceUnavailableException } from "@nestjs/common";
import { z } from "zod";
import type { FinanceCurrency } from "@pathway/platform";
import type { FinanceStripeServicingConfig } from "./finance-stripe-servicing.config";

const STRIPE_API_VERSION = "2026-09-30.endive";
const STRIPE_API_BASE_URL = "https://api.stripe.com";

export const FINANCE_STRIPE_REFUND_PROVIDER = Symbol(
  "FINANCE_STRIPE_REFUND_PROVIDER",
);

const refundSchema = z.object({
  id: z.string().startsWith("re_"),
  amount: z.number().int().positive(),
  currency: z.string().length(3),
  status: z.enum([
    "pending",
    "requires_action",
    "succeeded",
    "failed",
    "canceled",
  ]),
  created: z.number().int().positive(),
  livemode: z.boolean(),
  metadata: z.record(z.string()).nullable().optional(),
});
const refundListSchema = z.object({
  data: z.array(refundSchema),
  has_more: z.boolean(),
});
const chargeSchema = z.object({
  id: z.string().startsWith("ch_"),
  object: z.literal("charge"),
  payment_intent: z
    .union([
      z.string().startsWith("pi_"),
      z.object({ id: z.string().startsWith("pi_") }).passthrough(),
    ])
    .nullable(),
});

export type FinanceStripeRefundStatus = z.infer<typeof refundSchema>["status"];

export interface FinanceStripeRefundProvider {
  retrieveChargePaymentIntent(input: {
    stripeAccountId: string;
    chargeId: string;
  }): Promise<string | null>;
  createRefund(input: {
    stripeAccountId: string;
    paymentIntentId: string;
    refundId: string;
    amountMinor: bigint;
    currency: FinanceCurrency;
    creationPermitted: boolean;
  }): Promise<{
    id: string;
    amountMinor: bigint;
    currency: FinanceCurrency;
    status: FinanceStripeRefundStatus;
    createdAt: Date;
  }>;
}

export class FinanceStripeRefundProviderError extends Error {
  constructor(readonly retryable: boolean) {
    super("Stripe refund is temporarily unavailable");
    this.name = "FinanceStripeRefundProviderError";
  }
}

export class FinanceStripeRefundUnknownOutcomeError extends FinanceStripeRefundProviderError {
  constructor() {
    super(true);
  }
}

export class DisabledFinanceStripeRefundProvider implements FinanceStripeRefundProvider {
  async retrieveChargePaymentIntent(): Promise<never> {
    throw new ServiceUnavailableException(
      "Finance Stripe refunds are not configured",
    );
  }

  async createRefund(): Promise<never> {
    throw new ServiceUnavailableException(
      "Finance Stripe refunds are not configured",
    );
  }
}

export class StripeFinanceRefundProvider implements FinanceStripeRefundProvider {
  constructor(
    private readonly config: Exclude<
      FinanceStripeServicingConfig,
      { mode: "disabled" }
    >,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async retrieveChargePaymentIntent(input: {
    stripeAccountId: string;
    chargeId: string;
  }): Promise<string | null> {
    const payload = await this.request(
      input.stripeAccountId,
      `/v1/charges/${encodeURIComponent(input.chargeId)}`,
    );
    const parsed = chargeSchema.safeParse(payload);
    if (!parsed.success || parsed.data.id !== input.chargeId) {
      throw new FinanceStripeRefundProviderError(true);
    }
    return paymentIntentId(parsed.data.payment_intent);
  }

  async createRefund(input: {
    stripeAccountId: string;
    paymentIntentId: string;
    refundId: string;
    amountMinor: bigint;
    currency: FinanceCurrency;
    creationPermitted: boolean;
  }): Promise<{
    id: string;
    amountMinor: bigint;
    currency: FinanceCurrency;
    status: FinanceStripeRefundStatus;
    createdAt: Date;
  }> {
    const amount = Number(input.amountMinor);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new FinanceStripeRefundProviderError(false);
    }

    const existingRefund = await this.findExistingRefund(input);
    if (existingRefund) return existingRefund;
    if (!input.creationPermitted)
      throw new FinanceStripeRefundUnknownOutcomeError();

    const form = new URLSearchParams();
    form.set("payment_intent", input.paymentIntentId);
    form.set("amount", amount.toString());
    form.set("reason", "requested_by_customer");
    form.set("metadata[finance_refund_id]", input.refundId);

    const response = await this.request(
      input.stripeAccountId,
      "/v1/refunds",
      `finance-refund-${input.refundId}`,
      form.toString(),
    );
    const parsed = refundSchema.safeParse(response);
    if (
      !parsed.success ||
      parsed.data.livemode !== (this.config.mode === "live") ||
      parsed.data.amount !== amount ||
      parsed.data.currency.toUpperCase() !== input.currency
    ) {
      throw new FinanceStripeRefundProviderError(true);
    }
    return {
      id: parsed.data.id,
      amountMinor: BigInt(parsed.data.amount),
      currency: input.currency,
      status: parsed.data.status,
      createdAt: new Date(parsed.data.created * 1_000),
    };
  }

  private async findExistingRefund(input: {
    stripeAccountId: string;
    paymentIntentId: string;
    refundId: string;
    amountMinor: bigint;
    currency: FinanceCurrency;
  }) {
    let startingAfter: string | undefined;
    let existingRefund: z.infer<typeof refundSchema> | undefined;
    let hasMore = true;
    let pages = 0;

    while (hasMore) {
      if (++pages > 10) throw new FinanceStripeRefundProviderError(true);
      const query = new URLSearchParams({
        payment_intent: input.paymentIntentId,
        limit: "100",
      });
      if (startingAfter) query.set("starting_after", startingAfter);

      const response = await this.request(
        input.stripeAccountId,
        `/v1/refunds?${query.toString()}`,
      );
      const parsed = refundListSchema.safeParse(response);
      if (!parsed.success) throw new FinanceStripeRefundProviderError(true);

      const matches = parsed.data.data.filter(
        (refund) => refund.metadata?.finance_refund_id === input.refundId,
      );
      if (matches.length > 1 || (existingRefund && matches.length > 0)) {
        throw new FinanceStripeRefundProviderError(true);
      }
      existingRefund = matches[0] ?? existingRefund;

      hasMore = parsed.data.has_more;
      if (!hasMore) continue;
      const lastId = parsed.data.data.at(-1)?.id;
      if (!lastId || lastId === startingAfter)
        throw new FinanceStripeRefundProviderError(true);
      startingAfter = lastId;
    }

    if (!existingRefund) return null;
    if (
      existingRefund.livemode !== (this.config.mode === "live") ||
      existingRefund.amount !== Number(input.amountMinor) ||
      existingRefund.currency.toUpperCase() !== input.currency
    ) {
      throw new FinanceStripeRefundProviderError(true);
    }

    return {
      id: existingRefund.id,
      amountMinor: BigInt(existingRefund.amount),
      currency: input.currency,
      status: existingRefund.status,
      createdAt: new Date(existingRefund.created * 1_000),
    };
  }

  private async request(
    stripeAccountId: string,
    path: string,
    idempotencyKey?: string,
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
        throw new FinanceStripeRefundProviderError(
          response.status === 408 ||
            response.status === 409 ||
            response.status === 429 ||
            response.status >= 500,
        );
      }
      return payload;
    } catch (error) {
      if (error instanceof FinanceStripeRefundProviderError) throw error;
      throw new FinanceStripeRefundProviderError(true);
    }
  }
}

function paymentIntentId(value: string | { id: string } | null): string | null {
  if (typeof value === "string") return value;
  return value?.id ?? null;
}
