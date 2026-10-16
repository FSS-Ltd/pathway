import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { MailerModule } from "../../mailer/mailer.module";
import { OutboxModule } from "../../common/outbox/outbox.module";
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
import { InstitutionalAddonTrialsController } from "./institutional-addon-trials.controller";
import { DeclaredCapacityAddonTrialsService } from "./declared-capacity-addon-trials.service";
import { DeclaredCapacityAddonCheckoutService } from "./declared-capacity-addon-checkout.service";
import { DeclaredCapacityAddonTrialWebhookService } from "./declared-capacity-addon-trial-webhook.service";
import { DeclaredCapacityAddonTrialExpiryService } from "./declared-capacity-addon-trial-expiry.service";

@Module({
  imports: [AuthModule, EnrolmentsModule, MailerModule, OutboxModule],
  controllers: [
    InstitutionalBillingController,
    InstitutionalCatalogueController,
    InstitutionalBillingInternalController,
    InstitutionalPublicCheckoutController,
    InstitutionalAddonTrialsController,
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
    DeclaredCapacityAddonTrialsService,
    DeclaredCapacityAddonCheckoutService,
    DeclaredCapacityAddonTrialWebhookService,
    DeclaredCapacityAddonTrialExpiryService,
    { provide: BILLING_PROVIDER_CONFIG, useFactory: loadBillingProviderConfig },
  ],
  exports: [
    InstitutionalQuoteService,
    InstitutionalCensusService,
    DeclaredCapacityAddonTrialWebhookService,
  ],
})
export class InstitutionalBillingModule {}
