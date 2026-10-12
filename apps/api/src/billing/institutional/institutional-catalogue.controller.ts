import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
} from "@nestjs/common";
import {
  calculateInstitutionalQuote,
  INSTITUTIONAL_PLANS,
  INSTITUTIONAL_PRICING_VERSION,
} from "@pathway/pricing";
import { z } from "zod";

const estimateSchema = z.object({
  planCode: z.enum([
    "INSTITUTIONAL_STARTER_MONTHLY",
    "INSTITUTIONAL_GROWTH_MONTHLY",
    "INSTITUTIONAL_PROFESSIONAL_MONTHLY",
  ]),
  enrolledChildren: z.number().int().nonnegative().safe(),
});

@Controller("billing/institutional/catalogue")
export class InstitutionalCatalogueController {
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
}
