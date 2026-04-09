import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Logger,
  Post,
  Req,
} from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import {
  prisma,
  SubscriptionStatus,
  Prisma,
  PendingOrderStatus,
  Role,
  OrgRole,
} from "@pathway/db";
import { EntitlementsService } from "./entitlements.service";
import {
  BILLING_WEBHOOK_PROVIDER,
  BillingWebhookProvider,
  ParsedBillingWebhookEvent,
} from "./billing-webhook.provider";
import { getPlanDefinition } from "./billing-plans";
import { BILLING_PROVIDER_CONFIG, type BillingProviderConfig } from "./billing-provider.config";
import { LoggingService, StructuredLogger } from "../common/logging/logging.service";
import { Auth0ManagementService } from "../auth/auth0-management.service";
import Stripe from "stripe";

type WebhookResult =
  | { status: "ok"; eventId: string }
  | { status: "ignored_duplicate"; eventId: string }
  | { status: "ignored_unknown"; eventId: string };

type PendingOrderRecord = Prisma.PendingOrderGetPayload<
  Record<string, never>
>;

// Core billing webhook controller. For Stripe, this endpoint is the SNAPSHOT
// webhook: it handles checkout.session.completed, customer.subscription.* and
// invoice.* events verified with STRIPE_WEBHOOK_SECRET_SNAPSHOT and feeds the
// PendingOrder -> Subscription -> OrgEntitlementSnapshot pipeline.
@Controller("billing")
export class BillingWebhookController {
  private readonly logger: StructuredLogger;
  private auth0Management: Auth0ManagementService | null = null;

  constructor(
    @Inject(BILLING_WEBHOOK_PROVIDER)
    private readonly provider: BillingWebhookProvider,
    private readonly entitlements: EntitlementsService,
    @Inject(ModuleRef) private readonly moduleRef: ModuleRef,
    @Inject(BILLING_PROVIDER_CONFIG) private readonly billingConfig: BillingProviderConfig,
    logging?: LoggingService,
  ) {
    this.logger = logging
      ? logging.createLogger(BillingWebhookController.name)
      : this.createFallbackLogger();
    
    this.logger.info("BillingWebhookController initialized", {
      hasModuleRef: !!this.moduleRef,
      moduleRefType: typeof this.moduleRef,
    });
  }

  /**
   * Lazy-load Auth0ManagementService to avoid module initialization order issues.
   */
  private getAuth0Service(): Auth0ManagementService | null {
    if (!this.auth0Management) {
      try {
        this.auth0Management = this.moduleRef.get(Auth0ManagementService, { strict: false });
        this.logger.info("Auth0ManagementService lazy-loaded", {
          isReady: this.auth0Management?.isReady(),
        });
      } catch (error) {
        this.logger.warn("Auth0ManagementService not available", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return this.auth0Management;
  }

  private createFallbackLogger(): StructuredLogger {
    const nest = new Logger(BillingWebhookController.name);
    return {
      info: (message: string, meta?: unknown) => nest.log(message, meta),
      warn: (message: string, meta?: unknown) => nest.warn(message, meta),
      error: (message: string, meta?: unknown, trace?: unknown) =>
        nest.error(message, trace || meta),
    };
  }

  @Post("webhook")
  @HttpCode(200)
  async handleWebhook(
    @Body() body: unknown,
    @Headers("x-billing-signature") signature?: string,
    @Headers("stripe-signature") stripeSignature?: string,
    @Req() req?: { rawBody?: Buffer },
  ): Promise<WebhookResult> {
    const sig = signature ?? stripeSignature;
    const rawBody = req?.rawBody;
    let event = await this.provider.verifyAndParse(body, sig, rawBody);

    const alreadyHandled = await prisma.billingEvent.findFirst({
      where: {
        provider: event.provider,
        payloadJson: { path: ["eventId"], equals: event.eventId },
      },
      select: { id: true },
    });
    if (alreadyHandled) {
      this.logger.info("Duplicate webhook ignored", {
        provider: event.provider,
        eventId: event.eventId,
        orgId: event.orgId,
      });
      return { status: "ignored_duplicate", eventId: event.eventId };
    }

    // If orgId is "pending", resolve the actual orgId from the pending order
    if (event.orgId === "pending" && event.providerCheckoutId) {
      const pendingOrder = await prisma.pendingOrder.findFirst({
        where: {
          provider: event.provider,
          providerCheckoutId: event.providerCheckoutId,
        },
      });

      if (pendingOrder?.pendingOrgDetails && !pendingOrder.orgId) {
        // Create org/tenant/user NOW before processing the event
        const created = await this.createOrgFromPendingDetails(pendingOrder.pendingOrgDetails);
        
        // Update the pending order with the real orgId
        await prisma.pendingOrder.update({
          where: { id: pendingOrder.id },
          data: {
            orgId: created.orgId,
            tenantId: created.tenantId,
          },
        });

        // Update the event orgId for subsequent processing
        event = { ...event, orgId: created.orgId };
        
        this.logger.info("Resolved pending orgId", {
          pendingOrderId: pendingOrder.id,
          orgId: created.orgId,
        });
      } else if (pendingOrder?.orgId) {
        // Org was already created, use the existing orgId
        event = { ...event, orgId: pendingOrder.orgId };
      }
    }

    const applied = await this.applyEvent(event);

    // Only create billing event if we have a valid orgId
    if (event.orgId && event.orgId !== "pending") {
      await prisma.billingEvent.create({
        data: {
          orgId: event.orgId,
          provider: event.provider,
          type: event.kind,
          payloadJson: {
            eventId: event.eventId,
            subscriptionId: event.subscriptionId,
            orgId: event.orgId,
          },
        },
      });
    }

    if (applied) {
      // Warm the resolver; no enforcement here.
      if (this.entitlements && event.orgId && event.orgId !== "pending") {
        try {
          await this.entitlements.resolve(event.orgId);
        } catch (error) {
          this.logger.warn("Failed to resolve entitlements", {
            orgId: event.orgId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return { status: "ok", eventId: event.eventId };
    }

    this.logger.info("Unknown billing event ignored", {
      provider: event.provider,
      eventId: event.eventId,
      orgId: event.orgId,
      kind: event.kind,
    });
    return { status: "ignored_unknown", eventId: event.eventId };
  }

  private async applyEvent(
    event: ParsedBillingWebhookEvent,
  ): Promise<boolean> {
    switch (event.kind) {
      case "subscription.updated":
      case "subscription.created":
      case "invoice.paid":
        await this.handleSubscriptionEvent(
          event,
          event.status ?? SubscriptionStatus.ACTIVE,
        );
        return true;
      case "invoice.payment_failed":
        // Mark subscription as at-risk (past due) without applying pending orders.
        await this.upsertSubscription(
          event,
          event.status ?? SubscriptionStatus.PAST_DUE,
        );
        return true;
      case "subscription.canceled":
        await this.handleSubscriptionEvent(event, SubscriptionStatus.CANCELED);
        return true;
      case "unknown":
      default:
        return false;
    }
  }

  private async handleSubscriptionEvent(
    event: ParsedBillingWebhookEvent,
    status: SubscriptionStatus,
  ) {
    // Skip if orgId is not resolved
    if (!event.orgId || event.orgId === "pending" || event.orgId === "") {
      this.logger.warn("Skipping subscription event without valid orgId", {
        eventId: event.eventId,
        kind: event.kind,
      });
      return;
    }

    const pendingOrder = await this.findPendingOrder(event);
    if (pendingOrder) {
      await this.upsertSubscription(event, status);
      if (pendingOrder.status !== PendingOrderStatus.COMPLETED) {
        await this.applyPendingOrder(event, status, pendingOrder);
      }
      return;
    }

    await this.upsertSubscription(event, status);
    await this.maybeSnapshotEntitlements(event);
  }

  private async upsertSubscription(
    event: ParsedBillingWebhookEvent,
    status: SubscriptionStatus,
    tx: Prisma.TransactionClient | typeof prisma = prisma,
  ) {
    const now = new Date();
    await tx.subscription.upsert({
      where: { providerSubId: event.subscriptionId },
      update: {
        planCode: event.planCode ?? undefined,
        status,
        periodStart: event.periodStart ?? now,
        periodEnd: event.periodEnd ?? now,
        cancelAtPeriodEnd: event.cancelAtPeriodEnd ?? false,
      },
      create: {
        orgId: event.orgId,
        provider: event.provider,
        providerSubId: event.subscriptionId,
        planCode: event.planCode ?? "unknown",
        status,
        periodStart: event.periodStart ?? now,
        periodEnd: event.periodEnd ?? now,
        cancelAtPeriodEnd: event.cancelAtPeriodEnd ?? false,
      },
    });
  }

  private async applyPendingOrder(
    event: ParsedBillingWebhookEvent,
    status: SubscriptionStatus,
    pendingOrder: PendingOrderRecord,
  ) {
    const now = new Date();
    
    // Use orgId from the event (which has been resolved in handleWebhook)
    const actualOrgId = event.orgId;
    const actualTenantId = pendingOrder.tenantId;
    
    if (!actualOrgId || actualOrgId === "pending") {
      this.logger.error("Cannot apply pending order: orgId not resolved", {
        pendingOrderId: pendingOrder.id,
        eventOrgId: event.orgId,
      });
      throw new Error("Cannot apply pending order without resolved orgId");
    }
    
    await prisma.$transaction(async (tx) => {
      await this.upsertSubscription(event, status, tx);
      await tx.orgEntitlementSnapshot.create({
        data: {
          orgId: actualOrgId,
          maxSites: pendingOrder.maxSites ?? 0,
          av30Included: pendingOrder.av30Cap ?? 0,
          leaderSeatsIncluded: pendingOrder.leaderSeatsIncluded ?? 0,
          storageGbIncluded: pendingOrder.storageGbCap ?? 0,
          flagsJson: this.buildFlagsFromPending(pendingOrder),
          source: "pending_order",
        },
      });
      
      // Store Stripe customer ID on org
      if (event.providerCustomerId && actualOrgId) {
        await tx.org.update({
          where: { id: actualOrgId },
          data: { stripeCustomerId: event.providerCustomerId },
        });
      }
      
      await tx.pendingOrder.update({
        where: { id: pendingOrder.id },
        data: {
          status: PendingOrderStatus.COMPLETED,
          completedAt: now,
          orgId: actualOrgId,
          tenantId: actualTenantId,
          providerSubscriptionId: event.subscriptionId ?? undefined,
          providerCheckoutId:
            pendingOrder.providerCheckoutId ??
            event.providerCheckoutId ??
            undefined,
          providerCustomerId: event.providerCustomerId ?? undefined,
        },
      });
    });

    // When a new subscription is activated for an org (plan change), cancel any other active subscription so the org has only one
    if (status === SubscriptionStatus.ACTIVE && event.subscriptionId) {
      await this.cancelOtherActiveSubscriptionsForOrg(actualOrgId, event.subscriptionId);
    }
  }

  /**
   * Cancel any other active subscriptions for this org (plan-change flow).
   * Issues a prorated refund for unused time on the old plan, then cancels in Stripe and marks CANCELED in our DB.
   */
  private async cancelOtherActiveSubscriptionsForOrg(
    orgId: string,
    currentProviderSubId: string,
  ): Promise<void> {
    const others = await prisma.subscription.findMany({
      where: {
        orgId,
        providerSubId: { not: currentProviderSubId },
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] },
      },
      select: { id: true, providerSubId: true, planCode: true },
    });
    if (others.length === 0) return;

    const secretKey = this.billingConfig.stripe.secretKey;
    const stripe = secretKey
      ? new Stripe(secretKey, { apiVersion: "2023-10-16" })
      : null;

    for (const sub of others) {
      if (stripe && sub.providerSubId) {
        try {
          await this.refundProratedAndCancelSubscription(stripe, orgId, sub.providerSubId, sub.planCode);
        } catch (err) {
          this.logger.warn("Failed to refund/cancel Stripe subscription; marking CANCELED in DB", {
            providerSubId: sub.providerSubId,
            error: err instanceof Error ? err.message : String(err),
          });
          await stripe.subscriptions.cancel(sub.providerSubId).catch(() => {});
        }
      }
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: SubscriptionStatus.CANCELED },
      });
    }
  }

  /**
   * Refund the unused portion of the current billing period, then cancel the subscription.
   * Used when a customer upgrades mid-cycle so they get credit for the remaining Starter (or previous plan) time.
   */
  private async refundProratedAndCancelSubscription(
    stripe: Stripe,
    orgId: string,
    providerSubId: string,
    planCode: string | null,
  ): Promise<void> {
    const sub = await stripe.subscriptions.retrieve(providerSubId, {
      expand: ["latest_invoice"],
    });

    const periodStart = sub.current_period_start;
    const periodEnd = sub.current_period_end;
    const now = Math.floor(Date.now() / 1000);
    const periodSeconds = Math.max(1, periodEnd - periodStart);
    const remainingSeconds = Math.max(0, periodEnd - now);

    const latestInvoice = sub.latest_invoice;
    const invoice =
      typeof latestInvoice === "object" && latestInvoice !== null
        ? (latestInvoice as Stripe.Invoice)
        : null;

    const chargeId =
      invoice?.charge && typeof invoice.charge === "string"
        ? invoice.charge
        : (invoice?.charge as Stripe.Charge)?.id ?? null;
    const amountPaidCents = invoice?.amount_paid ?? 0;

    if (chargeId && amountPaidCents > 0 && remainingSeconds > 0) {
      const proratedRefundCents = Math.round(
        (amountPaidCents * remainingSeconds) / periodSeconds,
      );
      if (proratedRefundCents > 0) {
        try {
          await stripe.refunds.create({
            charge: chargeId,
            amount: proratedRefundCents,
            reason: "requested_by_customer",
            metadata: {
              reason: "upgrade_prorated_refund",
              orgId,
              subscriptionId: providerSubId,
              planCode: planCode ?? "",
            },
          });
          this.logger.info("Issued prorated refund for upgrade (plan change)", {
            orgId,
            providerSubId,
            planCode,
            refundCents: proratedRefundCents,
            remainingDays: Math.round(remainingSeconds / 86400),
          });
        } catch (refundErr) {
          this.logger.warn("Prorated refund failed; still canceling subscription", {
            providerSubId,
            error: refundErr instanceof Error ? refundErr.message : String(refundErr),
          });
        }
      }
    }

    await stripe.subscriptions.cancel(providerSubId);
    this.logger.info("Canceled previous Stripe subscription (plan change)", {
      orgId,
      providerSubId,
      planCode,
    });
  }

  private buildFlagsFromPending(
    pendingOrder: PendingOrderRecord,
  ): Prisma.InputJsonValue | undefined {
    const flags: Record<string, unknown> = {};
    const planDefinition = getPlanDefinition(pendingOrder.planCode);
    if (planDefinition?.maxChildrenIncluded !== null) {
      flags.maxChildrenIncluded = planDefinition?.maxChildrenIncluded;
    }
    if (pendingOrder.smsMessagesCap !== null && pendingOrder.smsMessagesCap !== undefined) {
      flags.smsMessagesCap = pendingOrder.smsMessagesCap;
    }
    if (pendingOrder.flags) {
      flags.pendingOrderFlags = pendingOrder.flags;
    }
    if (pendingOrder.warnings) {
      flags.pendingOrderWarnings = pendingOrder.warnings;
    }
    return Object.keys(flags).length ? (flags as Prisma.InputJsonValue) : undefined;
  }

  private async createOrgFromPendingDetails(
    pendingDetails: Prisma.JsonValue,
  ): Promise<{ orgId: string; tenantId: string; userId: string }> {
    const details = pendingDetails as Record<string, string>;
    const orgName = details.orgName;
    const slug = details.slug;
    const contactName = details.contactName;
    const contactEmail = details.contactEmail;
    const password = details.password;
    const planCode = details.planCode;

    if (!orgName || !slug || !contactEmail) {
      throw new Error("Missing required org details");
    }

    this.logger.info("Creating org/tenant/user from pending details", {
      orgName,
      contactEmail,
    });

    // Wrap all DB operations in a transaction
    return await prisma.$transaction(async (tx) => {
      // Create org
      const org = await tx.org.create({
        data: {
          name: orgName,
          slug,
          planCode,
          isSuite: false,
        },
      });

      // Create tenant
      const tenant = await tx.tenant.create({
        data: {
          name: orgName,
          slug,
          orgId: org.id,
        },
      });

      // Find or create user in DB
      let user = await tx.user.findUnique({
        where: { email: contactEmail },
      });

      if (!user) {
        user = await tx.user.create({
          data: {
            email: contactEmail,
            name: contactName,
            displayName: contactName,
            tenantId: tenant.id, // ✅ Set primary tenant
            hasServeAccess: true, // Enable staff access by default
          },
        });
        this.logger.info("Created new user", { userId: user.id, email: contactEmail });
      } else {
        // Update existing user with tenantId if not set
        if (!user.tenantId) {
          user = await tx.user.update({
            where: { id: user.id },
            data: { tenantId: tenant.id },
          });
        }
        this.logger.info("User already exists", { userId: user.id, email: contactEmail });
      }

      // Check if user already has Auth0 identity
      const existingIdentity = await tx.userIdentity.findFirst({
        where: {
          userId: user.id,
          provider: "auth0",
        },
      });

      if (!existingIdentity && password) {
        // Create user in Auth0 (outside transaction)
        const auth0Service = this.getAuth0Service();
        const isReady = auth0Service?.isReady();
        
        this.logger.info("Checking Auth0 service readiness", {
          hasService: !!auth0Service,
          isReady,
          hasPassword: !!password,
          hasExistingIdentity: !!existingIdentity,
        });
        
        if (isReady && auth0Service) {
          this.logger.info("Attempting to create Auth0 user", {
            userId: user.id,
            email: contactEmail,
          });
          
          try {
            const auth0UserId = await auth0Service.createUser({
              email: contactEmail,
              password,
              name: contactName,
              emailVerified: true, // Auto-verify for development/testing
            });

            if (auth0UserId) {
              await tx.userIdentity.create({
                data: {
                  userId: user.id,
                  provider: "auth0",
                  providerSubject: auth0UserId,
                  email: contactEmail,
                  displayName: contactName,
                },
              });
              this.logger.info("✅ Created Auth0 user and linked identity", {
                userId: user.id,
                auth0UserId,
              });
            } else {
              this.logger.warn("Auth0 createUser returned null", {
                userId: user.id,
                email: contactEmail,
              });
            }
          } catch (error) {
            this.logger.error("Failed to create Auth0 user", {
              userId: user.id,
              email: contactEmail,
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
            });
            // Don't fail the whole transaction if Auth0 creation fails
          }
        } else {
          this.logger.warn("Auth0ManagementService not ready (credentials missing or invalid)", {
            userId: user.id,
            email: contactEmail,
          });
        }
      } else if (existingIdentity) {
        this.logger.info("User already has Auth0 identity", {
          userId: user.id,
          identityId: existingIdentity.id,
        });
      } else if (!password) {
        this.logger.warn("No password provided, skipping Auth0 user creation", {
          userId: user.id,
          email: contactEmail,
        });
      }

      // Link user to tenant and org
      this.logger.info("Creating user memberships and roles", {
        userId: user.id,
        orgId: org.id,
        tenantId: tenant.id,
      });

      await tx.userTenantRole.upsert({
        where: {
          userId_tenantId_role: {
            userId: user.id,
            tenantId: tenant.id,
            role: Role.ADMIN,
          },
        },
        create: {
          userId: user.id,
          tenantId: tenant.id,
          role: Role.ADMIN,
        },
        update: {},
      });
      this.logger.info("✅ Created UserTenantRole");

      // Create UserOrgRole (legacy/suite admin)
      await tx.userOrgRole.upsert({
        where: {
          userId_orgId_role: {
            userId: user.id,
            orgId: org.id,
            role: OrgRole.ORG_ADMIN,
          },
        },
        create: {
          userId: user.id,
          orgId: org.id,
          role: OrgRole.ORG_ADMIN,
        },
        update: {},
      });
      this.logger.info("✅ Created UserOrgRole");

      // Create OrgMembership (preferred membership record)
      await tx.orgMembership.upsert({
        where: {
          orgId_userId: {
            orgId: org.id,
            userId: user.id,
          },
        },
        create: {
          orgId: org.id,
          userId: user.id,
          role: OrgRole.ORG_ADMIN,
        },
        update: {},
      });
      this.logger.info("✅ Created OrgMembership");

      await tx.siteMembership.upsert({
        where: {
          tenantId_userId: {
            tenantId: tenant.id,
            userId: user.id,
          },
        },
        create: {
          userId: user.id,
          tenantId: tenant.id,
          role: "SITE_ADMIN",
        },
        update: {},
      });
      this.logger.info("✅ Created SiteMembership");

      this.logger.info("Successfully created org/tenant/user and linked memberships", {
        orgId: org.id,
        tenantId: tenant.id,
        userId: user.id,
      });

      return {
        orgId: org.id,
        tenantId: tenant.id,
        userId: user.id,
      };
    });
  }

  private async findPendingOrder(
    event: ParsedBillingWebhookEvent,
  ): Promise<PendingOrderRecord | null> {
    if (event.pendingOrderId) {
      const direct = await prisma.pendingOrder.findUnique({
        where: { id: event.pendingOrderId },
      });
      if (direct) return direct;
    }

    if (event.providerCheckoutId) {
      const byCheckout = await prisma.pendingOrder.findFirst({
        where: {
          provider: event.provider,
          providerCheckoutId: event.providerCheckoutId,
        },
      });
      if (byCheckout) return byCheckout;
    }

    const bySubscription = await prisma.pendingOrder.findFirst({
      where: {
        provider: event.provider,
        providerSubscriptionId: event.subscriptionId,
      },
    });
    return bySubscription;
  }

  private async maybeSnapshotEntitlements(event: ParsedBillingWebhookEvent) {
    const ent = event.entitlements;
    if (
      !ent ||
      ent.av30Included === undefined ||
      ent.leaderSeatsIncluded === undefined ||
      ent.storageGbIncluded === undefined ||
      ent.maxSites === undefined
    ) {
      return;
    }

    await prisma.orgEntitlementSnapshot.create({
      data: {
        orgId: event.orgId,
        maxSites: ent.maxSites ?? 0,
        av30Included: ent.av30Included ?? 0,
        leaderSeatsIncluded: ent.leaderSeatsIncluded ?? 0,
        storageGbIncluded: ent.storageGbIncluded ?? 0,
        flagsJson:
          (ent.flagsJson as Prisma.InputJsonValue | null | undefined) ??
          undefined,
        source: "webhook",
      },
    });
  }
}
