import {
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  AuditAction,
  AuditEntityType,
  InstitutionalSnapshotKind,
  InstitutionalSnapshotStatus,
  SubscriptionStatus,
} from "@pathway/db";
import {
  calculateDeclaredCapacityQuote,
  declaredCapacityIntervalFromPlanCode,
  isDeclaredCapacityPlanCode,
  DECLARED_CAPACITY_PRICING_VERSION,
} from "@pathway/pricing";
import Stripe from "stripe";
import { EnrolmentRollService } from "../../enrolments/enrolment-roll.service";
import {
  BILLING_PROVIDER_CONFIG,
  type BillingProviderConfig,
} from "../billing-provider.config";
import {
  assertDeclaredCapacityBillingEnabled,
  assertDeclaredCapacityTaxRegistration,
  assertDeclaredCapacityVatEnabled,
} from "./declared-capacity-gate";
import { quoteDeclaredCapacityWithFrozenPrices } from "./declared-capacity-stripe-pricing";
import { institutionalStripeKey } from "./institutional-provider-guard";
import { stripeItemsForSnapshot } from "./institutional-stripe-line-items";
import {
  censusCutoffFor,
  localDateAt,
  QUOTE_VALIDITY_MS,
} from "./institutional-time";
import {
  assertProviderItemsMatch,
  customerId,
  subscriptionItemsForTarget,
} from "./institutional-capacity-stripe";
import { withInstitutionalOrgLock } from "./institutional-quote.service";

@Injectable()
export class InstitutionalCapacityQuoteService {
  constructor(
    @Inject(BILLING_PROVIDER_CONFIG)
    private readonly config: BillingProviderConfig,
    @Inject(EnrolmentRollService) private readonly roll: EnrolmentRollService,
  ) {}

  private stripe(): Stripe {
    return new Stripe(institutionalStripeKey(this.config, "PROVIDER_WRITES"), {
      apiVersion: "2023-10-16",
    });
  }

  async createQuote(
    orgId: string,
    actorUserId: string,
    declaredCapacity: number,
    now = new Date(),
  ) {
    assertDeclaredCapacityBillingEnabled();
    const estimate = calculateDeclaredCapacityQuote({
      declaredCapacity,
      interval: "month",
    });
    if (estimate.kind === "contact_sales") return estimate;

    const context = await withInstitutionalOrgLock(orgId, async (tx) => {
      const [org, policy] = await Promise.all([
        tx.org.findUnique({
          where: { id: orgId },
          select: { isMasterOrg: true },
        }),
        tx.institutionalBillingPolicy.findUnique({ where: { orgId } }),
      ]);
      if (org?.isMasterOrg) {
        throw new ConflictException({ code: "MASTER_ORG_EXEMPT" });
      }
      const subscription = await tx.subscription.findFirst({
        where: {
          orgId,
          status: {
            in: [
              SubscriptionStatus.ACTIVE,
              SubscriptionStatus.PAST_DUE,
              SubscriptionStatus.TRIALING,
            ],
          },
        },
        orderBy: { createdAt: "desc" },
        include: { currentInstitutionalSnapshot: true },
      });
      const current = subscription?.currentInstitutionalSnapshot;
      if (
        !policy ||
        policy.pricingVersion !== DECLARED_CAPACITY_PRICING_VERSION ||
        policy.declaredCapacity === null ||
        !subscription ||
        !current ||
        current.pricingVersion !== DECLARED_CAPACITY_PRICING_VERSION ||
        current.declaredCapacity !== policy.declaredCapacity ||
        !isDeclaredCapacityPlanCode(current.planCode)
      ) {
        throw new ConflictException({ code: "CAPACITY_CHANGE_UNAVAILABLE" });
      }
      if (subscription.pendingInstitutionalSnapshotId) {
        throw new ConflictException({ code: "CAPACITY_CHANGE_PENDING" });
      }
      if (policy.scheduledCapacityDecrease !== null) {
        throw new ConflictException({
          code: "CAPACITY_CHANGE_ALREADY_SCHEDULED",
        });
      }
      if (declaredCapacity === policy.declaredCapacity) {
        throw new ConflictException({ code: "CAPACITY_UNCHANGED" });
      }
      const interval = declaredCapacityIntervalFromPlanCode(current.planCode);
      const quote = calculateDeclaredCapacityQuote({
        declaredCapacity,
        interval,
      });
      if (quote.kind !== "priced") return { kind: "contact_sales" as const };
      const frozenQuote = quoteDeclaredCapacityWithFrozenPrices(
        { declaredCapacity, interval },
        current.lines,
        current.paidModules,
      );
      if (frozenQuote.kind !== "priced") {
        return { kind: "contact_sales" as const };
      }

      let periodEnd: Date | null = subscription.periodEnd;
      if (declaredCapacity < policy.declaredCapacity) {
        if (now > censusCutoffFor(subscription.periodEnd)) {
          throw new ConflictException({
            code: "CAPACITY_CHANGE_CUTOFF_PASSED",
          });
        }
        const confirmation = await tx.enrolmentRollConfirmation.findFirst({
          where: { orgId },
          orderBy: [{ revisionCutoff: "desc" }, { id: "desc" }],
          select: { revisionCutoff: true },
        });
        if (!confirmation) {
          throw new ConflictException({ code: "ROLL_REVIEW_REQUIRED" });
        }
        const active = await this.roll.roll(
          orgId,
          localDateAt(now, policy.timezone),
          confirmation.revisionCutoff,
        );
        const siteCount = await tx.tenant.count({ where: { orgId } });
        if (
          declaredCapacity < active.enrolledCount ||
          siteCount > quote.siteAllowance
        ) {
          throw new ConflictException({
            code:
              declaredCapacity < active.enrolledCount
                ? "CAPACITY_BELOW_ACTIVE_ENROLMENT"
                : "CAPACITY_BELOW_SITE_ALLOWANCE",
          });
        }
      } else {
        periodEnd = null;
      }

      return {
        kind: "priced" as const,
        subscriptionId: subscription.id,
        providerSubscriptionId: subscription.providerSubId,
        currentSnapshotId: current.id,
        currentSnapshot: current,
        policyCapacity: policy.declaredCapacity,
        interval,
        periodEnd,
        quote: frozenQuote,
      };
    });
    if (context.kind === "contact_sales") return estimate;

    let amountDueNowPence = 0;
    let prorationDate: Date | null = null;
    let prorationLines: Array<{
      priceId: string;
      quantity: number | null;
      amountPence: number;
    }> = [];
    if (declaredCapacity > context.policyCapacity) {
      assertDeclaredCapacityVatEnabled();
      const stripe = this.stripe();
      await assertDeclaredCapacityTaxRegistration(
        async () =>
          (
            await stripe.tax.registrations.list({
              status: "active",
              limit: 100,
            })
          ).data,
        this.config.activeProvider === "STRIPE",
      );
      const providerSubscription = await stripe.subscriptions.retrieve(
        context.providerSubscriptionId,
      );
      if (providerSubscription.automatic_tax?.enabled !== true) {
        throw new ServiceUnavailableException({
          code: "DECLARED_CAPACITY_VAT_UNAVAILABLE",
        });
      }
      const currentItems = stripeItemsForSnapshot(
        context.currentSnapshot,
        this.config.stripe.priceMap ?? {},
      );
      assertProviderItemsMatch(providerSubscription, currentItems);
      const targetItems = stripeItemsForSnapshot(
        {
          planCode: context.quote.planCode,
          pricingVersion: DECLARED_CAPACITY_PRICING_VERSION,
          enrolledChildren: null,
          declaredCapacity,
          subtotalPence: context.quote.subtotalPence,
          includedModules: [],
          paidModules: context.quote.paidModules,
          lines: context.quote.lines,
        },
        {},
      );
      const updateItems = subscriptionItemsForTarget(
        providerSubscription,
        currentItems,
        targetItems,
      );
      prorationDate = new Date(Math.floor(now.getTime() / 1000) * 1000);
      const preview = await stripe.invoices.retrieveUpcoming({
        customer: customerId(providerSubscription),
        subscription: providerSubscription.id,
        subscription_items: updateItems,
        subscription_proration_behavior: "always_invoice",
        subscription_proration_date: Math.floor(prorationDate.getTime() / 1000),
      });
      if (preview.lines.has_more || preview.currency !== "gbp") {
        throw new ServiceUnavailableException({
          code: "CAPACITY_PRORATION_REVIEW_REQUIRED",
        });
      }
      const allowedPrices = new Set([
        ...currentItems.map((item) => item.price),
        ...targetItems.map((item) => item.price),
      ]);
      const providerLines = preview.lines.data.filter((line) => line.proration);
      if (
        providerLines.length === 0 ||
        providerLines.some(
          (line) => !line.price?.id || !allowedPrices.has(line.price.id),
        )
      ) {
        throw new ServiceUnavailableException({
          code: "CAPACITY_PRORATION_REVIEW_REQUIRED",
        });
      }
      prorationLines = providerLines.map((line) => {
        const priceId = line.price?.id;
        if (!priceId) {
          throw new ServiceUnavailableException({
            code: "CAPACITY_PRORATION_REVIEW_REQUIRED",
          });
        }
        return {
          priceId,
          quantity: line.quantity,
          amountPence: line.amount,
        };
      });
      amountDueNowPence = preview.amount_due;
      if (!Number.isSafeInteger(amountDueNowPence) || amountDueNowPence <= 0) {
        throw new ServiceUnavailableException({
          code: "CAPACITY_PRORATION_REVIEW_REQUIRED",
        });
      }
    }

    return withInstitutionalOrgLock(orgId, async (tx) => {
      const latest = await tx.subscription.findFirst({
        where: { id: context.subscriptionId, orgId },
        include: { currentInstitutionalSnapshot: true },
      });
      const policy = await tx.institutionalBillingPolicy.findUnique({
        where: { orgId },
      });
      if (
        !latest ||
        !policy ||
        latest.currentInstitutionalSnapshotId !== context.currentSnapshotId ||
        latest.pendingInstitutionalSnapshotId ||
        policy.scheduledCapacityDecrease !== null ||
        policy.declaredCapacity !== context.policyCapacity
      ) {
        throw new ConflictException({ code: "CAPACITY_QUOTE_CHANGED" });
      }
      const previous = await tx.institutionalBillingSnapshot.findFirst({
        where: {
          orgId,
          kind: InstitutionalSnapshotKind.QUOTE,
          supersededBy: { none: {} },
        },
        select: { id: true },
      });
      const snapshot = await tx.institutionalBillingSnapshot.create({
        data: {
          orgId,
          policyId: policy.id,
          subscriptionId: latest.id,
          sourceSnapshotId: context.currentSnapshotId,
          kind: InstitutionalSnapshotKind.QUOTE,
          status: InstitutionalSnapshotStatus.PRICED,
          planCode: context.quote.planCode,
          pricingVersion: DECLARED_CAPACITY_PRICING_VERSION,
          declaredCapacity,
          paidModules: [...context.quote.paidModules],
          lines: context.quote.lines,
          subtotalPence: context.quote.subtotalPence,
          amountDueNowPence,
          prorationDate,
          prorationLines:
            prorationLines.length > 0 ? prorationLines : undefined,
          expiresAt: new Date(now.getTime() + QUOTE_VALIDITY_MS),
          supersedesId: previous?.id,
        },
      });
      await tx.auditEvent.create({
        data: {
          orgId,
          actorUserId,
          entityType: AuditEntityType.BILLING_QUOTE,
          entityId: snapshot.id,
          action: AuditAction.CREATED,
          metadata: {
            pricingVersion: DECLARED_CAPACITY_PRICING_VERSION,
            fromCapacity: context.policyCapacity,
            toCapacity: declaredCapacity,
            amountDueNowPence,
            effectiveAt:
              context.periodEnd?.toISOString() ?? "immediate-after-payment",
          },
        },
      });
      return snapshot;
    });
  }
}
