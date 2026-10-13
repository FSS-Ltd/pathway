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
  calculateMappedInstitutionalQuote,
  calculateInstitutionalQuote,
  INSTITUTIONAL_MAPPED_PLAN_CODES,
  INSTITUTIONAL_MAPPED_PRICING_VERSION,
  INSTITUTIONAL_PLANS,
  INSTITUTIONAL_PRICING_VERSION,
  InstitutionalMappedPriceError,
  mappedInstitutionalPlanDetails,
} from "@pathway/pricing";
import { z } from "zod";
import { InstitutionalPriceResolver } from "./institutional-price-resolver";

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
}
