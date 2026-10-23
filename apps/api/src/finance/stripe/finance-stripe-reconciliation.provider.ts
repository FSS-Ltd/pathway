import { z } from "zod";

export type FinanceReconciliationStream =
  | "events"
  | "checkoutSessions"
  | "paymentIntents"
  | "charges"
  | "refunds"
  | "disputes"
  | "balanceTransactions"
  | "payouts";

export type FinanceReconciliationObject = {
  id: string;
  object: string;
  created: number;
  [field: string]: unknown;
};

export interface FinanceReconciliationScope {
  stripeAccountId: string;
  livemode: boolean;
}

export interface FinanceReconciliationRange {
  from: Date;
  to: Date;
  startingAfter?: string;
}

export class FinanceStripeReconciliationError extends Error {
  constructor(
    readonly reason:
      | "UNAVAILABLE"
      | "INVALID_CURSOR"
      | "INVALID_RESPONSE"
      | "INVALID_SCOPE",
  ) {
    super("Stripe reconciliation data is unavailable");
  }
}

const resources = {
  events: { path: "/v1/events", object: "event", prefix: "evt_" },
  checkoutSessions: {
    path: "/v1/checkout/sessions",
    object: "checkout.session",
    prefix: "cs_",
  },
  paymentIntents: {
    path: "/v1/payment_intents",
    object: "payment_intent",
    prefix: "pi_",
  },
  charges: { path: "/v1/charges", object: "charge", prefix: ["ch_", "py_"] },
  refunds: { path: "/v1/refunds", object: "refund", prefix: "re_" },
  disputes: { path: "/v1/disputes", object: "dispute", prefix: "du_" },
  balanceTransactions: {
    path: "/v1/balance_transactions",
    object: "balance_transaction",
    prefix: "txn_",
  },
  payouts: { path: "/v1/payouts", object: "payout", prefix: "po_" },
} satisfies Record<
  FinanceReconciliationStream,
  { path: string; object: string; prefix: string | readonly string[] }
>;

const objectSchema = z
  .object({
    id: z.string().min(1).max(255),
    object: z.string(),
    created: z.number().int().safe().nonnegative(),
    livemode: z.boolean().optional(),
    account: z.string().nullable().optional(),
  })
  .passthrough();

const pageSchema = z.object({
  object: z.literal("list"),
  data: z.array(z.unknown()).max(100),
  has_more: z.boolean(),
});

const cursorErrorSchema = z.object({
  error: z.object({ param: z.literal("starting_after") }),
});

/** Reads provider evidence only. No monetary endpoint is exposed by this adapter. */
export class StripeFinanceReconciliationProvider {
  constructor(
    private readonly secretKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async listPage(
    scope: FinanceReconciliationScope,
    stream: FinanceReconciliationStream,
    range: FinanceReconciliationRange,
  ): Promise<{
    data: FinanceReconciliationObject[];
    nextCursor: string | null;
  }> {
    const from = Math.floor(range.from.getTime() / 1000);
    const to = Math.floor(range.to.getTime() / 1000);
    if (
      !Number.isSafeInteger(from) ||
      !Number.isSafeInteger(to) ||
      from < 0 ||
      to <= from ||
      (stream === "events" && to - from > 30 * 24 * 60 * 60)
    ) {
      throw new FinanceStripeReconciliationError("INVALID_SCOPE");
    }
    if (range.startingAfter) assertIdentity(stream, range.startingAfter);
    const query = new URLSearchParams({
      limit: "100",
      "created[gte]": String(from),
      "created[lt]": String(to),
    });
    if (range.startingAfter) query.set("starting_after", range.startingAfter);
    const payload = await this.request(
      scope,
      `${resources[stream].path}?${query}`,
      Boolean(range.startingAfter),
    );
    const parsed = pageSchema.safeParse(payload);
    if (!parsed.success)
      throw new FinanceStripeReconciliationError("INVALID_RESPONSE");
    const data = parsed.data.data.map((row) => parseObject(scope, stream, row));
    if (
      data.some(
        (row) =>
          row.created < from ||
          row.created >= to ||
          row.id === range.startingAfter,
      ) ||
      new Set(data.map((row) => row.id)).size !== data.length ||
      (parsed.data.has_more && data.length === 0)
    ) {
      throw new FinanceStripeReconciliationError("INVALID_RESPONSE");
    }
    return {
      data,
      nextCursor: parsed.data.has_more ? data[data.length - 1].id : null,
    };
  }

  async retrieve(
    scope: FinanceReconciliationScope,
    stream: FinanceReconciliationStream,
    id: string,
  ): Promise<FinanceReconciliationObject> {
    assertIdentity(stream, id);
    const payload = await this.request(
      scope,
      `${resources[stream].path}/${encodeURIComponent(id)}`,
    );
    const object = parseObject(scope, stream, payload);
    if (object.id !== id)
      throw new FinanceStripeReconciliationError("INVALID_RESPONSE");
    return object;
  }

  private async request(
    scope: FinanceReconciliationScope,
    path: string,
    hasCursor = false,
  ): Promise<unknown> {
    const mode = /^(sk|rk)_test_/.test(this.secretKey)
      ? "test"
      : /^(sk|rk)_live_/.test(this.secretKey)
        ? "live"
        : null;
    if (
      !/^acct_[A-Za-z0-9_]+$/.test(scope.stripeAccountId) ||
      !mode ||
      scope.livemode !== (mode === "live")
    ) {
      throw new FinanceStripeReconciliationError("INVALID_SCOPE");
    }
    const response = await this.fetcher(`https://api.stripe.com${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Stripe-Account": scope.stripeAccountId,
        "Stripe-Version": "2026-09-30.endive",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!response) throw new FinanceStripeReconciliationError("UNAVAILABLE");
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new FinanceStripeReconciliationError(
        response.status === 400 &&
          hasCursor &&
          cursorErrorSchema.safeParse(payload).success
          ? "INVALID_CURSOR"
          : "UNAVAILABLE",
      );
    }
    return payload;
  }
}

function assertIdentity(stream: FinanceReconciliationStream, id: string): void {
  const prefix = resources[stream].prefix;
  const prefixes = typeof prefix === "string" ? [prefix] : prefix;
  if (
    !prefixes.some((allowed) => id.startsWith(allowed)) ||
    id.length > 255 ||
    !/^[A-Za-z0-9_]+$/.test(id)
  ) {
    throw new FinanceStripeReconciliationError("INVALID_SCOPE");
  }
}

function parseObject(
  scope: FinanceReconciliationScope,
  stream: FinanceReconciliationStream,
  value: unknown,
): FinanceReconciliationObject {
  const parsed = objectSchema.safeParse(value);
  if (!parsed.success)
    throw new FinanceStripeReconciliationError("INVALID_RESPONSE");
  const row = parsed.data;
  assertIdentity(stream, row.id);
  if (
    row.object !== resources[stream].object ||
    (stream !== "balanceTransactions" && row.livemode !== scope.livemode) ||
    (row.livemode !== undefined && row.livemode !== scope.livemode) ||
    (row.account != null && row.account !== scope.stripeAccountId)
  ) {
    throw new FinanceStripeReconciliationError("INVALID_RESPONSE");
  }
  return row;
}
