import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AuditAction,
  AuditEntityType,
  InstitutionalSnapshotKind,
  InstitutionalSnapshotStatus,
  Prisma,
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
import { assertDeclaredCapacityBillingEnabled } from "./declared-capacity-gate";
import { institutionalStripeKey } from "./institutional-provider-guard";
import { stripeItemsForSnapshot } from "./institutional-stripe-line-items";
import { censusCutoffFor, localDateAt } from "./institutional-time";
import {
  assertProviderItemsMatch,
  subscriptionItemsForTarget,
} from "./institutional-capacity-stripe";
import { withInstitutionalOrgLock } from "./institutional-quote.service";

type CapacityQuoteSnapshot = {
  id: string;
  orgId: string;
  subscriptionId: string | null;
  sourceSnapshotId: string | null;
  pricingVersion: string;
  planCode: string;
  enrolledChildren: number | null;
  declaredCapacity: number | null;
  subtotalPence: number | null;
  amountDueNowPence: number | null;
  prorationDate: Date | null;
  lines: unknown;
  paidModules: string[];
  includedModules: string[];
  expiresAt: Date | null;
  status: InstitutionalSnapshotStatus;
  policy: { declaredCapacity: number | null };
  acceptance?: { id: string; idempotencyKey: string } | null;
};

type CapacitySubscription = Prisma.SubscriptionGetPayload<{
  include: { currentInstitutionalSnapshot: true };
}>;

@Injectable()
export class InstitutionalCapacityAcceptanceService {
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

  async acceptQuote(
    orgId: string,
    actorUserId: string,
    snapshotId: string,
    idempotencyKey: string,
    now = new Date(),
  ) {
    assertDeclaredCapacityBillingEnabled();
    if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
      throw new ConflictException({ code: "INVALID_IDEMPOTENCY_KEY" });
    }
    const accepted = await withInstitutionalOrgLock(orgId, async (tx) => {
      const priorKey = await tx.institutionalQuoteAcceptance.findUnique({
        where: { orgId_idempotencyKey: { orgId, idempotencyKey } },
      });
      if (priorKey && priorKey.snapshotId !== snapshotId) {
        throw new ConflictException({ code: "IDEMPOTENCY_CONFLICT" });
      }
      const snapshot = await tx.institutionalBillingSnapshot.findFirst({
        where: {
          id: snapshotId,
          orgId,
          kind: InstitutionalSnapshotKind.QUOTE,
          pricingVersion: DECLARED_CAPACITY_PRICING_VERSION,
        },
        include: { acceptance: true, policy: true },
      });
      if (!snapshot || !snapshot.subscriptionId) {
        throw new NotFoundException("Capacity quote not found.");
      }
      if (snapshot.acceptance) {
        if (priorKey && snapshot.acceptance.id !== priorKey.id) {
          throw new ConflictException({ code: "QUOTE_ALREADY_ACCEPTED" });
        }
      } else {
        const current = await tx.subscription.findFirst({
          where: { id: snapshot.subscriptionId, orgId },
          include: { currentInstitutionalSnapshot: true },
        });
        if (
          !current ||
          current.currentInstitutionalSnapshotId !==
            snapshot.sourceSnapshotId ||
          !current.currentInstitutionalSnapshot ||
          current.currentInstitutionalSnapshot.pricingVersion !==
            DECLARED_CAPACITY_PRICING_VERSION ||
          !isDeclaredCapacityPlanCode(snapshot.planCode) ||
          snapshot.status !== InstitutionalSnapshotStatus.PRICED ||
          !snapshot.expiresAt ||
          snapshot.expiresAt <= now ||
          snapshot.declaredCapacity === null ||
          snapshot.policy.declaredCapacity === null ||
          snapshot.policy.scheduledCapacityDecrease !== null ||
          (snapshot.declaredCapacity < snapshot.policy.declaredCapacity &&
            now > censusCutoffFor(current.periodEnd))
        ) {
          throw new ConflictException({ code: "CAPACITY_QUOTE_CHANGED" });
        }
        const isDecrease =
          snapshot.declaredCapacity < snapshot.policy.declaredCapacity;
        if (isDecrease) {
          const confirmation = await tx.enrolmentRollConfirmation.findFirst({
            where: { orgId },
            orderBy: [{ revisionCutoff: "desc" }, { id: "desc" }],
            select: { revisionCutoff: true },
          });
          const estimate = calculateDeclaredCapacityQuote({
            declaredCapacity: snapshot.declaredCapacity,
            interval: declaredCapacityIntervalFromPlanCode(snapshot.planCode),
          });
          if (!confirmation || estimate.kind !== "priced") {
            throw new ConflictException({ code: "ROLL_REVIEW_REQUIRED" });
          }
          const active = await this.roll.roll(
            orgId,
            localDateAt(now, snapshot.policy.timezone),
            confirmation.revisionCutoff,
          );
          const siteCount = await tx.tenant.count({ where: { orgId } });
          if (
            snapshot.declaredCapacity < active.enrolledCount ||
            siteCount > estimate.siteAllowance
          ) {
            throw new ConflictException({
              code:
                snapshot.declaredCapacity < active.enrolledCount
                  ? "CAPACITY_BELOW_ACTIVE_ENROLMENT"
                  : "CAPACITY_BELOW_SITE_ALLOWANCE",
            });
          }
        }
        const effectiveAt = isDecrease ? current.periodEnd : null;
        const acceptance = await tx.institutionalQuoteAcceptance.create({
          data: {
            orgId,
            snapshotId,
            actorUserId,
            idempotencyKey,
            acceptedAmountPence: snapshot.amountDueNowPence,
            effectiveAt,
            acceptedAt: now,
          },
        });
        if (isDecrease) {
          await tx.institutionalBillingPolicy.update({
            where: { orgId },
            data: {
              scheduledCapacityDecrease: snapshot.declaredCapacity,
              scheduledCapacityEffectiveAt: current.periodEnd,
            },
          });
        } else {
          if (
            current.pendingInstitutionalSnapshotId ||
            !snapshot.prorationDate ||
            !snapshot.amountDueNowPence ||
            snapshot.amountDueNowPence <= 0
          ) {
            throw new ConflictException({ code: "CAPACITY_PAYMENT_REQUIRED" });
          }
          await tx.subscription.update({
            where: { id: current.id },
            data: { pendingInstitutionalSnapshotId: snapshot.id },
          });
        }
        await tx.auditEvent.create({
          data: {
            orgId,
            actorUserId,
            entityType: AuditEntityType.BILLING_QUOTE,
            entityId: snapshotId,
            action: AuditAction.UPDATED,
            metadata: {
              acceptedAt: acceptance.acceptedAt.toISOString(),
              amountPence: acceptance.acceptedAmountPence,
              effectiveAt: acceptance.effectiveAt?.toISOString() ?? null,
              change: isDecrease ? "scheduled_decrease" : "prorated_increase",
            },
          },
        });
        if (isDecrease) {
          return { kind: "scheduled_decrease" as const, acceptance };
        }
      }

      const current = await tx.subscription.findFirst({
        where: { id: snapshot.subscriptionId, orgId },
        include: { currentInstitutionalSnapshot: true },
      });
      const policy = await tx.institutionalBillingPolicy.findUnique({
        where: { orgId },
        select: {
          declaredCapacity: true,
          scheduledCapacityDecrease: true,
          scheduledCapacityEffectiveAt: true,
        },
      });
      if (
        snapshot.acceptance &&
        snapshot.declaredCapacity !== null &&
        policy?.scheduledCapacityDecrease === snapshot.declaredCapacity &&
        policy.scheduledCapacityEffectiveAt?.getTime() ===
          current?.periodEnd.getTime()
      ) {
        return {
          kind: "scheduled_decrease" as const,
          acceptance: snapshot.acceptance,
        };
      }
      if (
        current?.currentInstitutionalSnapshotId === snapshot.id &&
        !current.pendingInstitutionalSnapshotId
      ) {
        return {
          kind: "active" as const,
          acceptance: snapshot.acceptance ?? priorKey,
        };
      }
      if (current?.pendingInstitutionalSnapshotId !== snapshot.id) {
        throw new ConflictException({ code: "CAPACITY_CHANGE_NOT_PENDING" });
      }
      if (!current)
        throw new ConflictException({ code: "CAPACITY_CHANGE_NOT_PENDING" });
      return {
        kind: "payment_pending" as const,
        acceptance: snapshot.acceptance ?? priorKey,
        snapshot,
        current,
      };
    });

    if (accepted.kind !== "payment_pending") return accepted;
    return this.applyAcceptedIncrease(accepted.current, accepted.snapshot);
  }

  private async applyAcceptedIncrease(
    current: CapacitySubscription,
    snapshot: CapacityQuoteSnapshot,
  ): Promise<{
    kind: "payment_pending";
    snapshotId: string;
    amountDueNowPence: number;
    paymentIntentClientSecret: string | null;
    publishableKey: string | null;
  }> {
    if (
      !current.currentInstitutionalSnapshot ||
      current.currentInstitutionalSnapshotId !== snapshot.sourceSnapshotId ||
      !snapshot.prorationDate ||
      snapshot.amountDueNowPence === null
    ) {
      throw new ConflictException({ code: "CAPACITY_QUOTE_CHANGED" });
    }
    const stripe = this.stripe();
    const providerSubscription = await stripe.subscriptions.retrieve(
      current.providerSubId,
    );
    const currentItems = stripeItemsForSnapshot(
      current.currentInstitutionalSnapshot,
      this.config.stripe.priceMap ?? {},
    );
    const targetItems = stripeItemsForSnapshot(snapshot, {});
    assertProviderItemsMatch(providerSubscription, currentItems);
    const items = subscriptionItemsForTarget(
      providerSubscription,
      currentItems,
      targetItems,
    );
    const updated = await stripe.subscriptions.update(
      current.providerSubId,
      {
        items,
        proration_behavior: "always_invoice",
        payment_behavior: "pending_if_incomplete",
        proration_date: Math.floor(snapshot.prorationDate.getTime() / 1000),
        expand: ["latest_invoice.payment_intent"],
      },
      { idempotencyKey: `institutional-capacity-upgrade:${snapshot.id}` },
    );
    const invoice =
      typeof updated.latest_invoice === "object"
        ? updated.latest_invoice
        : null;
    const paymentIntent =
      invoice?.payment_intent && typeof invoice.payment_intent === "object"
        ? invoice.payment_intent
        : null;
    return {
      kind: "payment_pending",
      snapshotId: snapshot.id,
      amountDueNowPence: snapshot.amountDueNowPence,
      paymentIntentClientSecret: paymentIntent?.client_secret ?? null,
      publishableKey: paymentIntent?.client_secret
        ? (this.config.stripe.publishableKey ?? null)
        : null,
    };
  }
}
