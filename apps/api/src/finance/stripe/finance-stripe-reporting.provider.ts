import { ServiceUnavailableException } from "@nestjs/common";
import { z } from "zod";

const STRIPE_API_VERSION = "2026-09-30.endive";
const STRIPE_API_BASE_URL = "https://api.stripe.com";
const MAX_PAGES = 100;

const listSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ data: z.array(item), has_more: z.boolean() });

const balanceTransactionSchema = z.object({
  id: z.string().min(1),
  amount: z.number().int(),
  fee: z.number().int(),
  currency: z.string().regex(/^[a-z]{3}$/),
  created: z.number().int().nonnegative(),
  type: z.string().min(1),
});

const payoutSchema = z.object({
  id: z.string().min(1),
  amount: z.number().int(),
  currency: z.string().regex(/^[a-z]{3}$/),
  created: z.number().int().nonnegative(),
  arrival_date: z.number().int().nonnegative().nullable().optional(),
  status: z.enum(["pending", "in_transit", "paid", "failed", "canceled"]),
  balance_transaction: z.string().nullable().optional(),
});

export interface StripeFinanceReportRange {
  from: Date;
  to: Date;
}

export interface StripeFinanceReportingResult {
  fetchedAt: string;
  feesByCurrency: Array<{ currency: string; amountMinor: string }>;
  payouts: Array<{
    id: string;
    amountMinor: string;
    currency: string;
    createdAt: string;
    arrivalAt: string | null;
    status: "pending" | "in_transit" | "paid" | "failed" | "canceled";
    balanceTransactionId: string | null;
  }>;
}

export interface FinanceStripeReportingClient {
  listReportActivity(
    accountId: string,
    range: StripeFinanceReportRange,
  ): Promise<StripeFinanceReportingResult>;
}

export const FINANCE_STRIPE_REPORTING_PROVIDER = Symbol(
  "FINANCE_STRIPE_REPORTING_PROVIDER",
);

export class StripeFinanceReportingProvider implements FinanceStripeReportingClient {
  constructor(
    private readonly secretKey: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async listReportActivity(
    accountId: string,
    range: StripeFinanceReportRange,
  ): Promise<StripeFinanceReportingResult> {
    if (!accountId.startsWith("acct_")) throw providerUnavailable();
    const [transactions, payouts] = await Promise.all([
      this.listPages(
        "/v1/balance_transactions",
        accountId,
        range,
        listSchema(balanceTransactionSchema),
      ),
      this.listPages("/v1/payouts", accountId, range, listSchema(payoutSchema)),
    ]);
    const fees = new Map<string, bigint>();
    for (const transaction of transactions) {
      const currency = transaction.currency.toUpperCase();
      fees.set(currency, (fees.get(currency) ?? 0n) + BigInt(transaction.fee));
    }
    return {
      fetchedAt: this.now().toISOString(),
      feesByCurrency: [...fees.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([currency, amount]) => ({
          currency,
          amountMinor: amount.toString(),
        })),
      payouts: payouts.map((payout) => ({
        id: payout.id,
        amountMinor: String(payout.amount),
        currency: payout.currency.toUpperCase(),
        createdAt: new Date(payout.created * 1000).toISOString(),
        arrivalAt: payout.arrival_date
          ? new Date(payout.arrival_date * 1000).toISOString()
          : null,
        status: payout.status,
        balanceTransactionId: payout.balance_transaction ?? null,
      })),
    };
  }

  private async listPages<T extends { id: string }>(
    path: string,
    accountId: string,
    range: StripeFinanceReportRange,
    schema: z.ZodType<{ data: T[]; has_more: boolean }>,
  ): Promise<T[]> {
    const rows: T[] = [];
    let startingAfter: string | null = null;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const query = new URLSearchParams({
        limit: "100",
        "created[gte]": String(Math.floor(range.from.getTime() / 1000)),
        "created[lt]": String(Math.floor(range.to.getTime() / 1000)),
      });
      if (startingAfter) query.set("starting_after", startingAfter);
      const response = await this.fetcher(
        `${STRIPE_API_BASE_URL}${path}?${query.toString()}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            "Stripe-Version": STRIPE_API_VERSION,
            "Stripe-Account": accountId,
          },
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        },
      ).catch(() => null);
      if (!response?.ok) throw providerUnavailable();
      const payload: unknown = await response.json().catch(() => null);
      const parsed = schema.safeParse(payload);
      if (!parsed.success) throw providerUnavailable();
      rows.push(...parsed.data.data);
      if (!parsed.data.has_more) return rows;
      const last = parsed.data.data.at(-1);
      if (!last || last.id === startingAfter) throw providerUnavailable();
      startingAfter = last.id;
    }
    throw providerUnavailable();
  }
}

function providerUnavailable(): ServiceUnavailableException {
  return new ServiceUnavailableException(
    "Connected Stripe report data is unavailable",
  );
}
