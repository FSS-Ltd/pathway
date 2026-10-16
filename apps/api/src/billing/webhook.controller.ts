import { pendingOrganisationProfile } from "./pending-organisation-profile";
import { parsePublicInstitutionalOrder } from "./institutional/institutional-public-order";
import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Logger,
  Optional,
  Post,
  Req,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import {
  prisma,
  applyTenantContext,
  SubscriptionStatus,
  Prisma,
  PendingOrderStatus,
  Role,
  OrgRole,
  OrgSector,
  Module,
  ModuleChangeStatus,
} from "@pathway/db";
import {
  getConfiguratorPlanPolicy,
  type ConfiguratorModuleCode,
} from "@pathway/pricing";
import { EntitlementsService } from "./entitlements.service";
import {
  BILLING_WEBHOOK_PROVIDER,
  BillingWebhookProvider,
  ParsedBillingWebhookEvent,
} from "./billing-webhook.provider";
import { getPlanDefinition } from "./billing-plans";
import {
  BILLING_PROVIDER_CONFIG,
  type BillingProviderConfig,
} from "./billing-provider.config";
import {
  LoggingService,
  StructuredLogger,
} from "../common/logging/logging.service";
import { Auth0ManagementService } from "../auth/auth0-management.service";
import { ClerkManagementService } from "../auth/clerk-management.service";
import { getAuthProviderMode } from "../config/runtime-env";
import Stripe from "stripe";
import { addOnSubscriptionPlanCode } from "./subscription-plan-code";
import { InstitutionalWebhookService } from "./institutional/institutional-webhook.service";
import { InstitutionalPublicActivationService } from "./institutional/institutional-public-activation.service";
import {
  cancelPaidSourceGrants,
  reconcileSubscriptionModuleGrants,
  updateSubscriptionGrantPeriod,
} from "./module-grants";
import {
  claimBillingEvent,
  finishBillingEvent,
} from "./billing-event-processing";

type WebhookResult =
  | { status: "ok"; eventId: string }
  | { status: "ignored_duplicate"; eventId: string }
  | { status: "ignored_unknown"; eventId: string };

type PendingOrderRecord = Prisma.PendingOrderGetPayload<Record<string, never>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAddOnOnlyOrder(pendingOrder: PendingOrderRecord): boolean {
  return (
    isRecord(pendingOrder.flags) && pendingOrder.flags.purchaseKind === "add-on"
  );
}

function includedModulesFromPendingOrder(
  pendingOrder: PendingOrderRecord,
  selectedModules: readonly Module[],
): Module[] {
  if (isAddOnOnlyOrder(pendingOrder)) return [];

  const policy = getConfiguratorPlanPolicy(pendingOrder.planCode);
  if (!policy || policy.outcome !== "checkout") return [];

  const moduleSelection = isRecord(pendingOrder.flags)
    ? pendingOrder.flags.moduleSelection
    : undefined;
  if (
    isRecord(moduleSelection) &&
    Array.isArray(moduleSelection.includedModules)
  ) {
    const includedSelection = moduleSelection.includedModules;
    if (includedSelection.length > policy.includedModuleLimit) return [];
    const selected = new Set(selectedModules);
    const included = includedSelection.filter(
      (module): module is Module =>
        typeof module === "string" &&
        selected.has(module as Module) &&
        policy.eligibleOptionalModules.includes(
          module as ConfiguratorModuleCode,
        ),
    );
    return [...new Set(included)].slice(0, policy.includedModuleLimit);
  }

  // Legacy orders predate explicit included choices and module selections.
  return [...policy.legacyIncludedModules] as Module[];
}

function subscriptionPlanCode(
  event: ParsedBillingWebhookEvent,
  pendingOrder: PendingOrderRecord | null,
): string | undefined {
  if (!pendingOrder) return event.planCode ?? undefined;
  return isAddOnOnlyOrder(pendingOrder)
    ? addOnSubscriptionPlanCode(pendingOrder.planCode)
    : pendingOrder.planCode;
}

export function isOrgSector(value: string | undefined): value is OrgSector {
  return !!value && (Object.values(OrgSector) as string[]).includes(value);
}

// Core billing webhook controller. For Stripe, this endpoint is the SNAPSHOT
// webhook: it handles checkout.session.completed, customer.subscription.* and
// invoice.* events verified with STRIPE_WEBHOOK_SECRET_SNAPSHOT and feeds the
// PendingOrder -> Subscription -> OrgEntitlementSnapshot pipeline.
@Controller("billing")
export class BillingWebhookController {
  private readonly logger: StructuredLogger;
  private auth0Management: Auth0ManagementService | null = null;
  private clerkManagement: ClerkManagementService | null = null;

  constructor(
    @Inject(BILLING_WEBHOOK_PROVIDER)
    private readonly provider: BillingWebhookProvider,
    @Inject(EntitlementsService)
    private readonly entitlements: EntitlementsService,
    @Inject(ModuleRef) private readonly moduleRef: ModuleRef,
    @Inject(BILLING_PROVIDER_CONFIG)
    private readonly billingConfig: BillingProviderConfig,
    @Inject(InstitutionalWebhookService)
    private readonly institutionalWebhook: InstitutionalWebhookService,
    @Inject(InstitutionalPublicActivationService)
    private readonly publicInstitutionalActivation: InstitutionalPublicActivationService,
    @Optional()
    @Inject(LoggingService)
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
        this.auth0Management = this.moduleRef.get(Auth0ManagementService, {
          strict: false,
        });
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

  /**
   * Lazy-load ClerkManagementService to avoid module initialization order issues.
   */
  private getClerkService(): ClerkManagementService | null {
    if (!this.clerkManagement) {
      try {
        this.clerkManagement = this.moduleRef.get(ClerkManagementService, {
          strict: false,
        });
        this.logger.info("ClerkManagementService lazy-loaded", {
          isReady: this.clerkManagement?.isReady(),
        });
      } catch (error) {
        this.logger.warn("ClerkManagementService not available", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return this.clerkManagement;
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
    const event = await this.provider.verifyAndParse(body, sig, rawBody);

    const claim = await claimBillingEvent(event);
    if (claim.status === "duplicate") {
      this.logger.info("Duplicate webhook ignored", {
        provider: event.provider,
        eventId: event.eventId,
        orgId: event.orgId,
      });
      return { status: "ignored_duplicate", eventId: event.eventId };
    }

    try {
      return await this.processClaimedEvent(event, claim.id);
    } catch (error) {
      await finishBillingEvent(claim.id, event.orgId, false);
      throw error;
    }
  }

  private async processClaimedEvent(
    event: ParsedBillingWebhookEvent,
    claimId: string,
  ): Promise<WebhookResult> {
    const publicOrder = await this.findPendingOrder(event);
    if (
      this.publicInstitutionalActivation.isPublicInstitutionalOrder(
        publicOrder,
      ) &&
      publicOrder &&
      publicOrder.status === PendingOrderStatus.PENDING &&
      !publicOrder.institutionalSnapshotId
    ) {
      if (
        event.kind === "invoice.draft" &&
        !this.publicInstitutionalActivation.draftInvoiceMatches(
          event,
          publicOrder,
        )
      ) {
        if (!event.invoice?.id || !this.provider.holdDraftInvoice) {
          throw new Error("Institutional draft invoice could not be held.");
        }
        await this.provider.holdDraftInvoice(event.invoice.id);
      }
      if (event.kind !== "invoice.paid") {
        await finishBillingEvent(claimId, event.orgId, true);
        return { status: "ok", eventId: event.eventId };
      }
      this.publicInstitutionalActivation.assertPaidInvoice(event, publicOrder);
    }
    // If orgId is "pending", resolve the actual orgId from the pending order
    if (event.orgId === "pending" || !event.orgId) {
      const pendingOrder = await this.findPendingOrder(event);

      if (
        pendingOrder?.pendingOrgDetails &&
        !pendingOrder.orgId &&
        event.kind === "invoice.paid"
      ) {
        // Create org/tenant/user NOW before processing the event
        const created = await this.createOrgFromPendingDetails(pendingOrder);

        if (
          this.publicInstitutionalActivation.isPublicInstitutionalOrder(
            pendingOrder,
          )
        ) {
          await this.publicInstitutionalActivation.attachAcceptedQuote(
            pendingOrder.id,
            created.orgId,
            created.tenantId,
            event.periodStart ?? undefined,
          );
        }

        // Update the event orgId for subsequent processing
        event = { ...event, orgId: created.orgId };

        this.logger.info("Resolved pending orgId", {
          pendingOrderId: pendingOrder.id,
          orgId: created.orgId,
        });
      } else if (pendingOrder?.orgId) {
        // Org was already created, use the existing orgId
        event = { ...event, orgId: pendingOrder.orgId };
        if (
          event.kind === "invoice.paid" &&
          !pendingOrder.institutionalSnapshotId &&
          pendingOrder.tenantId &&
          this.publicInstitutionalActivation.isPublicInstitutionalOrder(
            pendingOrder,
          )
        ) {
          this.publicInstitutionalActivation.assertPaidInvoice(
            event,
            pendingOrder,
          );
          await this.publicInstitutionalActivation.attachAcceptedQuote(
            pendingOrder.id,
            pendingOrder.orgId,
            pendingOrder.tenantId,
            event.periodStart ?? undefined,
          );
        }
      }
      if ((!event.orgId || event.orgId === "pending") && event.subscriptionId) {
        const subscription = await prisma.subscription.findUnique({
          where: { providerSubId: event.subscriptionId },
          select: { orgId: true },
        });
        if (subscription) event = { ...event, orgId: subscription.orgId };
      }
    }

    if (
      event.kind === "invoice.paid" &&
      (!event.orgId || event.orgId === "pending")
    ) {
      throw new ServiceUnavailableException(
        "Billing organisation is not available for this payment event.",
      );
    }

    const applied = await this.applyEvent(event);

    await finishBillingEvent(claimId, event.orgId, true);

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

  private async applyEvent(event: ParsedBillingWebhookEvent): Promise<boolean> {
    if (await this.institutionalWebhook.handle(event)) return true;
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
        {
          if (!event.orgId || event.orgId === "pending") return true;
          const pendingOrder = await this.findPendingOrder(event);
          await this.upsertSubscription(
            event,
            event.status ?? SubscriptionStatus.PAST_DUE,
            prisma,
            subscriptionPlanCode(event, pendingOrder),
          );
        }
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
    const awaitingPayment =
      pendingOrder !== null &&
      pendingOrder.status !== PendingOrderStatus.COMPLETED &&
      event.kind !== "invoice.paid";
    const effectiveStatus = awaitingPayment
      ? SubscriptionStatus.INCOMPLETE
      : status;
    const shouldApplyPendingOrder =
      pendingOrder !== null &&
      pendingOrder.status !== PendingOrderStatus.COMPLETED &&
      event.kind === "invoice.paid" &&
      status === SubscriptionStatus.ACTIVE;
    if (!shouldApplyPendingOrder) {
      await this.upsertSubscription(
        event,
        effectiveStatus,
        prisma,
        subscriptionPlanCode(event, pendingOrder),
      );
    }
    if (status === SubscriptionStatus.CANCELED) {
      await this.cancelActiveModulesForSubscription(
        event.orgId,
        event.subscriptionId,
      );
    }

    if (event.kind === "invoice.paid" && status === SubscriptionStatus.ACTIVE) {
      await this.applyScheduledModuleChange(event);
    }

    if (pendingOrder) {
      if (effectiveStatus !== SubscriptionStatus.ACTIVE) return;

      if (pendingOrder.status !== PendingOrderStatus.COMPLETED) {
        await this.applyPendingOrder(event, status, pendingOrder);
      } else {
        await this.extendActiveModulesExpiry(
          event.orgId,
          event.subscriptionId,
          event.periodEnd,
        );
      }
      return;
    }

    if (status === SubscriptionStatus.ACTIVE) {
      await this.extendActiveModulesExpiry(
        event.orgId,
        event.subscriptionId,
        event.periodEnd,
      );
    }
    await this.maybeSnapshotEntitlements(event);
  }

  private async activateModulesFromPendingOrder(
    tx: Prisma.TransactionClient,
    orgId: string,
    pendingOrder: PendingOrderRecord,
    event: ParsedBillingWebhookEvent,
  ): Promise<void> {
    const selectedModules = [...new Set(pendingOrder.selectedModules ?? [])];
    const includedModules = includedModulesFromPendingOrder(
      pendingOrder,
      selectedModules,
    );
    const includedModuleSet = new Set(includedModules);
    const paidModules = selectedModules.filter(
      (module) => !includedModuleSet.has(module),
    );
    await reconcileSubscriptionModuleGrants(
      tx,
      orgId,
      event.subscriptionId,
      { included: includedModules, paid: paidModules },
      event.periodEnd ?? null,
    );
  }

  private async applyScheduledModuleChange(
    event: ParsedBillingWebhookEvent,
  ): Promise<void> {
    if (!event.periodStart || !event.orgId || !event.subscriptionId) return;
    await prisma.$transaction(async (tx) => {
      await applyTenantContext(tx, "", event.orgId);
      const change = await tx.moduleChange.findFirst({
        where: {
          orgId: event.orgId,
          providerSubId: event.subscriptionId,
          status: ModuleChangeStatus.SCHEDULED,
          effectiveAt: { lte: event.periodStart! },
        },
        orderBy: { effectiveAt: "desc" },
      });
      if (!change) return;
      const claim = await tx.moduleChange.updateMany({
        where: { id: change.id, status: ModuleChangeStatus.SCHEDULED },
        data: { status: ModuleChangeStatus.APPLIED },
      });
      if (claim.count !== 1) return;
      await reconcileSubscriptionModuleGrants(
        tx,
        event.orgId,
        event.subscriptionId,
        { included: change.includedModules, paid: change.paidModules },
        event.periodEnd ?? null,
      );
      const providerItems = change.providerItems;
      if (
        isRecord(providerItems) &&
        Array.isArray(providerItems.retiredSources)
      ) {
        for (const source of providerItems.retiredSources) {
          if (
            !isRecord(source) ||
            typeof source.sourceId !== "string" ||
            !Array.isArray(source.modules) ||
            !source.modules.every(
              (module) =>
                typeof module === "string" &&
                Object.values(Module).includes(module as Module),
            )
          ) {
            throw new Error(
              "Scheduled change has invalid retired grant sources",
            );
          }
          await cancelPaidSourceGrants(
            tx,
            event.orgId,
            source.sourceId,
            source.modules as Module[],
          );
        }
      }
      const current = await tx.subscription.findUnique({
        where: { providerSubId: event.subscriptionId },
        select: { planCode: true },
      });
      if (current) {
        const previous = await tx.orgEntitlementSnapshot.findFirst({
          where: { orgId: event.orgId },
          orderBy: { createdAt: "desc" },
        });
        const priorFlags = isRecord(previous?.flagsJson)
          ? previous.flagsJson
          : {};
        // Subscription updates can arrive before the paid invoice. The latest
        // entitlement snapshot, not the subscription row, records the paid tier.
        const paidPlanCode =
          typeof priorFlags.planCode === "string"
            ? priorFlags.planCode
            : current.planCode;
        if (paidPlanCode !== change.planCode) {
          const oldPlan = getPlanDefinition(paidPlanCode);
          const nextPlan = getPlanDefinition(change.planCode);
          if (!nextPlan)
            throw new Error("Scheduled plan is no longer recognised");
          const retainExtras = (
            currentValue: number | null | undefined,
            oldBase: number | null | undefined,
            nextBase: number | null | undefined,
          ): number =>
            (nextBase ?? currentValue ?? 0) +
            (oldBase === null ||
            oldBase === undefined ||
            currentValue === null ||
            currentValue === undefined
              ? 0
              : Math.max(0, currentValue - oldBase));
          await tx.orgEntitlementSnapshot.create({
            data: {
              orgId: event.orgId,
              av30Included: retainExtras(
                previous?.av30Included,
                oldPlan?.av30Included,
                nextPlan.av30Included,
              ),
              maxSites: retainExtras(
                previous?.maxSites,
                oldPlan?.maxSitesIncluded,
                nextPlan.maxSitesIncluded,
              ),
              storageGbIncluded: retainExtras(
                previous?.storageGbIncluded,
                oldPlan?.storageGbIncluded,
                nextPlan.storageGbIncluded,
              ),
              leaderSeatsIncluded: retainExtras(
                previous?.leaderSeatsIncluded,
                oldPlan?.leaderSeatsIncluded,
                nextPlan.leaderSeatsIncluded,
              ),
              flagsJson: {
                ...priorFlags,
                planCode: change.planCode,
                planTier: nextPlan.tier,
              },
              source: "module_change",
            },
          });
        }
        await tx.subscription.update({
          where: { providerSubId: event.subscriptionId },
          data: { planCode: change.planCode },
        });
      }
    });
  }

  private async extendActiveModulesExpiry(
    orgId: string,
    subscriptionId: string,
    periodEnd: Date | null | undefined,
  ): Promise<void> {
    if (!periodEnd) return;

    await prisma.$transaction(async (tx) => {
      await applyTenantContext(tx, "", orgId);
      await updateSubscriptionGrantPeriod(tx, orgId, subscriptionId, periodEnd);
    });
  }

  private async cancelActiveModulesForSubscription(
    orgId: string,
    subscriptionId: string,
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await applyTenantContext(tx, "", orgId);
      await updateSubscriptionGrantPeriod(tx, orgId, subscriptionId, null);
    });
  }

  private async upsertSubscription(
    event: ParsedBillingWebhookEvent,
    status: SubscriptionStatus,
    tx: Prisma.TransactionClient | typeof prisma = prisma,
    planCode: string | undefined = event.planCode ?? undefined,
  ) {
    const now = new Date();
    await tx.subscription.upsert({
      where: { providerSubId: event.subscriptionId },
      update: {
        planCode,
        status,
        periodStart: event.periodStart ?? now,
        periodEnd: event.periodEnd ?? now,
        cancelAtPeriodEnd: event.cancelAtPeriodEnd ?? false,
      },
      create: {
        orgId: event.orgId,
        provider: event.provider,
        providerSubId: event.subscriptionId,
        planCode: planCode ?? "unknown",
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
      await applyTenantContext(tx, actualTenantId ?? "", actualOrgId);
      await this.upsertSubscription(
        event,
        status,
        tx,
        subscriptionPlanCode(event, pendingOrder),
      );
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

      if (status === SubscriptionStatus.ACTIVE) {
        await this.activateModulesFromPendingOrder(
          tx,
          actualOrgId,
          pendingOrder,
          event,
        );
      }

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

    // A new plan subscription replaces the previous plan; add-on subscriptions
    // remain separate and must not cancel the base plan.
    if (
      status === SubscriptionStatus.ACTIVE &&
      event.subscriptionId &&
      !isAddOnOnlyOrder(pendingOrder)
    ) {
      await this.cancelOtherActiveSubscriptionsForOrg(
        actualOrgId,
        event.subscriptionId,
      );
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
        status: {
          in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE],
        },
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
          await this.refundProratedAndCancelSubscription(
            stripe,
            orgId,
            sub.providerSubId,
            sub.planCode,
          );
        } catch (err) {
          this.logger.warn(
            "Failed to refund/cancel Stripe subscription; marking CANCELED in DB",
            {
              providerSubId: sub.providerSubId,
              error: err instanceof Error ? err.message : String(err),
            },
          );
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
        : ((invoice?.charge as Stripe.Charge)?.id ?? null);
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
          this.logger.warn(
            "Prorated refund failed; still canceling subscription",
            {
              providerSubId,
              error:
                refundErr instanceof Error
                  ? refundErr.message
                  : String(refundErr),
            },
          );
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
    if (
      pendingOrder.smsMessagesCap !== null &&
      pendingOrder.smsMessagesCap !== undefined
    ) {
      flags.smsMessagesCap = pendingOrder.smsMessagesCap;
    }
    if (pendingOrder.flags) {
      flags.pendingOrderFlags = pendingOrder.flags;
    }
    if (pendingOrder.warnings) {
      flags.pendingOrderWarnings = pendingOrder.warnings;
    }
    return Object.keys(flags).length
      ? (flags as Prisma.InputJsonValue)
      : undefined;
  }

  private async createOrgFromPendingDetails(
    pendingOrder: PendingOrderRecord,
  ): Promise<{ orgId: string; tenantId: string }> {
    const requireIdentity =
      this.publicInstitutionalActivation.isPublicInstitutionalOrder(
        pendingOrder,
      );
    const details = pendingOrder.pendingOrgDetails as Record<string, string>;
    const orgName = details.orgName;
    const slug = details.slug;
    const contactName = details.contactName;
    const contactEmail = details.contactEmail;
    const password = details.password;
    const planCode = details.planCode;
    const { sector, vertical } = pendingOrganisationProfile(
      details,
      parsePublicInstitutionalOrder(pendingOrder.flags)?.setting,
    );

    if (!orgName || !slug || !contactEmail) {
      throw new Error("Missing required org details");
    }

    this.logger.info("Creating org/tenant/user from pending details", {
      orgName,
      contactEmail,
    });

    // Wrap all DB operations in a transaction
    return await prisma.$transaction(async (tx) => {
      // Different provider events for one order can arrive together. Lock the
      // order and persist its org link in this same transaction.
      await tx.$queryRaw`SELECT id FROM "PendingOrder" WHERE id = ${pendingOrder.id} FOR UPDATE`;
      const currentOrder = await tx.pendingOrder.findUnique({
        where: { id: pendingOrder.id },
      });
      if (!currentOrder)
        throw new Error("Pending order disappeared during provisioning");
      if (currentOrder.orgId && currentOrder.tenantId) {
        return { orgId: currentOrder.orgId, tenantId: currentOrder.tenantId };
      }
      // Create org
      const org = await tx.org.create({
        data: {
          name: orgName,
          slug,
          planCode,
          isSuite: false,
          sector,
        },
      });

      if (vertical) {
        await tx.orgVertical.create({ data: { orgId: org.id, vertical } });
      }

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
      if (requireIdentity && user) {
        throw new Error("Institutional account email requires review");
      }

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
        this.logger.info("Created new user", {
          userId: user.id,
          email: contactEmail,
        });
      } else {
        // Update existing user with tenantId if not set
        if (!user.tenantId) {
          user = await tx.user.update({
            where: { id: user.id },
            data: { tenantId: tenant.id },
          });
        }
        this.logger.info("User already exists", {
          userId: user.id,
          email: contactEmail,
        });
      }

      // Check if user already has an identity, on either provider
      const existingIdentity = await tx.userIdentity.findFirst({
        where: {
          userId: user.id,
          provider: { in: ["auth0", "clerk"] },
        },
      });

      const authProviderMode = getAuthProviderMode();

      if (!existingIdentity && password) {
        if (authProviderMode === "auth0") {
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
                if (requireIdentity)
                  throw new Error("Identity provisioning unavailable");
              }
            } catch (error) {
              if (requireIdentity) throw error;
              this.logger.error("Failed to create Auth0 user", {
                userId: user.id,
                email: contactEmail,
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
              });
              // Don't fail the whole transaction if Auth0 creation fails
            }
          } else {
            if (requireIdentity)
              throw new Error("Identity provider unavailable");
            this.logger.warn(
              "Auth0ManagementService not ready (credentials missing or invalid)",
              {
                userId: user.id,
                email: contactEmail,
              },
            );
          }
        } else {
          // "dual" and "clerk": new org accounts land on Clerk.
          const clerkService = this.getClerkService();
          const isReady = clerkService?.isReady();

          this.logger.info("Checking Clerk service readiness", {
            hasService: !!clerkService,
            isReady,
            hasPassword: !!password,
            hasExistingIdentity: !!existingIdentity,
          });

          if (isReady && clerkService) {
            this.logger.info("Attempting to create Clerk user", {
              userId: user.id,
              email: contactEmail,
            });

            try {
              const clerkUserId = await clerkService.createUser({
                email: contactEmail,
                password,
                name: contactName,
                externalId: user.id,
              });

              if (clerkUserId) {
                await tx.userIdentity.create({
                  data: {
                    userId: user.id,
                    provider: "clerk",
                    providerSubject: clerkUserId,
                    email: contactEmail,
                    displayName: contactName,
                  },
                });
                this.logger.info("✅ Created Clerk user and linked identity", {
                  userId: user.id,
                  clerkUserId,
                });
              } else {
                this.logger.warn("Clerk createUser returned null", {
                  userId: user.id,
                  email: contactEmail,
                });
                if (requireIdentity)
                  throw new Error("Identity provisioning unavailable");
              }
            } catch (error) {
              if (requireIdentity) throw error;
              this.logger.error("Failed to create Clerk user", {
                userId: user.id,
                email: contactEmail,
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
              });
              // Don't fail the whole transaction if Clerk creation fails
            }
          } else {
            if (requireIdentity)
              throw new Error("Identity provider unavailable");
            this.logger.warn(
              "ClerkManagementService not ready (secret key missing)",
              {
                userId: user.id,
                email: contactEmail,
              },
            );
          }
        }
      } else if (existingIdentity) {
        this.logger.info("User already has an identity", {
          userId: user.id,
          identityId: existingIdentity.id,
          provider: existingIdentity.provider,
        });
      } else if (!password) {
        if (requireIdentity) throw new Error("Identity password unavailable");
        this.logger.warn(
          "No password provided, skipping identity provider user creation",
          {
            userId: user.id,
            email: contactEmail,
          },
        );
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

      this.logger.info(
        "Successfully created org/tenant/user and linked memberships",
        {
          orgId: org.id,
          tenantId: tenant.id,
          userId: user.id,
        },
      );

      await tx.pendingOrder.update({
        where: { id: pendingOrder.id },
        data: { orgId: org.id, tenantId: tenant.id },
      });
      return {
        orgId: org.id,
        tenantId: tenant.id,
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
