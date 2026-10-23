import { ServiceUnavailableException } from "@nestjs/common";
import { z } from "zod";
import type { FinanceCountryCode } from "@pathway/platform";
import type { FinanceStripeConnectConfig } from "./finance-stripe-connect.config";
import {
  parseFinanceStripeAccount,
  StripeFinanceAccountReader,
  type StripeFinanceAccount,
} from "./finance-stripe-account-reader.provider";
export type { StripeFinanceAccount } from "./finance-stripe-account-reader.provider";

const STRIPE_API_VERSION = "2026-09-30.endive";
const STRIPE_API_BASE_URL = "https://api.stripe.com";
const CONNECT_LINK_HOSTS = new Set([
  "accounts.stripe.com",
  "connect.stripe.com",
]);
export const FINANCE_STRIPE_CONNECT_PROVIDER = Symbol(
  "FINANCE_STRIPE_CONNECT_PROVIDER",
);

const stripeAccountLinkSchema = z.object({
  url: z.string().url(),
  expires_at: z.string().datetime({ offset: true }),
});

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
    return parseFinanceStripeAccount(response);
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
    return new StripeFinanceAccountReader(
      this.config,
      this.fetcher,
    ).retrieveAccount(accountId);
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
