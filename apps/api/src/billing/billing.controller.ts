import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Get,
  Inject,
  Logger,
  NotFoundException,
  UseGuards,
  forwardRef,
} from "@nestjs/common";
import { z } from "zod";
import Stripe from "stripe";
import { prisma } from "@pathway/db";
import { BillingService } from "./billing.service";
import { checkoutDto } from "./dto/checkout.dto";
import { EntitlementsService } from "./entitlements.service";
import { EntitlementsEnforcementService } from "./entitlements-enforcement.service";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { CurrentOrg } from "@pathway/auth";
import { BILLING_PROVIDER_CONFIG, type BillingProviderConfig } from "./billing-provider.config";

const parseOrBadRequest = async <T>(
  schema: z.ZodTypeAny,
  data: unknown,
): Promise<T> => {
  try {
    return await schema.parseAsync(data);
  } catch (e) {
    if (e instanceof z.ZodError) {
      const flat = e.flatten();
      const fieldMessages = Object.entries(flat.fieldErrors).flatMap(
        ([key, msgs]) => (msgs ?? []).map((m) => `${key}: ${m}`),
      );
      const formMessages = flat.formErrors ?? [];
      const messages = [...formMessages, ...fieldMessages];
      throw new BadRequestException(
        messages.length ? messages : ["Invalid request body"],
      );
    }
    throw e;
  }
};

@Controller("billing")
export class BillingController {
  private readonly stripe: Stripe | null;
  private readonly logger = new Logger(BillingController.name);

  constructor(
    @Inject(BillingService) private readonly service: BillingService,
    @Inject(forwardRef(() => EntitlementsService)) private readonly entitlements: EntitlementsService,
    @Inject(forwardRef(() => EntitlementsEnforcementService)) private readonly enforcement: EntitlementsEnforcementService,
    @Inject(BILLING_PROVIDER_CONFIG) private readonly billingConfig: BillingProviderConfig,
  ) {
    // Same construction as StripeBuyNowProvider/BillingPricingService
    // (providers/stripe-buy-now.provider.ts, pricing.service.ts): pinned
    // apiVersion "2023-10-16", key sourced from BILLING_PROVIDER_CONFIG, and
    // left null (not thrown) when unset so FAKE-provider dev/test boots
    // still work - createPortalSession 404s instead.
    this.stripe = this.billingConfig.stripe.secretKey
      ? new Stripe(this.billingConfig.stripe.secretKey, { apiVersion: "2023-10-16" })
      : null;
  }

  @Post("checkout")
  async checkout(@Body() body: unknown) {
    const dto = await parseOrBadRequest<z.infer<typeof checkoutDto>>(
      checkoutDto,
      body,
    );
    return this.service.checkout(dto);
  }

  @Get("entitlements")
  @UseGuards(AuthUserGuard)
  async getEntitlements(@CurrentOrg("orgId") orgId: string) {
    const resolved = await this.entitlements.resolve(orgId);
    const av30Status = await this.enforcement.checkAv30ForOrg(orgId);

    return {
      orgId: resolved.orgId,
      isMasterOrg: resolved.isMasterOrg,
      subscriptionStatus: resolved.subscriptionStatus,
      subscription: resolved.subscription ? {
        planCode: resolved.subscription.planCode,
        status: resolved.subscription.status,
        periodStart: resolved.subscription.periodStart.toISOString(),
        periodEnd: resolved.subscription.periodEnd.toISOString(),
        cancelAtPeriodEnd: resolved.subscription.cancelAtPeriodEnd,
      } : null,
      av30Cap: resolved.av30Cap,
      maxChildren: resolved.maxChildren,
      currentAv30: resolved.currentAv30,
      av30Enforcement: {
        status: av30Status.status,
        graceUntil: av30Status.graceUntil?.toISOString() ?? null,
        messageCode: av30Status.messageCode,
      },
      storageGbCap: resolved.storageGbCap,
      storageGbUsage: resolved.storageGbUsage,
      smsMessagesCap: resolved.smsMessagesCap,
      smsMonthUsage: resolved.smsMonthUsage,
      leaderSeatsIncluded: resolved.leaderSeatsIncluded,
      maxSites: resolved.maxSites,
      usageCalculatedAt: resolved.usageCalculatedAt?.toISOString() ?? null,
    };
  }

  // Household-config endpoint (nexsteps-home membership screen's "Manage
  // billing" action) - plain AuthUserGuard, not CapabilityGuard, matching
  // every other household-config endpoint in this plan
  // (implementation-map.md:130-131). orgId is resolved server-side from the
  // bearer token via @CurrentOrg, never trusted from client input.
  @Post("portal")
  @UseGuards(AuthUserGuard)
  async createPortalSession(@CurrentOrg("orgId") orgId: string) {
    const org = await prisma.org.findUniqueOrThrow({
      where: { id: orgId },
      select: { stripeCustomerId: true },
    });
    if (!org.stripeCustomerId || !this.stripe) {
      throw new NotFoundException("This household has no billing account yet");
    }
    // return_url is optional on Stripe's Billing Portal API - omitted, the
    // portal falls back to its dashboard-configured default. A custom URL
    // scheme (nexstepshome://...) is not a verified http(s) URL, and
    // Stripe may reject a non-http(s) return_url, so only pass it when an
    // operator has actually set NEXSTEPS_HOME_BILLING_RETURN_URL, never a
    // guessed default.
    const returnUrl = process.env.NEXSTEPS_HOME_BILLING_RETURN_URL;
    let session: Stripe.BillingPortal.Session;
    try {
      session = await this.stripe.billingPortal.sessions.create({
        customer: org.stripeCustomerId,
        ...(returnUrl ? { return_url: returnUrl } : {}),
      });
    } catch (error) {
      this.logger.error(`Failed to create Stripe billing portal session for org ${orgId}`, error);
      throw error;
    }
    return { url: session.url };
  }
}
