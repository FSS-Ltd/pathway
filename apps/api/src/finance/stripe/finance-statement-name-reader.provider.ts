import { ServiceUnavailableException } from "@nestjs/common";
import { z } from "zod";
import type { FinanceStripeServicingConfig } from "./finance-stripe-servicing.config";

export type FinanceProviderStatementName = {
  id: string;
  livemode: boolean;
  country: string;
  descriptor: string | null;
  dashboard: string;
};
export const FINANCE_STATEMENT_NAME_READER = Symbol(
  "FINANCE_STATEMENT_NAME_READER",
);
export interface FinanceStatementNameReader {
  retrieve(accountId: string): Promise<FinanceProviderStatementName>;
}
const accountSchema = z.object({
  id: z.string(),
  livemode: z.boolean(),
  dashboard: z.string(),
  identity: z.object({ country: z.string().length(2) }),
  configuration: z.object({
    merchant: z.object({
      statement_descriptor: z
        .object({
          descriptor: z.string().max(255).nullable(),
        })
        .nullable(),
    }),
  }),
});

/** Reads provider evidence only. Full Dashboard owners make edits in Stripe. */
export class StripeFinanceStatementNameReader implements FinanceStatementNameReader {
  constructor(
    private readonly config: FinanceStripeServicingConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async retrieve(accountId: string): Promise<FinanceProviderStatementName> {
    if (
      this.config.mode === "disabled" ||
      !/^acct_[A-Za-z0-9_]{1,250}$/.test(accountId)
    )
      throw unavailable();
    const query = new URLSearchParams({
      "include[0]": "configuration.merchant",
      "include[1]": "identity",
    });
    try {
      const response = await this.fetcher(
        `https://api.stripe.com/v2/core/accounts/${encodeURIComponent(accountId)}?${query}`,
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
      const account = accountSchema.parse(payload);
      if (
        account.id !== accountId ||
        account.livemode !== (this.config.mode === "live")
      )
        throw unavailable();
      return {
        id: account.id,
        livemode: account.livemode,
        country: account.identity.country.toUpperCase(),
        dashboard: account.dashboard,
        descriptor:
          account.configuration.merchant.statement_descriptor?.descriptor ??
          null,
      };
    } catch {
      throw unavailable();
    }
  }
}
function unavailable(): ServiceUnavailableException {
  return new ServiceUnavailableException(
    "School statement name is unavailable",
  );
}
