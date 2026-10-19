import { ServiceUnavailableException } from "@nestjs/common";
import { z } from "zod";
import type { FinanceCountryCode } from "@pathway/platform";
import type { FinanceStripeConnectConfig } from "./finance-stripe-connect.config";

const STRIPE_API_VERSION = "2026-09-30.endive";
const STRIPE_API_BASE_URL = "https://api.stripe.com";
const CONNECT_LINK_HOSTS = new Set([
  "accounts.stripe.com",
  "connect.stripe.com",
]);
export const FINANCE_STRIPE_CONNECT_PROVIDER = Symbol(
  "FINANCE_STRIPE_CONNECT_PROVIDER",
);

const stripeAccountSchema = z.object({
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

const stripeAccountLinkSchema = z.object({
  url: z.string().url(),
  expires_at: z.string().datetime({ offset: true }),
});

export type StripeFinanceAccount = {
  id: string;
  livemode: boolean;
  country: string;
  cardPaymentsStatus: string;
};

export type StripeFinanceAccountLink = {
  url: string;
  expiresAt: string;
};

export interface FinanceStripeConnectProvider {
  createAccount(input: {
    legalEntityName: string;
    countryCode: FinanceCountryCode;
    connectionId: string;
    idempotencyKey: string;
  }): Promise<StripeFinanceAccount>;
  createOnboardingLink(input: {
    accountId: string;
    idempotencyKey: string;
  }): Promise<StripeFinanceAccountLink>;
  retrieveAccount(accountId: string): Promise<StripeFinanceAccount>;
}

export class StripeFinanceConnectProvider implements FinanceStripeConnectProvider {
  constructor(
    private readonly config: Exclude<
      FinanceStripeConnectConfig,
      { mode: "disabled" }
    >,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async createAccount(input: {
    legalEntityName: string;
    countryCode: FinanceCountryCode;
    connectionId: string;
    idempotencyKey: string;
  }): Promise<StripeFinanceAccount> {
    const response = await this.request("/v2/core/accounts", {
      method: "POST",
      idempotencyKey: input.idempotencyKey,
      body: {
        display_name: input.legalEntityName,
        identity: {
          country: input.countryCode.toLowerCase(),
          entity_type: "company",
          business_details: { registered_name: input.legalEntityName },
        },
        configuration: {
          merchant: { capabilities: { card_payments: { requested: true } } },
        },
        defaults: {
          responsibilities: {
            fees_collector: "stripe",
            losses_collector: "stripe",
          },
        },
        dashboard: "full",
        metadata: { finance_connection_id: input.connectionId },
        include: ["configuration.merchant", "identity", "defaults"],
      },
    });
    return this.parseAccount(response);
  }

  async createOnboardingLink(input: {
    accountId: string;
    idempotencyKey: string;
  }): Promise<StripeFinanceAccountLink> {
    const response = await this.request("/v2/core/account_links", {
      method: "POST",
      idempotencyKey: input.idempotencyKey,
      body: {
        account: input.accountId,
        use_case: {
          type: "account_onboarding",
          account_onboarding: {
            return_url: this.config.returnUrl,
            refresh_url: this.config.refreshUrl,
          },
        },
      },
    });
    const link = stripeAccountLinkSchema.safeParse(response);
    if (!link.success) throw providerUnavailable();
    const url = new URL(link.data.url);
    if (url.protocol !== "https:" || !CONNECT_LINK_HOSTS.has(url.hostname)) {
      throw providerUnavailable();
    }
    return { url: url.toString(), expiresAt: link.data.expires_at };
  }

  async retrieveAccount(accountId: string): Promise<StripeFinanceAccount> {
    const query = new URLSearchParams();
    query.append("include[0]", "configuration.merchant");
    query.append("include[1]", "identity");
    query.append("include[2]", "defaults");
    const response = await this.request(
      `/v2/core/accounts/${encodeURIComponent(accountId)}?${query.toString()}`,
      { method: "GET" },
    );
    return this.parseAccount(response);
  }

  private async request(
    path: string,
    options: {
      method: "GET" | "POST";
      idempotencyKey?: string;
      body?: Record<string, unknown>;
    },
  ): Promise<unknown> {
    try {
      const response = await this.fetcher(`${STRIPE_API_BASE_URL}${path}`, {
        method: options.method,
        headers: {
          Authorization: `Bearer ${this.config.secretKey}`,
          "Stripe-Version": STRIPE_API_VERSION,
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(options.idempotencyKey
            ? { "Idempotency-Key": options.idempotencyKey }
            : {}),
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        signal: AbortSignal.timeout(10_000),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw providerUnavailable();
      return payload;
    } catch {
      throw providerUnavailable();
    }
  }

  private parseAccount(value: unknown): StripeFinanceAccount {
    const result = stripeAccountSchema.safeParse(value);
    if (!result.success) throw providerUnavailable();
    return {
      id: result.data.id,
      livemode: result.data.livemode,
      country: result.data.identity.country.toUpperCase(),
      cardPaymentsStatus:
        result.data.configuration.merchant.capabilities.card_payments.status,
    };
  }
}

export class DisabledFinanceStripeConnectProvider implements FinanceStripeConnectProvider {
  async createAccount(): Promise<StripeFinanceAccount> {
    throw providerUnavailable();
  }

  async createOnboardingLink(): Promise<StripeFinanceAccountLink> {
    throw providerUnavailable();
  }

  async retrieveAccount(): Promise<StripeFinanceAccount> {
    throw providerUnavailable();
  }
}

function providerUnavailable(): ServiceUnavailableException {
  return new ServiceUnavailableException("Stripe connection is unavailable");
}
