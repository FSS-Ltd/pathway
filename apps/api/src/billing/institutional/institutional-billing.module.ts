import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { EnrolmentsModule } from "../../enrolments/enrolments.module";
import { InstitutionalBillingController } from "./institutional-billing.controller";
import { InstitutionalCatalogueController } from "./institutional-catalogue.controller";
import { InstitutionalCensusService } from "./institutional-census.service";
import { InstitutionalCheckoutService } from "./institutional-checkout.service";
import { InstitutionalCapacityService } from "./institutional-capacity.service";
import { InstitutionalCapacityQuoteService } from "./institutional-capacity-quote.service";
import { InstitutionalCapacityAcceptanceService } from "./institutional-capacity-acceptance.service";
import { InstitutionalBillingInternalController } from "./institutional-internal.controller";
import { InstitutionalOperationService } from "./institutional-operation.service";
import {
  BILLING_PROVIDER_CONFIG,
  loadBillingProviderConfig,
} from "../billing-provider.config";
import { InstitutionalQuoteService } from "./institutional-quote.service";
import { BillingPricingService } from "../pricing.service";
import { InstitutionalPriceResolver } from "./institutional-price-resolver";
import { InstitutionalPublicCheckoutController } from "./institutional-public-checkout.controller";
import { InstitutionalPublicCheckoutService } from "./institutional-public-checkout.service";

@Module({
  imports: [AuthModule, EnrolmentsModule],
  controllers: [
    InstitutionalBillingController,
    InstitutionalCatalogueController,
    InstitutionalBillingInternalController,
    InstitutionalPublicCheckoutController,
  ],
  providers: [
    InstitutionalQuoteService,
    InstitutionalCensusService,
    InstitutionalCheckoutService,
    InstitutionalCapacityService,
    InstitutionalCapacityQuoteService,
    InstitutionalCapacityAcceptanceService,
    InstitutionalOperationService,
    BillingPricingService,
    InstitutionalPriceResolver,
    InstitutionalPublicCheckoutService,
    { provide: BILLING_PROVIDER_CONFIG, useFactory: loadBillingProviderConfig },
  ],
  exports: [InstitutionalQuoteService, InstitutionalCensusService],
})
export class InstitutionalBillingModule {}
