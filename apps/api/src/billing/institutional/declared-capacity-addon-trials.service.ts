import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  InstitutionalAddonTrialStatus,
  Module,
  ModuleGrantSource,
  ModuleStatus,
  Prisma,
  SubscriptionStatus,
  withOrgRlsContext,
} from "@pathway/db";
import {
  calculateDeclaredCapacityQuote,
  declaredCapacityIntervalFromPlanCode,
  declaredCapacityPlanCode,
  DECLARED_CAPACITY_PRICING_VERSION,
  isDeclaredCapacityPlanCode,
} from "@pathway/pricing";
import { InstitutionalPriceResolver } from "./institutional-price-resolver";
import { isDeclaredCapacityAddonTrialReady } from "./declared-capacity-stripe-pricing";
import {
  DECLARED_CAPACITY_ADDON_MODULES,
  isDeclaredCapacityAddonModule,
  type DeclaredCapacityAddonModule,
} from "./declared-capacity-addons";
import { addonTrialExpiresAt } from "./declared-capacity-addon-trial-policy";
import { assertDeclaredCapacityBillingEnabled } from "./declared-capacity-gate";
import { withInstitutionalOrgLock } from "./institutional-quote.service";
import { refreshEffectiveOrgModules } from "../module-grants";
import { DeclaredCapacityAddonTrialExpiryService } from "./declared-capacity-addon-trial-expiry.service";

@Injectable()
export class DeclaredCapacityAddonTrialsService {
  constructor(
    @Inject(InstitutionalPriceResolver)
    private readonly prices: InstitutionalPriceResolver,
    @Inject(DeclaredCapacityAddonTrialExpiryService)
    private readonly expiry: DeclaredCapacityAddonTrialExpiryService,
  ) {}

  async list(orgId: string, now = new Date()) {
    const current = await withInstitutionalOrgLock(orgId, async (tx) => {
      const { capacity, quote } = await this.currentPlan(tx, orgId);
      const trials = await tx.institutionalAddonTrial.findMany({
        where: { orgId },
        orderBy: [{ selectedAt: "asc" }, { module: "asc" }],
      });
      const consumedSlots = trials.filter(
        (trial) => trial.activatedAt !== null,
      ).length;
      const pendingSelections = trials.filter(
        (trial) => trial.status === InstitutionalAddonTrialStatus.SELECTED,
      ).length;
      const enabledModules = await tx.orgModule.findMany({
        where: {
          orgId,
          status: ModuleStatus.ACTIVE,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: { module: true },
      });
      return {
        capacity,
        quote,
        trials,
        consumedSlots,
        pendingSelections,
        enabledModules,
      };
    });
    const prices = await this.prices.resolve();
    const unavailable = new Set([
      ...current.trials.map(({ module }) => module),
      ...current.enabledModules.map(({ module }) => module),
    ]);
    const availableModules = DECLARED_CAPACITY_ADDON_MODULES.filter(
      (module) =>
        current.consumedSlots + current.pendingSelections <
          current.quote.trialModuleSlots &&
        !unavailable.has(module) &&
        isDeclaredCapacityAddonTrialReady(module, prices),
    );
    return {
      pricingVersion: DECLARED_CAPACITY_PRICING_VERSION,
      declaredCapacity: current.capacity,
      trialSlotLimit: current.quote.trialModuleSlots,
      consumedSlots: current.consumedSlots,
      pendingSelections: current.pendingSelections,
      remainingSlots: Math.max(
        0,
        current.quote.trialModuleSlots -
          current.consumedSlots -
          current.pendingSelections,
      ),
      availableModules,
      trials: current.trials.map((trial) => ({
        module: trial.module,
        status:
          trial.status === InstitutionalAddonTrialStatus.ACTIVE &&
          trial.expiresAt !== null &&
          trial.expiresAt <= now
            ? InstitutionalAddonTrialStatus.EXPIRED
            : trial.status,
        selectedAt: trial.selectedAt,
        activatedAt: trial.activatedAt,
        expiresAt: trial.expiresAt,
      })),
    };
  }

  async select(orgId: string, module: Module, now = new Date()) {
    this.assertTrialModule(module);
    const previous = await this.findTrial(orgId, module);
    if (previous) {
      if (previous.status === InstitutionalAddonTrialStatus.SELECTED) {
        return previous;
      }
      throw new ConflictException({ code: "ADDON_TRIAL_ALREADY_USED" });
    }
    const prices = await this.prices.resolve();
    return withInstitutionalOrgLock(orgId, async (tx) => {
      const existing = await tx.institutionalAddonTrial.findUnique({
        where: { orgId_module: { orgId, module } },
      });
      if (existing) {
        if (existing.status === InstitutionalAddonTrialStatus.SELECTED) {
          return existing;
        }
        throw new ConflictException({ code: "ADDON_TRIAL_ALREADY_USED" });
      }
      const { quote } = await this.currentPlan(tx, orgId);
      this.assertTrialModuleConfigured(module, prices);
      const [reservedSlots, existingAccess] = await Promise.all([
        tx.institutionalAddonTrial.count({
          where: {
            orgId,
            OR: [
              { activatedAt: { not: null } },
              { status: InstitutionalAddonTrialStatus.SELECTED },
            ],
          },
        }),
        tx.orgModule.findUnique({
          where: { orgId_module: { orgId, module } },
          select: { status: true, expiresAt: true },
        }),
      ]);
      if (
        existingAccess?.status === ModuleStatus.ACTIVE &&
        (!existingAccess.expiresAt || existingAccess.expiresAt > now)
      ) {
        throw new ConflictException({ code: "ADDON_ALREADY_ENABLED" });
      }
      if (reservedSlots >= quote.trialModuleSlots) {
        throw new ConflictException({ code: "ADDON_TRIAL_SLOTS_EXHAUSTED" });
      }
      return tx.institutionalAddonTrial.create({
        data: { orgId, module, selectedAt: now },
      });
    });
  }

  async removeSelection(
    orgId: string,
    module: Module,
  ): Promise<{ removed: boolean }> {
    return withInstitutionalOrgLock(orgId, async (tx) => {
      const removed = await tx.institutionalAddonTrial.deleteMany({
        where: {
          orgId,
          module,
          status: InstitutionalAddonTrialStatus.SELECTED,
          activatedAt: null,
        },
      });
      return { removed: removed.count === 1 };
    });
  }

  async activate(
    orgId: string,
    actorUserId: string,
    module: Module,
    now = new Date(),
  ) {
    this.assertTrialModule(module);
    const previous = await this.findTrial(orgId, module);
    if (!previous) {
      throw new ConflictException({ code: "ADDON_TRIAL_NOT_SELECTED" });
    }
    if (previous.status === InstitutionalAddonTrialStatus.ACTIVE) {
      if (previous.expiresAt && previous.expiresAt > now) return previous;
      throw new ConflictException({ code: "ADDON_TRIAL_EXPIRED" });
    }
    if (previous.status !== InstitutionalAddonTrialStatus.SELECTED) {
      throw new ConflictException({ code: "ADDON_TRIAL_ALREADY_USED" });
    }
    const prices = await this.prices.resolve();
    return withInstitutionalOrgLock(orgId, async (tx) => {
      const existing = await tx.institutionalAddonTrial.findUnique({
        where: { orgId_module: { orgId, module } },
      });
      if (!existing) {
        throw new ConflictException({ code: "ADDON_TRIAL_NOT_SELECTED" });
      }
      if (existing.status === InstitutionalAddonTrialStatus.ACTIVE) {
        if (existing.expiresAt && existing.expiresAt > now) return existing;
        throw new ConflictException({ code: "ADDON_TRIAL_EXPIRED" });
      }
      if (existing.status !== InstitutionalAddonTrialStatus.SELECTED) {
        throw new ConflictException({ code: "ADDON_TRIAL_ALREADY_USED" });
      }
      const { quote } = await this.currentPlan(tx, orgId);
      this.assertTrialModuleConfigured(module, prices);
      const [consumedSlots, existingAccess] = await Promise.all([
        tx.institutionalAddonTrial.count({
          where: { orgId, activatedAt: { not: null } },
        }),
        tx.orgModule.findUnique({
          where: { orgId_module: { orgId, module } },
          select: { status: true, expiresAt: true },
        }),
      ]);
      if (
        existingAccess?.status === ModuleStatus.ACTIVE &&
        (!existingAccess.expiresAt || existingAccess.expiresAt > now)
      ) {
        throw new ConflictException({ code: "ADDON_ALREADY_ENABLED" });
      }
      if (consumedSlots >= quote.trialModuleSlots) {
        throw new ConflictException({ code: "ADDON_TRIAL_SLOTS_EXHAUSTED" });
      }
      const expiresAt = addonTrialExpiresAt(now);
      const activated = await tx.institutionalAddonTrial.update({
        where: { id: existing.id },
        data: {
          status: InstitutionalAddonTrialStatus.ACTIVE,
          activatedAt: now,
          expiresAt,
          activatedByUserId: actorUserId,
        },
      });
      await tx.moduleGrant.upsert({
        where: {
          orgId_module_source_sourceId: {
            orgId,
            module,
            source: ModuleGrantSource.TRIAL,
            sourceId: activated.id,
          },
        },
        create: {
          orgId,
          module,
          source: ModuleGrantSource.TRIAL,
          sourceId: activated.id,
          status: ModuleStatus.ACTIVE,
          expiresAt,
        },
        update: { status: ModuleStatus.ACTIVE, expiresAt },
      });
      await refreshEffectiveOrgModules(tx, orgId, new Set([module]));
      return activated;
    });
  }

  async decide(
    orgId: string,
    actorUserId: string,
    module: Module,
    wantsPurchase: boolean,
    now = new Date(),
  ) {
    this.assertTrialModule(module);
    await this.expiry.expireDueForOrg(orgId, now);
    return withInstitutionalOrgLock(orgId, async (tx) => {
      const trial = await tx.institutionalAddonTrial.findUnique({
        where: { orgId_module: { orgId, module } },
      });
      if (
        !trial ||
        trial.status === InstitutionalAddonTrialStatus.SELECTED ||
        trial.activatedAt === null ||
        trial.expiresAt === null ||
        trial.expiresAt > now
      ) {
        throw new ConflictException({ code: "ADDON_TRIAL_NOT_EXPIRED" });
      }
      if (trial.status === InstitutionalAddonTrialStatus.CONVERTED) {
        throw new ConflictException({ code: "ADDON_TRIAL_ALREADY_CONVERTED" });
      }
      if (wantsPurchase) {
        if (trial.status === InstitutionalAddonTrialStatus.DECLINED) {
          throw new ConflictException({
            code: "ADDON_TRIAL_DECISION_RECORDED",
          });
        }
        if (trial.decisionActorUserId) return trial;
        return tx.institutionalAddonTrial.update({
          where: { id: trial.id },
          data: { decisionActorUserId: actorUserId, decidedAt: now },
        });
      }
      if (trial.status === InstitutionalAddonTrialStatus.DECLINED) return trial;
      if (trial.decisionActorUserId) {
        throw new ConflictException({ code: "ADDON_TRIAL_DECISION_RECORDED" });
      }
      return tx.institutionalAddonTrial.update({
        where: { id: trial.id },
        data: {
          status: InstitutionalAddonTrialStatus.DECLINED,
          decisionActorUserId: actorUserId,
          decidedAt: now,
        },
      });
    });
  }

  async priceReview(orgId: string, module: Module, now = new Date()) {
    this.assertTrialModule(module);
    assertDeclaredCapacityBillingEnabled();
    await withInstitutionalOrgLock(orgId, async (tx) => {
      await this.currentPlan(tx, orgId);
      const existing = await tx.institutionalAddonTrial.findUnique({
        where: { orgId_module: { orgId, module } },
      });
      if (
        !existing ||
        existing.status !== InstitutionalAddonTrialStatus.EXPIRED ||
        !existing.expiresAt ||
        existing.expiresAt > now ||
        !existing.decisionActorUserId ||
        !existing.decidedAt
      ) {
        throw new ConflictException({
          code: "ADDON_TRIAL_PURCHASE_CONSENT_REQUIRED",
        });
      }
    });
    try {
      const prices = await this.prices.resolve();
      this.assertTrialModuleConfigured(module, prices);
      const monthlyCode = `MODULE_${module}_MONTHLY` as const;
      const yearlyCode = `MODULE_${module}_YEARLY` as const;
      const monthly = prices[monthlyCode];
      const yearly = prices[yearlyCode];
      if (!monthly || !yearly) {
        throw new ServiceUnavailableException({
          code: "ADDON_PRICE_NOT_CONFIGURED",
        });
      }
      return {
        module,
        currency: "GBP" as const,
        monthly: { amountPence: monthly.unitAmountPence },
        yearly: { amountPence: yearly.unitAmountPence },
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException({
        code: "ADDON_PRICE_NOT_CONFIGURED",
      });
    }
  }

  async checkoutContext(orgId: string, module: Module, now = new Date()) {
    assertDeclaredCapacityBillingEnabled();
    return withInstitutionalOrgLock(orgId, async (tx) => {
      const { quote } = await this.currentPlan(tx, orgId);
      const trial = await tx.institutionalAddonTrial.findUnique({
        where: { orgId_module: { orgId, module } },
      });
      if (
        !trial ||
        trial.status !== InstitutionalAddonTrialStatus.EXPIRED ||
        !trial.expiresAt ||
        trial.expiresAt > now ||
        !trial.decisionActorUserId ||
        !trial.decidedAt
      ) {
        throw new ConflictException({
          code: "ADDON_TRIAL_PURCHASE_CONSENT_REQUIRED",
        });
      }
      const org = await tx.org.findUnique({
        where: { id: orgId },
        select: { stripeCustomerId: true },
      });
      if (!org?.stripeCustomerId) {
        throw new ConflictException({
          code: "ADDON_BILLING_CUSTOMER_REQUIRED",
        });
      }
      return { trial, stripeCustomerId: org.stripeCustomerId, quote };
    });
  }

  private findTrial(orgId: string, module: Module) {
    return withOrgRlsContext(orgId, (tx) =>
      tx.institutionalAddonTrial.findUnique({
        where: { orgId_module: { orgId, module } },
      }),
    );
  }

  private async currentPlan(tx: Prisma.TransactionClient, orgId: string) {
    const [org, policy, subscription] = await Promise.all([
      tx.org.findUnique({
        where: { id: orgId },
        select: { isMasterOrg: true },
      }),
      tx.institutionalBillingPolicy.findUnique({ where: { orgId } }),
      tx.subscription.findFirst({
        where: {
          orgId,
          status: SubscriptionStatus.ACTIVE,
          planCode: { startsWith: "DECLARED_CAPACITY_" },
        },
        orderBy: { createdAt: "desc" },
        select: {
          planCode: true,
          currentInstitutionalSnapshot: {
            select: { pricingVersion: true, declaredCapacity: true },
          },
        },
      }),
    ]);
    if (
      !org ||
      org.isMasterOrg ||
      policy?.pricingVersion !== DECLARED_CAPACITY_PRICING_VERSION ||
      policy.declaredCapacity === null ||
      !subscription ||
      !isDeclaredCapacityPlanCode(subscription.planCode) ||
      subscription.currentInstitutionalSnapshot?.pricingVersion !==
        DECLARED_CAPACITY_PRICING_VERSION ||
      subscription.currentInstitutionalSnapshot.declaredCapacity !==
        policy.declaredCapacity
    ) {
      throw new ConflictException({
        code: "DECLARED_CAPACITY_SUBSCRIPTION_REQUIRED",
      });
    }
    const interval = declaredCapacityIntervalFromPlanCode(
      subscription.planCode,
    );
    const quote = calculateDeclaredCapacityQuote({
      declaredCapacity: policy.declaredCapacity,
      interval,
    });
    if (
      quote.kind !== "priced" ||
      declaredCapacityPlanCode(quote.tier, interval) !== subscription.planCode
    ) {
      throw new ConflictException({
        code: "DECLARED_CAPACITY_SUBSCRIPTION_REQUIRED",
      });
    }
    return { capacity: policy.declaredCapacity, quote };
  }

  private assertTrialModuleConfigured(
    module: Module,
    prices: Awaited<ReturnType<InstitutionalPriceResolver["resolve"]>>,
  ): void {
    if (!isDeclaredCapacityAddonTrialReady(module, prices)) {
      throw new ServiceUnavailableException({
        code: "ADDON_TRIAL_NOT_AVAILABLE",
      });
    }
  }

  private assertTrialModule(
    module: Module,
  ): asserts module is DeclaredCapacityAddonModule {
    if (!isDeclaredCapacityAddonModule(module)) {
      throw new BadRequestException({
        code: "ADDON_MODULE_NOT_TRIAL_ELIGIBLE",
      });
    }
  }
}
