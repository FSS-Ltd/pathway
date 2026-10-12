import { Module } from "@nestjs/common";
import { PathwayAuthModule } from "@pathway/auth";
import { CommonModule } from "../common/common.module";
import { AuthModule } from "../auth/auth.module";
import { BillingService } from "./billing.service";
import { BillingController } from "./billing.controller";
import { EntitlementsService } from "./entitlements.service";
import { EntitlementsEnforcementService } from "./entitlements-enforcement.service";
import { PlanPreviewController } from "./plan-preview.controller";
import { PlanPreviewService } from "./plan-preview.service";
import { BuyNowProvider } from "./buy-now.provider";
import { BuyNowService } from "./buy-now.service";
import { BuyNowController } from "./buy-now.controller";
import { BillingPricingController } from "./pricing.controller";
import { BillingPricingService } from "./pricing.service";
import {
  BillingWebhookController,
} from "./webhook.controller";
import {
  BILLING_PROVIDER_CONFIG,
  loadBillingProviderConfig,
  type BillingProviderConfig,
} from "./billing-provider.config";
import {
  createBillingWebhookProvider,
  createBuyNowProvider,
} from "./providers/provider.factory";
import { BILLING_WEBHOOK_PROVIDER } from "./billing-webhook.provider";

@Module({
  imports: [PathwayAuthModule, CommonModule, AuthModule],
  controllers: [
    BillingController,
    BillingWebhookController,
    PlanPreviewController,
    BuyNowController,
    BillingPricingController,
  ],
  providers: [
    BillingService,
    EntitlementsService,
    EntitlementsEnforcementService,
    PlanPreviewService,
    BuyNowService,
    BillingPricingService,
    {
      provide: BILLING_PROVIDER_CONFIG,
      useFactory: () => loadBillingProviderConfig(),
    },
    {
      provide: BuyNowProvider,
      useFactory: (config: BillingProviderConfig) =>
        createBuyNowProvider(config),
      inject: [BILLING_PROVIDER_CONFIG],
    },
    {
      provide: BILLING_WEBHOOK_PROVIDER,
      useFactory: (config: BillingProviderConfig) =>
        createBillingWebhookProvider(config),
      inject: [BILLING_PROVIDER_CONFIG],
    },
  ],
  exports: [
    BillingService,
    EntitlementsService,
    EntitlementsEnforcementService,
    BILLING_WEBHOOK_PROVIDER,
    PlanPreviewService,
    BuyNowService,
    BillingPricingService,
  ],
})
export class BillingModule {}
