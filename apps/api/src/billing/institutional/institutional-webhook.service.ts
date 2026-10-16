import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  applyTenantContext,
  prisma,
  PendingOrderStatus,
  InstitutionalAddonTrialStatus,
  SubscriptionStatus,
  InstitutionalBillingOperationKind,
  InstitutionalBillingOperationStatus,
  InstitutionalSnapshotKind,
  Module,
} from "@pathway/db";
import {
  calculateDeclaredCapacityQuote,
  declaredCapacityIntervalFromPlanCode,
  declaredCapacityPlanCode,
  isDeclaredCapacityPlanCode,
  DECLARED_CAPACITY_PRICING_VERSION,
  INSTITUTIONAL_PLANS,
  isMappedInstitutionalPlanCode,
  mappedInstitutionalSelectionPlanCode,
} from "@pathway/pricing";
import {
  BILLING_WEBHOOK_PROVIDER,
  type BillingWebhookProvider,
  type ParsedBillingWebhookEvent,
} from "../billing-webhook.provider";
import {
  BILLING_PROVIDER_CONFIG,
  type BillingProviderConfig,
} from "../billing-provider.config";
import { censusCutoffFor } from "./institutional-time";
import { isInstitutionalPlanCode } from "./institutional-selection";
import { invoiceMatchesSnapshot } from "./institutional-invoice-match";
import { capacityUpgradeInvoiceMatches } from "./institutional-capacity-invoice";
import { quoteWasAcceptedForCheckout } from "./institutional-quote-freshness";
import { parsePublicInstitutionalOrder } from "./institutional-public-order";
import {
  reconcileSubscriptionModuleGrants,
  updateSubscriptionGrantPeriod,
} from "../module-grants";

function entitlementPlanForSnapshot(snapshot: {
  planCode: string;
  pricingVersion: string;
  declaredCapacity: number | null;
}): { planCode: string; maxSites: number; billingMetric: string } {
  if (snapshot.pricingVersion === DECLARED_CAPACITY_PRICING_VERSION) {
    if (
      snapshot.declaredCapacity === null ||
      !isDeclaredCapacityPlanCode(snapshot.planCode)
    ) {
      throw new Error("Institutional declared-capacity snapshot is invalid.");
    }
    const interval = declaredCapacityIntervalFromPlanCode(snapshot.planCode);
    const quote = calculateDeclaredCapacityQuote({
      declaredCapacity: snapshot.declaredCapacity,
      interval,
    });
    if (
      quote.kind !== "priced" ||
      declaredCapacityPlanCode(quote.tier, interval) !== snapshot.planCode
    ) {
      throw new Error("Institutional declared-capacity snapshot is invalid.");
    }
    return {
      planCode: snapshot.planCode,
      maxSites: quote.siteAllowance,
      billingMetric: "DECLARED_CAPACITY",
    };
  }
  if (isInstitutionalPlanCode(snapshot.planCode)) {
    const plan = INSTITUTIONAL_PLANS[snapshot.planCode];
    return {
      planCode: plan.code,
      maxSites: plan.includedSites,
      billingMetric: plan.billingMetric,
    };
  }
  if (isMappedInstitutionalPlanCode(snapshot.planCode)) {
    const plan =
      INSTITUTIONAL_PLANS[
        mappedInstitutionalSelectionPlanCode(snapshot.planCode)
      ];
    return {
      planCode: snapshot.planCode,
      maxSites: plan.includedSites,
      billingMetric: plan.billingMetric,
    };
  }
  throw new Error("Institutional snapshot plan is invalid.");
}

@Injectable()
export class InstitutionalWebhookService {
  private readonly logger = new Logger(InstitutionalWebhookService.name);

  constructor(
    @Inject(BILLING_WEBHOOK_PROVIDER)
    private readonly provider: BillingWebhookProvider,
    @Inject(BILLING_PROVIDER_CONFIG)
    private readonly billingConfig: BillingProviderConfig,
  ) {}

  async handle(event: ParsedBillingWebhookEvent): Promise<boolean> {
    if (
      ![
        "subscription.created",
        "subscription.updated",
        "invoice.draft",
        "invoice.paid",
        "invoice.payment_failed",
      ].includes(event.kind)
    ) {
      return false;
    }
    const pendingOrder = await this.findPendingOrder(event);
    const subscription = event.subscriptionId
      ? await prisma.subscription.findUnique({
          where: { providerSubId: event.subscriptionId },
        })
      : null;
    const resolvedOrgId =
      event.orgId && event.orgId !== "pending"
        ? event.orgId
        : (pendingOrder?.orgId ?? subscription?.orgId);
    if (
      !pendingOrder?.institutionalSnapshotId &&
      !subscription?.currentInstitutionalSnapshotId &&
      !subscription?.nextInstitutionalSnapshotId &&
      !subscription?.pendingInstitutionalSnapshotId
    ) {
      return false;
    }
    if (!resolvedOrgId) {
      throw new Error(
        "Institutional event organisation could not be resolved.",
      );
    }
    event = { ...event, orgId: resolvedOrgId };
    if (pendingOrder?.orgId && pendingOrder.orgId !== event.orgId) {
      throw new Error(
        "Institutional event organisation does not match the order.",
      );
    }
    if (subscription?.orgId && subscription.orgId !== event.orgId) {
      throw new Error(
        "Institutional event organisation does not match the subscription.",
      );
    }
    if (
      event.kind === "subscription.created" ||
      event.kind === "subscription.updated"
    ) {
      // Stripe can update a subscription before the first paid invoice.
      return true;
    }
    if (event.kind === "invoice.payment_failed") {
      if (subscription?.pendingInstitutionalSnapshotId) return true;
      if (
        subscription &&
        event.periodStart &&
        subscription.periodStart <= event.periodStart
      ) {
        await prisma.subscription.updateMany({
          where: { id: subscription.id, orgId: event.orgId },
          data: { status: SubscriptionStatus.PAST_DUE },
        });
      }
      return true;
    }
    if (
      event.kind === "invoice.paid" &&
      subscription?.periodStart &&
      event.periodStart &&
      subscription.periodStart > event.periodStart
    ) {
      return true;
    }

    const snapshotId =
      subscription?.pendingInstitutionalSnapshotId &&
      (event.kind === "invoice.draft" || event.kind === "invoice.paid")
        ? subscription.pendingInstitutionalSnapshotId
        : pendingOrder && pendingOrder.status !== PendingOrderStatus.COMPLETED
          ? pendingOrder.institutionalSnapshotId
          : event.periodStart &&
              subscription?.nextInstitutionalSnapshotId &&
              subscription.periodEnd <= event.periodStart
            ? subscription.nextInstitutionalSnapshotId
            : subscription?.currentInstitutionalSnapshotId;
    const snapshot = snapshotId
      ? await prisma.institutionalBillingSnapshot.findFirst({
          where: { id: snapshotId, orgId: event.orgId },
          include: { acceptance: true },
        })
      : null;
    const accepted =
      snapshot?.kind === InstitutionalSnapshotKind.CENSUS ||
      (snapshot?.kind === InstitutionalSnapshotKind.QUOTE &&
        !!snapshot.acceptance);
    const checkoutAccepted =
      snapshot &&
      pendingOrder &&
      pendingOrder.status !== PendingOrderStatus.COMPLETED
        ? quoteWasAcceptedForCheckout(snapshot, pendingOrder)
        : true;
    const effectivePeriod =
      snapshot?.kind !== InstitutionalSnapshotKind.CENSUS ||
      (snapshot.effectiveAt !== null &&
        event.periodStart !== null &&
        event.periodStart !== undefined &&
        snapshot.effectiveAt.getTime() === event.periodStart.getTime());
    const priceMap = { ...this.billingConfig.stripe.priceMap };
    const isPendingCapacityChange =
      !!snapshot &&
      subscription?.pendingInstitutionalSnapshotId === snapshot.id;
    const matches =
      snapshot &&
      accepted &&
      checkoutAccepted &&
      effectivePeriod &&
      event.periodStart &&
      event.periodEnd &&
      (isPendingCapacityChange
        ? capacityUpgradeInvoiceMatches(event, snapshot)
        : invoiceMatchesSnapshot(
            event,
            snapshot,
            priceMap,
            !!pendingOrder &&
              pendingOrder.status !== PendingOrderStatus.COMPLETED,
          ));
    if (!matches) {
      await prisma.institutionalBillingPolicy.updateMany({
        where: { orgId: event.orgId },
        data: { reviewReason: "INVOICE_MISMATCH" },
      });
      if (snapshot) {
        await prisma.institutionalBillingOperation.updateMany({
          where: {
            orgId: event.orgId,
            snapshotId: snapshot.id,
            kind: InstitutionalBillingOperationKind.RENEWAL_RECONCILE,
          },
          data: { status: InstitutionalBillingOperationStatus.REVIEW_REQUIRED },
        });
      }
      if (event.kind === "invoice.draft") {
        if (!event.invoice?.id || !this.provider.holdDraftInvoice) {
          throw new Error("Institutional draft invoice could not be held.");
        }
        await this.provider.holdDraftInvoice(event.invoice.id);
      }
      this.logger.warn("Institutional invoice requires review", {
        orgId: event.orgId,
        subscriptionId: event.subscriptionId,
        invoiceId: event.invoice?.id,
      });
      return true;
    }
    if (event.kind === "invoice.draft") return true;

    await prisma.$transaction(async (tx) => {
      await applyTenantContext(tx, pendingOrder?.tenantId ?? "", event.orgId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ENROLMENT:${event.orgId}`}, 0))`;
      await tx.$queryRaw`SELECT id FROM "Org" WHERE id = ${event.orgId} FOR UPDATE`;
      const current = await tx.subscription.findUnique({
        where: { providerSubId: event.subscriptionId },
      });
      if (current && current.orgId !== event.orgId) {
        throw new Error(
          "Institutional event organisation changed during processing.",
        );
      }
      if (current?.periodStart && current.periodStart > event.periodStart!)
        return;
      if (
        snapshot.pricingVersion === DECLARED_CAPACITY_PRICING_VERSION &&
        snapshot.subscriptionId &&
        current?.pendingInstitutionalSnapshotId !== snapshot.id &&
        current?.currentInstitutionalSnapshotId !== snapshot.id &&
        current?.nextInstitutionalSnapshotId !== snapshot.id
      ) {
        throw new Error("Institutional capacity payment is no longer pending.");
      }
      if (
        current?.periodStart?.getTime() === event.periodStart!.getTime() &&
        current.currentInstitutionalSnapshotId === snapshot.id &&
        current.status === SubscriptionStatus.ACTIVE
      ) {
        return;
      }
      const entitlementPlan = entitlementPlanForSnapshot(snapshot);
      const paid = await tx.subscription.upsert({
        where: { providerSubId: event.subscriptionId },
        update: {
          planCode: snapshot.planCode,
          status: SubscriptionStatus.ACTIVE,
          periodStart: event.periodStart!,
          periodEnd: event.periodEnd!,
          currentInstitutionalSnapshotId: snapshot.id,
          nextInstitutionalSnapshotId:
            current?.nextInstitutionalSnapshotId === snapshot.id
              ? null
              : undefined,
          pendingInstitutionalSnapshotId:
            current?.pendingInstitutionalSnapshotId === snapshot.id
              ? null
              : undefined,
        },
        create: {
          orgId: event.orgId,
          provider: event.provider,
          providerSubId: event.subscriptionId,
          planCode: snapshot.planCode,
          status: SubscriptionStatus.ACTIVE,
          periodStart: event.periodStart!,
          periodEnd: event.periodEnd!,
          currentInstitutionalSnapshotId: snapshot.id,
        },
      });
      if (
        pendingOrder?.institutionalSnapshotId === snapshot.id &&
        pendingOrder.status !== PendingOrderStatus.COMPLETED
      ) {
        await tx.pendingOrder.updateMany({
          where: {
            id: pendingOrder.id,
            orgId: event.orgId,
            status: { not: PendingOrderStatus.COMPLETED },
          },
          data: {
            status: PendingOrderStatus.COMPLETED,
            completedAt: new Date(),
            providerSubscriptionId: event.subscriptionId,
            providerCustomerId: event.providerCustomerId ?? undefined,
            pendingOrgDetails: parsePublicInstitutionalOrder(pendingOrder.flags)
              ? {}
              : undefined,
          },
        });
      }
      if (event.providerCustomerId) {
        await tx.org.update({
          where: { id: event.orgId },
          data: { stripeCustomerId: event.providerCustomerId },
        });
      }
      const previousEntitlement = await tx.orgEntitlementSnapshot.findFirst({
        where: { orgId: event.orgId },
        orderBy: { createdAt: "desc" },
      });
      const priorFlags =
        previousEntitlement?.flagsJson &&
        typeof previousEntitlement.flagsJson === "object" &&
        !Array.isArray(previousEntitlement.flagsJson)
          ? previousEntitlement.flagsJson
          : {};
      await tx.orgEntitlementSnapshot.create({
        data: {
          orgId: event.orgId,
          maxSites: entitlementPlan.maxSites,
          av30Included: previousEntitlement?.av30Included ?? 0,
          leaderSeatsIncluded: previousEntitlement?.leaderSeatsIncluded ?? 0,
          storageGbIncluded: previousEntitlement?.storageGbIncluded ?? 0,
          flagsJson: {
            ...priorFlags,
            planCode: entitlementPlan.planCode,
            billingMetric: entitlementPlan.billingMetric,
            institutionalSnapshotId: snapshot.id,
          },
          source: "institutional_invoice",
        },
      });
      if (
        pendingOrder?.institutionalSnapshotId === snapshot.id &&
        pendingOrder.status !== PendingOrderStatus.COMPLETED
      ) {
        const includedModules =
          snapshot.pricingVersion === DECLARED_CAPACITY_PRICING_VERSION
            ? snapshot.includedModules
            : [Module.LEARNING, ...snapshot.includedModules];
        await reconcileSubscriptionModuleGrants(
          tx,
          event.orgId,
          event.subscriptionId,
          {
            included: [...new Set(includedModules)],
            paid: snapshot.paidModules,
          },
          event.periodEnd!,
        );
        const selectedTrialModules = snapshot.selectedTrialModules ?? [];
        if (selectedTrialModules.length > 0) {
          await tx.institutionalAddonTrial.createMany({
            data: selectedTrialModules.map((module) => ({
              orgId: event.orgId,
              module,
              status: InstitutionalAddonTrialStatus.SELECTED,
              selectedAt: event.occurredAt ?? new Date(),
            })),
            skipDuplicates: true,
          });
        }
      } else {
        await updateSubscriptionGrantPeriod(
          tx,
          event.orgId,
          event.subscriptionId,
          event.periodEnd!,
        );
      }
      await tx.institutionalBillingPolicy.updateMany({
        where: { orgId: event.orgId, reviewReason: "INVOICE_MISMATCH" },
        data: { reviewReason: null },
      });
      if (
        snapshot.pricingVersion === DECLARED_CAPACITY_PRICING_VERSION &&
        snapshot.declaredCapacity !== null
      ) {
        const policy = await tx.institutionalBillingPolicy.findUnique({
          where: { orgId: event.orgId },
          select: {
            scheduledCapacityDecrease: true,
            scheduledCapacityEffectiveAt: true,
          },
        });
        const scheduledDecreaseApplied =
          policy?.scheduledCapacityDecrease === snapshot.declaredCapacity;
        const carryScheduledDecrease =
          policy?.scheduledCapacityDecrease !== null &&
          policy?.scheduledCapacityDecrease !== undefined &&
          !scheduledDecreaseApplied;
        await tx.institutionalBillingPolicy.updateMany({
          where: { orgId: event.orgId },
          data: {
            declaredCapacity: snapshot.declaredCapacity,
            declaredAt: new Date(),
            scheduledCapacityDecrease: scheduledDecreaseApplied
              ? null
              : (policy?.scheduledCapacityDecrease ?? null),
            scheduledCapacityEffectiveAt: scheduledDecreaseApplied
              ? null
              : carryScheduledDecrease
                ? policy?.scheduledCapacityEffectiveAt &&
                  policy.scheduledCapacityEffectiveAt > event.periodEnd!
                  ? policy.scheduledCapacityEffectiveAt
                  : event.periodEnd!
                : null,
          },
        });
      }
      await tx.institutionalBillingOperation.upsert({
        where: {
          orgId_idempotencyKey: {
            orgId: event.orgId,
            idempotencyKey: `census-freeze:${paid.id}:${event.periodEnd!.toISOString()}`,
          },
        },
        update: {},
        create: {
          orgId: event.orgId,
          subscriptionId: paid.id,
          kind: InstitutionalBillingOperationKind.CENSUS_FREEZE,
          status: InstitutionalBillingOperationStatus.PENDING,
          idempotencyKey: `census-freeze:${paid.id}:${event.periodEnd!.toISOString()}`,
          dueAt: censusCutoffFor(event.periodEnd!),
        },
      });
    });
    return true;
  }

  private async findPendingOrder(event: ParsedBillingWebhookEvent) {
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
    return prisma.pendingOrder.findFirst({
      where: {
        provider: event.provider,
        providerSubscriptionId: event.subscriptionId,
      },
    });
  }
}
