import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { EnrolmentsModule } from "../../enrolments/enrolments.module";
import { InstitutionalBillingController } from "./institutional-billing.controller";
import { InstitutionalCatalogueController } from "./institutional-catalogue.controller";
import { InstitutionalCensusService } from "./institutional-census.service";
import { InstitutionalCheckoutService } from "./institutional-checkout.service";
import { InstitutionalBillingInternalController } from "./institutional-internal.controller";
import { InstitutionalOperationService } from "./institutional-operation.service";
import {
  BILLING_PROVIDER_CONFIG,
  loadBillingProviderConfig,
} from "../billing-provider.config";
import { InstitutionalQuoteService } from "./institutional-quote.service";

@Module({
  imports: [AuthModule, EnrolmentsModule],
  controllers: [
    InstitutionalBillingController,
    InstitutionalCatalogueController,
    InstitutionalBillingInternalController,
  ],
  providers: [
    InstitutionalQuoteService,
    InstitutionalCensusService,
    InstitutionalCheckoutService,
    InstitutionalOperationService,
    { provide: BILLING_PROVIDER_CONFIG, useFactory: loadBillingProviderConfig },
  ],
  exports: [InstitutionalQuoteService, InstitutionalCensusService],
})
export class InstitutionalBillingModule {}
