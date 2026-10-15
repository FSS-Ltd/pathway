import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  INSTITUTIONAL_MAPPED_PRICE_CODES,
  type InstitutionalMappedPriceCode,
  type InstitutionalResolvedPrices,
} from "@pathway/pricing";
import {
  BILLING_PROVIDER_CONFIG,
  type BillingProviderConfig,
} from "../billing-provider.config";
import { BillingPricingService, type BillingPrice } from "../pricing.service";

const priceCodes: ReadonlySet<string> = new Set(
  INSTITUTIONAL_MAPPED_PRICE_CODES,
);

function isMappedPriceCode(code: string): code is InstitutionalMappedPriceCode {
  return priceCodes.has(code);
}

export function resolveInstitutionalPrices(
  prices: readonly BillingPrice[],
  expectedLivemode: boolean,
): InstitutionalResolvedPrices {
  const resolved: Partial<
    Record<
      InstitutionalMappedPriceCode,
      { priceId: string; unitAmountPence: number }
    >
  > = {};
  for (const price of prices) {
    if (!isMappedPriceCode(price.code)) continue;
    const interval = price.code.endsWith("_YEARLY") ? "year" : "month";
    if (
      !price.active ||
      price.livemode !== expectedLivemode ||
      price.currency !== "gbp" ||
      price.interval !== interval ||
      price.intervalCount !== 1 ||
      price.usageType !== "licensed" ||
      !Number.isSafeInteger(price.unitAmount) ||
      price.unitAmount <= 0 ||
      !/^price_[A-Za-z0-9]+$/.test(price.priceId)
    ) {
      continue;
    }
    resolved[price.code] = {
      priceId: price.priceId,
      unitAmountPence: price.unitAmount,
    };
  }
  return resolved;
}

@Injectable()
export class InstitutionalPriceResolver {
  constructor(
    @Inject(BillingPricingService)
    private readonly billingPrices: BillingPricingService,
    @Inject(BILLING_PROVIDER_CONFIG)
    private readonly config: BillingProviderConfig,
  ) {}

  async resolve(): Promise<InstitutionalResolvedPrices> {
    if (
      this.config.activeProvider !== "STRIPE" &&
      this.config.activeProvider !== "STRIPE_TEST"
    ) {
      throw new ServiceUnavailableException({
        code: "INSTITUTIONAL_PRICING_UNAVAILABLE",
      });
    }
    const response = await this.billingPrices.listPrices();
    if (response.provider !== "stripe") {
      throw new ServiceUnavailableException({
        code: "INSTITUTIONAL_PRICING_UNAVAILABLE",
      });
    }
    return resolveInstitutionalPrices(
      response.prices,
      this.config.activeProvider === "STRIPE",
    );
  }
}
