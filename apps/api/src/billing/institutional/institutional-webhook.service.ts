import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  applyTenantContext,
  prisma,
  PendingOrderStatus,
  SubscriptionStatus,
  InstitutionalBillingOperationKind,
  InstitutionalBillingOperationStatus,
  InstitutionalSnapshotKind,
  Module,
} from "@pathway/db";
import {
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
import { quoteWasAcceptedForCheckout } from "./institutional-quote-freshness";
import { parsePublicInstitutionalOrder } from "./institutional-public-order";
import {
  reconcileSubscriptionModuleGrants,
  updateSubscriptionGrantPeriod,
} from "../module-grants";

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
      !subscription?.nextInstitutionalSnapshotId
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
      pendingOrder && pendingOrder.status !== PendingOrderStatus.COMPLETED
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
    const matches =
      snapshot &&
      accepted &&
      checkoutAccepted &&
      effectivePeriod &&
      event.periodStart &&
      event.periodEnd &&
      invoiceMatchesSnapshot(
        event,
        snapshot,
        priceMap,
        !!pendingOrder && pendingOrder.status !== PendingOrderStatus.COMPLETED,
      );
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
        current?.periodStart?.getTime() === event.periodStart!.getTime() &&
        current.currentInstitutionalSnapshotId === snapshot.id &&
        current.status === SubscriptionStatus.ACTIVE
      ) {
        return;
      }
      if (
        !isInstitutionalPlanCode(snapshot.planCode) &&
        !isMappedInstitutionalPlanCode(snapshot.planCode)
      ) {
        throw new Error("Institutional snapshot plan is invalid.");
      }
      const plan =
        INSTITUTIONAL_PLANS[
          isInstitutionalPlanCode(snapshot.planCode)
            ? snapshot.planCode
            : mappedInstitutionalSelectionPlanCode(snapshot.planCode)
        ];
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
          maxSites: plan.includedSites,
          av30Included: previousEntitlement?.av30Included ?? 0,
          leaderSeatsIncluded: previousEntitlement?.leaderSeatsIncluded ?? 0,
          storageGbIncluded: previousEntitlement?.storageGbIncluded ?? 0,
          flagsJson: {
            ...priorFlags,
            planCode: plan.code,
            billingMetric: plan.billingMetric,
            institutionalSnapshotId: snapshot.id,
          },
          source: "institutional_invoice",
        },
      });
      if (
        pendingOrder?.institutionalSnapshotId === snapshot.id &&
        pendingOrder.status !== PendingOrderStatus.COMPLETED
      ) {
        await reconcileSubscriptionModuleGrants(
          tx,
          event.orgId,
          event.subscriptionId,
          {
            included: [
              ...new Set([Module.LEARNING, ...snapshot.includedModules]),
            ],
            paid: snapshot.paidModules,
          },
          event.periodEnd!,
        );
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
