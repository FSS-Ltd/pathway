import { z } from "zod";
import {
  FinanceStripeReconciliationError,
  type FinanceReconciliationScope,
} from "./finance-stripe-reconciliation.provider";
import { projectFinanceBalanceTransaction } from "../reconciliation/finance-settlement.projection";

const page = z.object({
  object: z.literal("list"),
  data: z.array(z.unknown()).max(100),
  has_more: z.boolean(),
});
const cursor = /^txn_[A-Za-z0-9_]+$/;

/** Payout-filtered reads are valid only for automatic payouts. No mutation endpoint exists. */
export class StripeFinancePayoutConstituentsProvider {
  constructor(
    private readonly secretKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async listPage(
    scope: FinanceReconciliationScope,
    payoutId: string,
    options: { startingAfter?: string; pageSize?: number } = {},
  ): Promise<{ data: unknown[]; nextCursor: string | null }> {
    const size = options.pageSize ?? 100;
    const mode = /^(sk|rk)_test_/.test(this.secretKey)
      ? false
      : /^(sk|rk)_live_/.test(this.secretKey)
        ? true
        : null;
    if (
      mode === null ||
      mode !== scope.livemode ||
      !/^acct_[A-Za-z0-9_]+$/.test(scope.stripeAccountId) ||
      !/^po_[A-Za-z0-9_]+$/.test(payoutId) ||
      payoutId.length > 255 ||
      !Number.isInteger(size) ||
      size < 1 ||
      size > 100 ||
      (options.startingAfter &&
        (!cursor.test(options.startingAfter) ||
          options.startingAfter.length > 255))
    )
      throw new FinanceStripeReconciliationError("INVALID_SCOPE");
    const query = new URLSearchParams({
      payout: payoutId,
      limit: String(size),
    });
    if (options.startingAfter)
      query.set("starting_after", options.startingAfter);
    const response = await this.fetcher(
      `https://api.stripe.com/v1/balance_transactions?${query}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          "Stripe-Account": scope.stripeAccountId,
          "Stripe-Version": "2026-09-30.endive",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      },
    ).catch(() => null);
    if (!response) throw new FinanceStripeReconciliationError("UNAVAILABLE");
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const cursorError = z
        .object({ error: z.object({ param: z.literal("starting_after") }) })
        .safeParse(payload).success;
      throw new FinanceStripeReconciliationError(
        response.status === 400 && options.startingAfter && cursorError
          ? "INVALID_CURSOR"
          : "UNAVAILABLE",
      );
    }
    const parsed = page.safeParse(payload);
    if (!parsed.success || parsed.data.data.length > size)
      throw new FinanceStripeReconciliationError("INVALID_RESPONSE");
    let data;
    try {
      data = parsed.data.data.map((row) =>
        projectFinanceBalanceTransaction(scope, row),
      );
    } catch {
      throw new FinanceStripeReconciliationError("INVALID_RESPONSE");
    }
    if (
      new Set(data.map((row) => row.id)).size !== data.length ||
      data.some((row) => row.id === options.startingAfter) ||
      (parsed.data.has_more && data.length === 0)
    )
      throw new FinanceStripeReconciliationError("INVALID_RESPONSE");
    return {
      data,
      nextCursor: parsed.data.has_more ? data[data.length - 1].id : null,
    };
  }
}
