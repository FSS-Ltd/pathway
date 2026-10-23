import { ServiceUnavailableException } from "@nestjs/common";
import { z } from "zod";
import type { FinanceStripeServicingConfig } from "./finance-stripe-servicing.config";

export type StripeFinanceAccount = {
  id: string;
  livemode: boolean;
  country: string;
  cardPaymentsStatus: string;
};

const accountSchema = z.object({
  id: z.string().startsWith("acct_"),
  livemode: z.boolean(),
  identity: z.object({ country: z.string().length(2) }),
  configuration: z.object({
    merchant: z.object({
      capabilities: z.object({
        card_payments: z.object({ status: z.string().min(1) }),
      }),
    }),
  }),
});

export function parseFinanceStripeAccount(
  value: unknown,
): StripeFinanceAccount {
  const parsed = accountSchema.safeParse(value);
  if (!parsed.success) throw unavailable();
  return {
    id: parsed.data.id,
    livemode: parsed.data.livemode,
    country: parsed.data.identity.country.toUpperCase(),
    cardPaymentsStatus:
      parsed.data.configuration.merchant.capabilities.card_payments.status,
  };
}

export function financeStripeAccountStatus(
  account: StripeFinanceAccount,
): "CONNECTING" | "READY" | "RESTRICTED" {
  if (account.cardPaymentsStatus === "active") return "READY";
  if (account.cardPaymentsStatus === "pending") return "CONNECTING";
  return "RESTRICTED";
}

export const FINANCE_STRIPE_ACCOUNT_READER = Symbol(
  "FINANCE_STRIPE_ACCOUNT_READER",
);
export interface FinanceStripeAccountReader {
  retrieveAccount(accountId: string): Promise<StripeFinanceAccount>;
}

export class StripeFinanceAccountReader implements FinanceStripeAccountReader {
  constructor(
    private readonly config: FinanceStripeServicingConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  async retrieveAccount(accountId: string): Promise<StripeFinanceAccount> {
    if (
      this.config.mode === "disabled" ||
      accountId.length > 255 ||
      !/^acct_[A-Za-z0-9_]+$/.test(accountId)
    )
      throw unavailable();
    const query = new URLSearchParams();
    query.append("include[0]", "configuration.merchant");
    query.append("include[1]", "identity");
    query.append("include[2]", "defaults");
    try {
      const response = await this.fetcher(
        `https://api.stripe.com/v2/core/accounts/${encodeURIComponent(accountId)}?${query.toString()}`,
        {
          method: "GET",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${this.config.secretKey}`,
            "Stripe-Version": "2026-09-30.endive",
          },
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!response.ok) throw unavailable();
      const payload: unknown = await response.json();
      const account = parseFinanceStripeAccount(payload);
      if (
        account.id !== accountId ||
        account.livemode !== (this.config.mode === "live")
      )
        throw unavailable();
      return account;
    } catch {
      throw unavailable();
    }
  }
}

function unavailable(): ServiceUnavailableException {
  return new ServiceUnavailableException(
    "Finance Stripe account status is unavailable",
  );
}
