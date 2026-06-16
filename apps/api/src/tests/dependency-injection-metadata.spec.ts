import "reflect-metadata";
import { SELF_DECLARED_DEPS_METADATA } from "@nestjs/common/constants";
import { ModuleRef } from "@nestjs/core";
import { PathwayRequestContext } from "@pathway/auth";
import { AssignmentsService } from "../assignments/assignments.service";
import { AttendanceService } from "../attendance/attendance.service";
import { Av30ActivityService } from "../av30/av30-activity.service";
import { Auth0ManagementService } from "../auth/auth0-management.service";
import { BuyNowProvider } from "../billing/buy-now.provider";
import { BuyNowService } from "../billing/buy-now.service";
import { BILLING_WEBHOOK_PROVIDER } from "../billing/billing-webhook.provider";
import { EntitlementsService } from "../billing/entitlements.service";
import { BlogService } from "../blog/blog.service";
import { BILLING_PROVIDER_CONFIG } from "../billing/billing-provider.config";
import { PlanPreviewService } from "../billing/plan-preview.service";
import { GoCardlessBillingWebhookProvider } from "../billing/providers/gocardless-billing-webhook.provider";
import { GoCardlessBuyNowProvider } from "../billing/providers/gocardless-buy-now.provider";
import { StripeBillingWebhookProvider } from "../billing/providers/stripe-billing-webhook.provider";
import { StripeBuyNowProvider } from "../billing/providers/stripe-buy-now.provider";
import { BillingWebhookController } from "../billing/webhook.controller";
import { SupabaseStorageService } from "../common/storage/supabase-storage.service";
import { LoggingService } from "../common/logging/logging.service";
import { LessonsService } from "../lessons/lessons.service";
import { OrgsService } from "../orgs/orgs.service";
import { StaffService } from "../staff/staff.service";
import { BillingService } from "../billing/billing.service";
import { MailerService } from "../mailer/mailer.service";

type DeclaredDependency = {
  index: number;
  param: unknown;
};

function getDeclaredDependencies(target: unknown): DeclaredDependency[] {
  return (
    Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, target as object) ?? []
  );
}

describe("dependency injection metadata", () => {
  it.each([
    {
      target: OrgsService,
      dependencies: [
        { index: 0, param: BillingService },
        { index: 1, param: LoggingService },
      ],
    },
    {
      target: LessonsService,
      dependencies: [{ index: 0, param: SupabaseStorageService }],
    },
    {
      target: BlogService,
      dependencies: [{ index: 0, param: SupabaseStorageService }],
    },
    {
      target: StaffService,
      dependencies: [{ index: 0, param: SupabaseStorageService }],
    },
    {
      target: AssignmentsService,
      dependencies: [
        { index: 0, param: Av30ActivityService },
        { index: 1, param: MailerService },
      ],
    },
    {
      target: AttendanceService,
      dependencies: [
        { index: 0, param: Av30ActivityService },
        { index: 1, param: PathwayRequestContext },
      ],
    },
    {
      target: EntitlementsService,
      dependencies: [{ index: 0, param: PathwayRequestContext }],
    },
    {
      target: BuyNowService,
      dependencies: [
        { index: 0, param: PlanPreviewService },
        { index: 1, param: BuyNowProvider },
        { index: 2, param: Auth0ManagementService },
        { index: 3, param: PathwayRequestContext },
        { index: 4, param: BILLING_PROVIDER_CONFIG },
      ],
    },
    {
      target: BillingWebhookController,
      dependencies: [
        { index: 0, param: BILLING_WEBHOOK_PROVIDER },
        { index: 1, param: EntitlementsService },
        { index: 2, param: ModuleRef },
        { index: 3, param: BILLING_PROVIDER_CONFIG },
        { index: 4, param: LoggingService },
      ],
    },
    {
      target: StripeBuyNowProvider,
      dependencies: [{ index: 0, param: BILLING_PROVIDER_CONFIG }],
    },
    {
      target: GoCardlessBuyNowProvider,
      dependencies: [{ index: 0, param: BILLING_PROVIDER_CONFIG }],
    },
    {
      target: StripeBillingWebhookProvider,
      dependencies: [{ index: 0, param: BILLING_PROVIDER_CONFIG }],
    },
    {
      target: GoCardlessBillingWebhookProvider,
      dependencies: [{ index: 0, param: BILLING_PROVIDER_CONFIG }],
    },
  ])(
    "declares explicit constructor dependencies for $target.name",
    ({ target, dependencies }) => {
      expect(getDeclaredDependencies(target)).toEqual(
        expect.arrayContaining(
          dependencies.map((dependency) => expect.objectContaining(dependency)),
        ),
      );
    },
  );
});
