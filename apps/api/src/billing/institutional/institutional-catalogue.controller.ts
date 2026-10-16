import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Post,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  calculateDeclaredCapacityQuote,
  DECLARED_CAPACITY_PLANS,
  DECLARED_CAPACITY_PRICING_VERSION,
  calculateMappedInstitutionalQuote,
  calculateInstitutionalQuote,
  INSTITUTIONAL_MAPPED_PLAN_CODES,
  INSTITUTIONAL_MAPPED_PRICING_VERSION,
  INSTITUTIONAL_PLANS,
  INSTITUTIONAL_PRICING_VERSION,
  InstitutionalMappedPriceError,
  mappedInstitutionalPlanDetails,
} from "@pathway/pricing";
import { Module } from "@pathway/db";
import { z } from "zod";
import { InstitutionalPriceResolver } from "./institutional-price-resolver";
import {
  assertDeclaredCapacityBillingEnabled,
  isDeclaredCapacityVatEnabled,
} from "./declared-capacity-gate";
import {
  DECLARED_CAPACITY_ADDON_MODULES,
  declaredCapacityAddonPriceCode,
} from "./declared-capacity-addons";
import {
  DeclaredCapacityStripePriceError,
  isDeclaredCapacityAddonPaidReady,
  isDeclaredCapacityAddonTrialReady,
  quoteDeclaredCapacityWithStripePrices,
} from "./declared-capacity-stripe-pricing";

const estimateSchema = z.object({
  planCode: z.enum([
    "INSTITUTIONAL_STARTER_MONTHLY",
    "INSTITUTIONAL_GROWTH_MONTHLY",
    "INSTITUTIONAL_PROFESSIONAL_MONTHLY",
  ]),
  enrolledChildren: z.number().int().nonnegative().safe(),
});

const mappedEstimateSchema = z.object({
  planCode: z.enum([
    "INSTITUTIONAL_STARTER_MONTHLY",
    "INSTITUTIONAL_STARTER_YEARLY",
    "INSTITUTIONAL_GROWTH_MONTHLY",
    "INSTITUTIONAL_GROWTH_YEARLY",
    "INSTITUTIONAL_PROFESSIONAL_MONTHLY",
    "INSTITUTIONAL_PROFESSIONAL_YEARLY",
  ]),
  enrolledChildren: z.number().int().nonnegative().safe(),
  storageChoice: z.enum(["none", "100", "200", "1000"]).default("none"),
});

const declaredCapacityEstimateSchema = z.object({
  declaredCapacity: z.number().int().nonnegative().safe(),
  interval: z.enum(["month", "year"]),
  payNowModules: z.array(z.nativeEnum(Module)).default([]),
  trialModules: z.array(z.nativeEnum(Module)).default([]),
});

@Controller("billing/institutional/catalogue")
export class InstitutionalCatalogueController {
  constructor(
    @Inject(InstitutionalPriceResolver)
    private readonly mappedPrices: Pick<InstitutionalPriceResolver, "resolve">,
  ) {}

  @Get()
  catalogue() {
    return {
      pricingVersion: INSTITUTIONAL_PRICING_VERSION,
      plans: Object.values(INSTITUTIONAL_PLANS),
    };
  }

  @Post("estimate")
  estimate(@Body() body: unknown) {
    const parsed = estimateSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "INVALID_ESTIMATE",
        details: parsed.error.flatten(),
      });
    }
    return calculateInstitutionalQuote({
      ...parsed.data,
      pricingVersion: INSTITUTIONAL_PRICING_VERSION,
    });
  }

  @Get("v2")
  async mappedCatalogue() {
    const prices = await this.mappedPrices.resolve();
    return {
      pricingVersion: INSTITUTIONAL_MAPPED_PRICING_VERSION,
      currency: "GBP" as const,
      plans: INSTITUTIONAL_MAPPED_PLAN_CODES.map((planCode) => {
        const details = mappedInstitutionalPlanDetails(planCode);
        try {
          const quote = calculateMappedInstitutionalQuote({
            planCode,
            enrolledChildren: 0,
            storageChoice: "none",
            prices,
          });
          return {
            ...details,
            available: true,
            basePrice: quote.kind === "priced" ? quote.lines[0] : null,
          };
        } catch (error) {
          if (
            !(error instanceof InstitutionalMappedPriceError) ||
            error.code !== "MISSING_PRICE"
          ) {
            throw error;
          }
          return {
            ...details,
            available: false,
            basePrice: null,
            retryable: true,
            unavailablePriceCode: error.priceCode,
          };
        }
      }),
    };
  }

  @Post("v2/estimate")
  async mappedEstimate(@Body() body: unknown) {
    const parsed = mappedEstimateSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "INVALID_ESTIMATE",
        details: parsed.error.flatten(),
      });
    }
    const prices = await this.mappedPrices.resolve();
    try {
      return calculateMappedInstitutionalQuote({ ...parsed.data, prices });
    } catch (error) {
      if (
        error instanceof InstitutionalMappedPriceError &&
        error.code === "MISSING_PRICE"
      ) {
        throw new ServiceUnavailableException({
          code: "INSTITUTIONAL_PRICE_UNAVAILABLE",
          priceCode: error.priceCode,
          retryable: true,
        });
      }
      throw error;
    }
  }

  @Get("declared-capacity")
  async declaredCapacityCatalogue() {
    assertDeclaredCapacityBillingEnabled();
    const prices = await this.mappedPrices.resolve();
    return {
      pricingVersion: DECLARED_CAPACITY_PRICING_VERSION,
      currency: "GBP" as const,
      pricesIncludeVat: isDeclaredCapacityVatEnabled(),
      intervals: ["month", "year"] as const,
      plans: Object.values(DECLARED_CAPACITY_PLANS),
      enterprise: {
        minimumCapacity: 251,
        contactPath: "/demo?plan=enterprise",
      },
      addonOptions: DECLARED_CAPACITY_ADDON_MODULES.map((module) => ({
        module,
        trialAvailable: isDeclaredCapacityAddonTrialReady(module, prices),
        monthlyPricePence: isDeclaredCapacityAddonPaidReady(
          module,
          "month",
          prices,
        )
          ? (prices[declaredCapacityAddonPriceCode(module, "month")]
              ?.unitAmountPence ?? null)
          : null,
        yearlyPricePence: isDeclaredCapacityAddonPaidReady(
          module,
          "year",
          prices,
        )
          ? (prices[declaredCapacityAddonPriceCode(module, "year")]
              ?.unitAmountPence ?? null)
          : null,
      })),
    };
  }

  @Post("declared-capacity/estimate")
  async estimateDeclaredCapacity(@Body() body: unknown) {
    assertDeclaredCapacityBillingEnabled();
    const parsed = declaredCapacityEstimateSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "INVALID_ESTIMATE",
        details: parsed.error.flatten(),
      });
    }
    const formulaQuote = calculateDeclaredCapacityQuote({
      declaredCapacity: parsed.data.declaredCapacity,
      interval: parsed.data.interval,
    });
    const pricesIncludeVat = isDeclaredCapacityVatEnabled();
    if (formulaQuote.kind === "contact_sales") {
      return { ...formulaQuote, pricesIncludeVat };
    }
    try {
      const quote = quoteDeclaredCapacityWithStripePrices(
        parsed.data,
        await this.mappedPrices.resolve(),
        {
          paidModules: parsed.data.payNowModules,
          trialModules: parsed.data.trialModules,
        },
      );
      return { ...quote, pricesIncludeVat };
    } catch (error) {
      if (error instanceof DeclaredCapacityStripePriceError) {
        throw new ServiceUnavailableException({
          code: "INSTITUTIONAL_PRICE_UNAVAILABLE",
          priceCode: error.priceCode,
          retryable: true,
        });
      }
      if (
        error instanceof Error &&
        error.message === "INVALID_DECLARED_CAPACITY_ADDON_SELECTION"
      ) {
        throw new BadRequestException({
          code: "INVALID_DECLARED_CAPACITY_ADDON_SELECTION",
        });
      }
      throw error;
    }
  }
}
