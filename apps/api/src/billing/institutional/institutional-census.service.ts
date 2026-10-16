import {
  ConflictException,
  Injectable,
  Inject,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  InstitutionalCountSource,
  InstitutionalSnapshotKind,
  InstitutionalSnapshotStatus,
  prisma,
  SubscriptionStatus,
  withOrgRlsContext,
} from "@pathway/db";
import {
  calculateDeclaredCapacityQuote,
  declaredCapacityIntervalFromPlanCode,
  declaredCapacityPlanCode,
  isDeclaredCapacityPlanCode,
  DECLARED_CAPACITY_PLAN_CODES,
  DECLARED_CAPACITY_PRICING_VERSION,
  calculateInstitutionalQuote,
  INSTITUTIONAL_MAPPED_PLAN_CODES,
  INSTITUTIONAL_MAPPED_PRICING_VERSION,
  INSTITUTIONAL_PLANS,
  INSTITUTIONAL_PRICING_VERSION,
  isMappedInstitutionalPlanCode,
} from "@pathway/pricing";
import { EnrolmentRollService } from "../../enrolments/enrolment-roll.service";
import {
  InstitutionalQuoteService,
  withInstitutionalOrgLock,
} from "./institutional-quote.service";
import { isInstitutionalPlanCode } from "./institutional-selection";
import { censusCutoffFor, localDateAt } from "./institutional-time";
import { quoteFromFrozenInstitutionalPrices } from "./institutional-frozen-pricing";
import { quoteDeclaredCapacityWithFrozenPrices } from "./declared-capacity-stripe-pricing";

function institutionalPlanCode(value: string): string {
  if (
    !isInstitutionalPlanCode(value) &&
    !isMappedInstitutionalPlanCode(value) &&
    !isDeclaredCapacityPlanCode(value)
  ) {
    throw new ConflictException({ code: "SCHOOL_PRICING_NOT_AVAILABLE" });
  }
  return value;
}

@Injectable()
export class InstitutionalCensusService {
  private readonly logger = new Logger(InstitutionalCensusService.name);

  constructor(
    @Inject(EnrolmentRollService) private readonly roll: EnrolmentRollService,
    @Inject(InstitutionalQuoteService)
    private readonly quotes: InstitutionalQuoteService,
  ) {}

  async freezeNext(subscriptionId: string, now = new Date()) {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: { orgId: true },
    });
    if (!subscription) throw new NotFoundException("Subscription not found.");
    return withInstitutionalOrgLock(subscription.orgId, async (tx) => {
      const current = await tx.subscription.findFirst({
        where: { id: subscriptionId, orgId: subscription.orgId },
        select: {
          id: true,
          orgId: true,
          planCode: true,
          status: true,
          periodEnd: true,
          nextInstitutionalSnapshotId: true,
          pendingInstitutionalSnapshotId: true,
          currentInstitutionalSnapshot: {
            select: {
              createdAt: true,
              pricingVersion: true,
              planCode: true,
              declaredCapacity: true,
              enrolledChildren: true,
              subtotalPence: true,
              lines: true,
              includedModules: true,
              paidModules: true,
            },
          },
        },
      });
      if (!current) throw new NotFoundException("Subscription not found.");
      const planCode = institutionalPlanCode(current.planCode);
      if (
        current.status !== SubscriptionStatus.ACTIVE &&
        current.status !== SubscriptionStatus.PAST_DUE &&
        current.status !== SubscriptionStatus.TRIALING
      ) {
        throw new ConflictException({ code: "SUBSCRIPTION_NOT_RENEWING" });
      }
      const cutoffAt = censusCutoffFor(current.periodEnd);
      if (now < cutoffAt) return { kind: "not_due" as const, cutoffAt };
      const existing = await tx.institutionalBillingSnapshot.findFirst({
        where: {
          orgId: current.orgId,
          subscriptionId: current.id,
          kind: InstitutionalSnapshotKind.CENSUS,
          effectiveAt: current.periodEnd,
        },
        orderBy: { createdAt: "desc" },
      });
      if (existing) return { kind: "frozen" as const, snapshot: existing };

      const policy = await this.quotes.ensurePolicy(tx, current.orgId);
      const acceptedChange = await tx.institutionalBillingSnapshot.findFirst({
        where: {
          orgId: current.orgId,
          subscriptionId: current.id,
          kind: InstitutionalSnapshotKind.QUOTE,
          ...(current.pendingInstitutionalSnapshotId
            ? { id: { not: current.pendingInstitutionalSnapshotId } }
            : {}),
          acceptance: { is: { acceptedAt: { lte: cutoffAt } } },
          createdAt: {
            gt: current.currentInstitutionalSnapshot?.createdAt ?? new Date(0),
          },
        },
        orderBy: { acceptance: { acceptedAt: "desc" } },
      });
      const renewalPlanCode = institutionalPlanCode(
        acceptedChange?.planCode ?? planCode,
      );
      const priceTemplate =
        acceptedChange ?? current.currentInstitutionalSnapshot;
      const pricingVersion =
        priceTemplate?.pricingVersion ?? INSTITUTIONAL_PRICING_VERSION;
      const confirmation = await tx.enrolmentRollConfirmation.findFirst({
        where: { orgId: current.orgId, revisionCutoff: { lte: cutoffAt } },
        orderBy: [{ revisionCutoff: "desc" }, { id: "desc" }],
        select: { id: true, revisionCutoff: true },
      });
      const effectiveOn = localDateAt(current.periodEnd, policy.timezone);
      const count = confirmation
        ? (
            await this.roll.roll(
              current.orgId,
              effectiveOn,
              confirmation.revisionCutoff,
            )
          ).enrolledCount
        : null;
      let priced = null;
      let declaredCapacity: number | null = null;
      let declaredCapacityReviewRequired = false;
      if (
        count !== null &&
        pricingVersion === INSTITUTIONAL_MAPPED_PRICING_VERSION &&
        priceTemplate
      ) {
        try {
          priced = quoteFromFrozenInstitutionalPrices(priceTemplate, count);
        } catch (error) {
          this.logger.warn(
            `Institutional renewal price review required for subscription ${current.id}: ${error instanceof Error ? error.message : "invalid snapshot"}`,
          );
          priced = null;
        }
      } else if (
        count !== null &&
        policy.pricingVersion === INSTITUTIONAL_PRICING_VERSION &&
        isInstitutionalPlanCode(renewalPlanCode)
      ) {
        priced = calculateInstitutionalQuote({
          planCode: renewalPlanCode,
          enrolledChildren: count,
          pricingVersion: INSTITUTIONAL_PRICING_VERSION,
        });
      } else if (
        pricingVersion === DECLARED_CAPACITY_PRICING_VERSION &&
        priceTemplate &&
        isDeclaredCapacityPlanCode(priceTemplate.planCode)
      ) {
        const scheduledTargetCapacity =
          acceptedChange?.declaredCapacity ??
          (policy.scheduledCapacityDecrease !== null &&
          policy.scheduledCapacityEffectiveAt !== null &&
          policy.scheduledCapacityEffectiveAt <= current.periodEnd
            ? policy.scheduledCapacityDecrease
            : null);
        const requiresVerifiedRoll =
          scheduledTargetCapacity !== null &&
          policy.declaredCapacity !== null &&
          scheduledTargetCapacity < policy.declaredCapacity;
        const targetCapacity =
          requiresVerifiedRoll && count === null
            ? policy.declaredCapacity
            : (scheduledTargetCapacity ?? policy.declaredCapacity);
        if (targetCapacity !== null) {
          try {
            const interval = declaredCapacityIntervalFromPlanCode(
              priceTemplate.planCode,
            );
            const quote = quoteDeclaredCapacityWithFrozenPrices(
              { declaredCapacity: targetCapacity, interval },
              priceTemplate.lines,
              priceTemplate.paidModules,
            );
            const estimate = calculateDeclaredCapacityQuote({
              declaredCapacity: targetCapacity,
              interval,
            });
            if (
              quote.kind === "priced" &&
              estimate.kind === "priced" &&
              declaredCapacityPlanCode(estimate.tier, interval) ===
                quote.planCode &&
              (count === null || targetCapacity >= count) &&
              (await tx.tenant.count({ where: { orgId: current.orgId } })) <=
                quote.siteAllowance
            ) {
              priced = {
                kind: "priced" as const,
                declaredCapacity: targetCapacity,
                includedChildren: null,
                planCode: quote.planCode,
                lines: quote.lines,
                subtotalPence: quote.subtotalPence,
              };
              declaredCapacity = targetCapacity;
            } else if (
              quote.kind === "priced" &&
              count !== null &&
              targetCapacity < count
            ) {
              declaredCapacityReviewRequired = true;
            } else if (quote.kind === "contact_sales") {
              priced = quote;
            }
          } catch (error) {
            this.logger.warn(
              `Declared-capacity renewal price review required for subscription ${current.id}: ${error instanceof Error ? error.message : "invalid snapshot"}`,
            );
          }
        }
      }
      const status =
        priced?.kind === "priced" && !declaredCapacityReviewRequired
          ? InstitutionalSnapshotStatus.PRICED
          : InstitutionalSnapshotStatus.REVIEW_REQUIRED;
      const isPriced = status === InstitutionalSnapshotStatus.PRICED;
      const reviewReason =
        !confirmation && pricingVersion !== DECLARED_CAPACITY_PRICING_VERSION
          ? "ROLL_UNVERIFIED"
          : declaredCapacityReviewRequired
            ? "DECLARED_CAPACITY_REVIEW_REQUIRED"
            : priced?.kind === "contact_sales"
              ? "OVER_250_CHILDREN"
              : pricingVersion === DECLARED_CAPACITY_PRICING_VERSION &&
                  declaredCapacity === null
                ? "DECLARED_CAPACITY_REVIEW_REQUIRED"
                : !priced
                  ? "PRICING_REVIEW_REQUIRED"
                  : null;
      const snapshot = await tx.institutionalBillingSnapshot.create({
        data: {
          orgId: current.orgId,
          policyId: policy.id,
          subscriptionId: current.id,
          kind: InstitutionalSnapshotKind.CENSUS,
          status,
          planCode:
            pricingVersion === DECLARED_CAPACITY_PRICING_VERSION &&
            priced?.kind === "priced" &&
            "planCode" in priced
              ? priced.planCode
              : renewalPlanCode,
          pricingVersion,
          countSource: confirmation ? InstitutionalCountSource.VERIFIED : null,
          enrolledChildren: count,
          declaredCapacity: isPriced ? declaredCapacity : null,
          includedChildren:
            isPriced && priced?.kind === "priced"
              ? priced.includedChildren
              : null,
          includedModules:
            acceptedChange?.includedModules ??
            current.currentInstitutionalSnapshot?.includedModules ??
            [],
          paidModules:
            acceptedChange?.paidModules ??
            current.currentInstitutionalSnapshot?.paidModules ??
            [],
          lines: isPriced && priced?.kind === "priced" ? priced.lines : [],
          subtotalPence:
            isPriced && priced?.kind === "priced" ? priced.subtotalPence : null,
          sourceConfirmationId: confirmation?.id,
          sourceRevisionCutoff: confirmation?.revisionCutoff,
          censusCutoffAt: cutoffAt,
          effectiveAt: current.periodEnd,
        },
      });
      await tx.subscription.update({
        where: { id: current.id },
        data: { nextInstitutionalSnapshotId: snapshot.id },
      });
      await tx.institutionalBillingPolicy.update({
        where: { orgId: current.orgId },
        data: { reviewReason },
      });
      return { kind: "frozen" as const, snapshot };
    });
  }

  async summary(orgId: string, now = new Date()) {
    return withOrgRlsContext(orgId, async (tx) => {
      const policy = await tx.institutionalBillingPolicy.findUnique({
        where: { orgId },
      });
      const subscription = await tx.subscription.findFirst({
        where: {
          orgId,
          planCode: {
            in: [
              ...Object.keys(INSTITUTIONAL_PLANS),
              ...INSTITUTIONAL_MAPPED_PLAN_CODES,
              ...DECLARED_CAPACITY_PLAN_CODES,
            ],
          },
          status: {
            in: [
              SubscriptionStatus.ACTIVE,
              SubscriptionStatus.PAST_DUE,
              SubscriptionStatus.TRIALING,
            ],
          },
        },
        orderBy: { createdAt: "desc" },
        include: {
          currentInstitutionalSnapshot: true,
          nextInstitutionalSnapshot: true,
          pendingInstitutionalSnapshot: true,
        },
      });
      const planCode = subscription
        ? institutionalPlanCode(subscription.planCode)
        : null;
      const acceptedChange = subscription
        ? await tx.institutionalBillingSnapshot.findFirst({
            where: {
              orgId,
              subscriptionId: subscription.id,
              kind: InstitutionalSnapshotKind.QUOTE,
              ...(subscription.pendingInstitutionalSnapshotId
                ? { id: { not: subscription.pendingInstitutionalSnapshotId } }
                : {}),
              acceptance: { isNot: null },
              createdAt: {
                gt:
                  subscription.currentInstitutionalSnapshot?.createdAt ??
                  new Date(0),
              },
            },
            orderBy: { acceptance: { acceptedAt: "desc" } },
            include: { acceptance: { select: { acceptedAt: true } } },
          })
        : null;
      const latestConfirmation = await tx.enrolmentRollConfirmation.findFirst({
        where: { orgId },
        orderBy: [{ revisionCutoff: "desc" }, { id: "desc" }],
        select: { id: true, revisionCutoff: true },
      });
      const forecastCount =
        latestConfirmation && policy
          ? (
              await this.roll.roll(
                orgId,
                localDateAt(now, policy.timezone),
                latestConfirmation.revisionCutoff,
              )
            ).enrolledCount
          : subscription
            ? null
            : (policy?.declaredChildren ?? null);
      let forecast = null;
      const template =
        acceptedChange ?? subscription?.currentInstitutionalSnapshot;
      const declaredCapacityForecast =
        template?.pricingVersion === DECLARED_CAPACITY_PRICING_VERSION &&
        template.declaredCapacity !== null &&
        isDeclaredCapacityPlanCode(template.planCode);
      if (planCode && (forecastCount !== null || declaredCapacityForecast)) {
        if (
          forecastCount !== null &&
          template?.pricingVersion === INSTITUTIONAL_MAPPED_PRICING_VERSION
        ) {
          try {
            forecast = quoteFromFrozenInstitutionalPrices(
              template,
              forecastCount,
            );
          } catch (error) {
            this.logger.warn(
              `Institutional forecast price review required for subscription ${subscription?.id}: ${error instanceof Error ? error.message : "invalid snapshot"}`,
            );
            forecast = null;
          }
        } else if (
          forecastCount !== null &&
          isInstitutionalPlanCode(planCode)
        ) {
          forecast = calculateInstitutionalQuote({
            planCode,
            enrolledChildren: forecastCount,
            pricingVersion: INSTITUTIONAL_PRICING_VERSION,
          });
        } else if (
          template?.pricingVersion === DECLARED_CAPACITY_PRICING_VERSION &&
          template.declaredCapacity !== null &&
          isDeclaredCapacityPlanCode(template.planCode)
        ) {
          const targetCapacity =
            acceptedChange?.declaredCapacity ??
            (policy?.scheduledCapacityDecrease !== null &&
            policy?.scheduledCapacityDecrease !== undefined &&
            policy.scheduledCapacityEffectiveAt !== null &&
            subscription?.periodEnd &&
            policy.scheduledCapacityEffectiveAt <= subscription.periodEnd
              ? policy.scheduledCapacityDecrease
              : template.declaredCapacity);
          try {
            const quote = quoteDeclaredCapacityWithFrozenPrices(
              {
                declaredCapacity: targetCapacity,
                interval: declaredCapacityIntervalFromPlanCode(
                  template.planCode,
                ),
              },
              template.lines,
              template.paidModules,
            );
            forecast =
              quote.kind === "priced"
                ? { ...quote, activeEnrolledChildren: forecastCount }
                : quote;
          } catch (error) {
            this.logger.warn(
              `Declared-capacity forecast review required for subscription ${subscription?.id}: ${error instanceof Error ? error.message : "invalid snapshot"}`,
            );
            forecast = null;
          }
        }
      }
      return {
        orgId,
        currentPaid: subscription
          ? {
              planCode,
              periodStart: subscription.periodStart,
              periodEnd: subscription.periodEnd,
              declaredCapacity:
                subscription.currentInstitutionalSnapshot?.declaredCapacity ??
                null,
              enrolledChildren:
                subscription.currentInstitutionalSnapshot?.enrolledChildren ??
                null,
              includedChildren:
                subscription.currentInstitutionalSnapshot?.includedChildren ??
                null,
              includedModules:
                subscription.currentInstitutionalSnapshot?.includedModules ??
                [],
              paidModules:
                subscription.currentInstitutionalSnapshot?.paidModules ?? [],
              lines: subscription.currentInstitutionalSnapshot?.lines ?? [],
              subtotalPence:
                subscription.currentInstitutionalSnapshot?.subtotalPence ??
                null,
              status: subscription.status,
            }
          : null,
        liveForecast: forecast,
        frozenRenewal: subscription?.nextInstitutionalSnapshot
          ? {
              planCode: subscription.nextInstitutionalSnapshot.planCode,
              status: subscription.nextInstitutionalSnapshot.status,
              declaredCapacity:
                subscription.nextInstitutionalSnapshot.declaredCapacity,
              enrolledChildren:
                subscription.nextInstitutionalSnapshot.enrolledChildren,
              includedChildren:
                subscription.nextInstitutionalSnapshot.includedChildren,
              includedModules:
                subscription.nextInstitutionalSnapshot.includedModules,
              paidModules: subscription.nextInstitutionalSnapshot.paidModules,
              lines: subscription.nextInstitutionalSnapshot.lines ?? [],
              subtotalPence:
                subscription.nextInstitutionalSnapshot.subtotalPence,
              cutoffAt: subscription.nextInstitutionalSnapshot.censusCutoffAt,
              effectiveAt: subscription.nextInstitutionalSnapshot.effectiveAt,
            }
          : null,
        scheduledChange: acceptedChange
          ? {
              planCode: acceptedChange.planCode,
              declaredCapacity: acceptedChange.declaredCapacity,
              includedModules: acceptedChange.includedModules,
              paidModules: acceptedChange.paidModules,
              acceptedAt: acceptedChange.acceptance?.acceptedAt ?? null,
              effectiveAt:
                subscription &&
                acceptedChange.acceptance &&
                acceptedChange.acceptance.acceptedAt <=
                  censusCutoffFor(subscription.periodEnd)
                  ? subscription.periodEnd
                  : null,
            }
          : policy?.scheduledCapacityDecrease !== null &&
              policy?.scheduledCapacityDecrease !== undefined
            ? {
                planCode: null,
                declaredCapacity: policy.scheduledCapacityDecrease,
                includedModules: [],
                paidModules: [],
                acceptedAt: null,
                effectiveAt: policy.scheduledCapacityEffectiveAt,
              }
            : null,
        pendingCapacityChange: subscription?.pendingInstitutionalSnapshot
          ? {
              snapshotId: subscription.pendingInstitutionalSnapshot.id,
              declaredCapacity:
                subscription.pendingInstitutionalSnapshot.declaredCapacity,
              amountDueNowPence:
                subscription.pendingInstitutionalSnapshot.amountDueNowPence,
              status: subscription.pendingInstitutionalSnapshot.status,
            }
          : null,
        nextCutoffAt: subscription
          ? censusCutoffFor(subscription.periodEnd)
          : null,
        reviewReason: policy?.reviewReason ?? null,
        countSource: latestConfirmation
          ? InstitutionalCountSource.VERIFIED
          : !subscription &&
              policy?.declaredChildren !== null &&
              policy?.declaredChildren !== undefined
            ? InstitutionalCountSource.DECLARED
            : null,
      };
    });
  }
}
