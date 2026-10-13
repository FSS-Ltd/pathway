import Stripe from "stripe";
import { Injectable, Logger } from "@nestjs/common";
import {
  BILLING_PROVIDER_CONFIG,
  type BillingProviderConfig,
} from "./billing-provider.config";
import type { PlanCode } from "./billing-plans";
import { Inject } from "@nestjs/common";

type CachedPrices = {
  fetchedAt: number;
  data: BillingPricesResponse;
};

export type BillingPrice = {
  code: string; // PlanCode or add-on code key from priceMap
  priceId: string;
  currency: string;
  unitAmount: number;
  interval: "month" | "year" | null;
  intervalCount: number | null;
  active: boolean;
  livemode: boolean;
  usageType: "licensed" | "metered" | null;
  productName?: string | null;
  description?: string | null;
};

export type BillingPricesResponse = {
  provider: "stripe" | "fake";
  prices: BillingPrice[];
  warnings?: string[];
};

@Injectable()
export class BillingPricingService {
  private readonly logger = new Logger(BillingPricingService.name);
  private readonly stripe: Stripe | null;
  private cache: CachedPrices | null = null;
  private readonly cacheTtlMs = 5 * 60 * 1000; // 5 minutes

  constructor(
    @Inject(BILLING_PROVIDER_CONFIG)
    private readonly config: BillingProviderConfig,
  ) {
    if (config.stripe.secretKey) {
      this.stripe = new Stripe(config.stripe.secretKey, {
        apiVersion: "2023-10-16",
      });
    } else {
      this.stripe = null;
    }
  }

  async listPrices(forceRefresh = false): Promise<BillingPricesResponse> {
    if (!forceRefresh && this.cache && !this.isExpired(this.cache.fetchedAt)) {
      return this.cache.data;
    }

    // Report provider from config so response matches billing provider (STRIPE vs FAKE)
    const isStripeMode =
      this.config.activeProvider === "STRIPE" ||
      this.config.activeProvider === "STRIPE_TEST";

    if (!this.stripe || !this.config.stripe.priceMap) {
      const reason = !this.stripe ? "no_stripe_client" : "no_price_map";
      const diag = this.config.stripe.priceMapDiagnostics;
      this.logger.warn(
        `pricing_unavailable: ${reason} (stripe=${Boolean(this.stripe)}, priceMap=${Boolean(this.config.stripe.priceMap)}` +
          (diag
            ? `, rawSet=${diag.rawSet}, rawLength=${diag.rawLength}, parseSuccess=${diag.parseSuccess}, parseError=${diag.parseError ?? "none"}, keysExtracted=${diag.keysExtracted?.length ?? 0}`
            : "") +
          ")",
      );
      const data: BillingPricesResponse = {
        provider: isStripeMode ? "stripe" : "fake",
        prices: [],
        warnings: ["pricing_unavailable"],
      };
      this.setCache(data);
      return data;
    }

    const warnings: string[] = [];
    const prices: BillingPrice[] = [];

    const entries = Object.entries(this.config.stripe.priceMap) as Array<
      [PlanCode | string, string]
    >;

    for (const [code, priceId] of entries) {
      if (!priceId) continue;
      try {
        const price = await this.stripe.prices.retrieve(priceId, {
          expand: ["product"],
        });
        const interval =
          price.recurring?.interval === "month" ||
          price.recurring?.interval === "year"
            ? price.recurring.interval
            : null;
        const product =
          typeof price.product === "object" &&
          price.product !== null &&
          !("deleted" in price.product)
            ? (price.product as Stripe.Product)
            : null;

        if (
          price.unit_amount === null ||
          !Number.isSafeInteger(price.unit_amount) ||
          price.unit_amount < 0
        ) {
          warnings.push(`price_amount_unavailable:${code}`);
          continue;
        }

        prices.push({
          code,
          priceId,
          currency: price.currency,
          unitAmount: price.unit_amount,
          interval,
          intervalCount: price.recurring?.interval_count ?? null,
          active: price.active,
          livemode: price.livemode,
          usageType: price.recurring?.usage_type ?? null,
          productName: product?.name ?? null,
          description: product?.description ?? null,
        });
      } catch (err) {
        warnings.push(`price_fetch_failed:${code}`);
        this.logger.warn(
          `Failed to retrieve Stripe price for code ${code}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    const data: BillingPricesResponse = {
      provider: "stripe",
      prices,
      warnings: warnings.length ? warnings : undefined,
    };
    this.setCache(data);
    return data;
  }

  private isExpired(fetchedAt: number): boolean {
    return Date.now() - fetchedAt > this.cacheTtlMs;
  }

  private setCache(data: BillingPricesResponse) {
    this.cache = { fetchedAt: Date.now(), data };
  }
}
