import { ConflictException, Inject, Injectable } from "@nestjs/common";
import {
  BillingProvider,
  InstitutionalAddonInterval,
  InstitutionalAddonTrialStatus,
  Module,
  ModuleGrantSource,
  ModuleStatus,
  SubscriptionStatus,
  withOrgRlsContext,
} from "@pathway/db";
import { DECLARED_CAPACITY_PRICING_VERSION } from "@pathway/pricing";
import type { ParsedBillingWebhookEvent } from "../billing-webhook.provider";
import { addOnSubscriptionPlanCode } from "../subscription-plan-code";
import { refreshEffectiveOrgModules } from "../module-grants";
import { InstitutionalPriceResolver } from "./institutional-price-resolver";
import { isDeclaredCapacityAddonTrialReady } from "./declared-capacity-stripe-pricing";
import {
  declaredCapacityAddonPriceCode,
  isDeclaredCapacityAddonModule,
  type DeclaredCapacityAddonModule,
} from "./declared-capacity-addons";
import { withInstitutionalOrgLock } from "./institutional-quote.service";

function intervalFromTrial(
  interval: InstitutionalAddonInterval,
): "month" | "year" {
  return interval === InstitutionalAddonInterval.YEARLY ? "year" : "month";
}

function expectedPlanCode(module: Module): string {
  return addOnSubscriptionPlanCode(`DECLARED_CAPACITY_${module}`);
}

function intervalName(interval: InstitutionalAddonInterval): string {
  return interval === InstitutionalAddonInterval.YEARLY ? "YEARLY" : "MONTHLY";
}

@Injectable()
export class DeclaredCapacityAddonTrialWebhookService {
  constructor(
    @Inject(InstitutionalPriceResolver)
    private readonly prices: InstitutionalPriceResolver,
  ) {}

  async handle(event: ParsedBillingWebhookEvent): Promise<boolean> {
    const addonTrialId = event.addonTrialId;
    if (!addonTrialId) return false;
    if (
      event.provider !== BillingProvider.STRIPE ||
      !event.orgId ||
      !event.subscriptionId
    ) {
      throw new ConflictException({ code: "ADDON_TRIAL_WEBHOOK_INVALID" });
    }
    const trial = await withOrgRlsContext(event.orgId, (tx) =>
      tx.institutionalAddonTrial.findFirst({
        where: { id: addonTrialId, orgId: event.orgId },
      }),
    );
    const module = trial?.module;
    if (!trial || !module || !isDeclaredCapacityAddonModule(module)) {
      throw new ConflictException({ code: "ADDON_TRIAL_WEBHOOK_UNKNOWN" });
    }
    if (
      !trial.chosenPaidInterval ||
      event.addonModule !== module ||
      event.addonInterval !== intervalName(trial.chosenPaidInterval) ||
      event.planCode !== expectedPlanCode(module)
    ) {
      throw new ConflictException({ code: "ADDON_TRIAL_WEBHOOK_INVALID" });
    }

    if (
      event.kind === "subscription.created" ||
      event.kind === "invoice.draft"
    ) {
      await this.persistCheckoutSession(event, trial.id);
      return true;
    }
    if (event.kind === "subscription.updated") {
      if (trial.status !== InstitutionalAddonTrialStatus.CONVERTED) return true;
      await this.applySubscriptionUpdate(event, module);
      return true;
    }
    if (event.kind === "subscription.canceled") {
      if (trial.status === InstitutionalAddonTrialStatus.CONVERTED) {
        await this.applySubscriptionUpdate(event, module);
      }
      return true;
    }
    if (event.kind === "invoice.payment_failed") {
      if (trial.status === InstitutionalAddonTrialStatus.CONVERTED) {
        await withInstitutionalOrgLock(event.orgId, async (tx) => {
          await tx.subscription.updateMany({
            where: {
              orgId: event.orgId,
              providerSubId: event.subscriptionId,
              planCode: expectedPlanCode(module),
              status: { not: SubscriptionStatus.CANCELED },
            },
            data: { status: SubscriptionStatus.PAST_DUE },
          });
        });
      }
      return true;
    }
    if (event.kind !== "invoice.paid") return true;

    await this.activatePaidAddon(event, { ...trial, module });
    return true;
  }

  private async persistCheckoutSession(
    event: ParsedBillingWebhookEvent,
    trialId: string,
  ): Promise<void> {
    if (!event.providerCheckoutId || !event.addonInterval) return;
    const interval =
      event.addonInterval === "YEARLY"
        ? InstitutionalAddonInterval.YEARLY
        : event.addonInterval === "MONTHLY"
          ? InstitutionalAddonInterval.MONTHLY
          : null;
    if (!interval)
      throw new ConflictException({ code: "ADDON_TRIAL_WEBHOOK_INVALID" });
    await withInstitutionalOrgLock(event.orgId, async (tx) => {
      const trial = await tx.institutionalAddonTrial.findUnique({
        where: { id: trialId },
      });
      if (
        !trial ||
        trial.module !== event.addonModule ||
        trial.chosenPaidInterval !== interval ||
        trial.status === InstitutionalAddonTrialStatus.DECLINED
      ) {
        throw new ConflictException({ code: "ADDON_TRIAL_WEBHOOK_INVALID" });
      }
      if (
        trial.paidCheckoutSessionId &&
        trial.paidCheckoutSessionId !== event.providerCheckoutId
      ) {
        throw new ConflictException({ code: "ADDON_TRIAL_CHECKOUT_CHANGED" });
      }
      await tx.institutionalAddonTrial.updateMany({
        where: { id: trial.id, orgId: event.orgId },
        data: { paidCheckoutSessionId: event.providerCheckoutId },
      });
    });
  }

  private async activatePaidAddon(
    event: ParsedBillingWebhookEvent,
    trial: {
      id: string;
      orgId: string;
      module: DeclaredCapacityAddonModule;
      status: InstitutionalAddonTrialStatus;
      decisionActorUserId: string | null;
      decidedAt: Date | null;
      chosenPaidInterval: InstitutionalAddonInterval | null;
      paidSubscriptionId: string | null;
      paidCheckoutSessionId: string | null;
    },
  ): Promise<void> {
    const interval = trial.chosenPaidInterval;
    if (
      !interval ||
      !trial.decisionActorUserId ||
      !trial.decidedAt ||
      (trial.status !== InstitutionalAddonTrialStatus.EXPIRED &&
        trial.status !== InstitutionalAddonTrialStatus.CONVERTED) ||
      event.addonModule !== trial.module ||
      event.addonInterval !== interval ||
      event.planCode !== expectedPlanCode(trial.module) ||
      event.kind !== "invoice.paid" ||
      !event.invoice ||
      event.invoice.status !== "paid" ||
      event.invoice.currency !== "gbp" ||
      !event.invoice.linesComplete ||
      event.invoice.lines.length !== 1 ||
      !event.periodStart ||
      !event.periodEnd ||
      event.periodEnd <= event.periodStart
    ) {
      throw new ConflictException({ code: "ADDON_TRIAL_PAYMENT_MISMATCH" });
    }
    const resolvedPrices = await this.prices.resolve();
    if (!isDeclaredCapacityAddonTrialReady(trial.module, resolvedPrices)) {
      throw new ConflictException({ code: "ADDON_TRIAL_PRICE_NOT_APPROVED" });
    }
    const priceCode = declaredCapacityAddonPriceCode(
      trial.module,
      intervalFromTrial(interval),
    );
    const expectedPrice = resolvedPrices[priceCode];
    const line = event.invoice.lines[0];
    if (
      !expectedPrice ||
      line?.priceId !== expectedPrice.priceId ||
      line.quantity !== 1 ||
      line.amountPence !== expectedPrice.unitAmountPence ||
      line.proration === true
    ) {
      throw new ConflictException({ code: "ADDON_TRIAL_PAYMENT_MISMATCH" });
    }

    await withInstitutionalOrgLock(trial.orgId, async (tx) => {
      const [currentTrial, org, currentSubscription, baseSubscription] =
        await Promise.all([
          tx.institutionalAddonTrial.findUnique({ where: { id: trial.id } }),
          tx.org.findUnique({
            where: { id: trial.orgId },
            select: { stripeCustomerId: true, isMasterOrg: true },
          }),
          tx.subscription.findUnique({
            where: { providerSubId: event.subscriptionId },
          }),
          tx.subscription.findFirst({
            where: {
              orgId: trial.orgId,
              status: SubscriptionStatus.ACTIVE,
              planCode: { not: { startsWith: "ADD_ON:" } },
              currentInstitutionalSnapshot: {
                pricingVersion: DECLARED_CAPACITY_PRICING_VERSION,
              },
            },
            select: { id: true },
          }),
        ]);
      if (
        !currentTrial ||
        !currentTrial.decisionActorUserId ||
        !currentTrial.decidedAt ||
        currentTrial.chosenPaidInterval !== interval ||
        (currentTrial.status !== InstitutionalAddonTrialStatus.EXPIRED &&
          currentTrial.status !== InstitutionalAddonTrialStatus.CONVERTED) ||
        !org ||
        org.isMasterOrg ||
        !baseSubscription ||
        !org.stripeCustomerId ||
        org.stripeCustomerId !== event.providerCustomerId ||
        (currentSubscription !== null &&
          currentSubscription.orgId !== trial.orgId)
      ) {
        throw new ConflictException({
          code: "ADDON_TRIAL_ORGANISATION_MISMATCH",
        });
      }
      if (
        currentSubscription?.periodStart &&
        currentSubscription.periodStart > event.periodStart!
      ) {
        return;
      }
      if (currentSubscription?.status === SubscriptionStatus.CANCELED) return;

      const subscription = await tx.subscription.upsert({
        where: { providerSubId: event.subscriptionId },
        update: {
          planCode: expectedPlanCode(trial.module),
          status: SubscriptionStatus.ACTIVE,
          periodStart: event.periodStart!,
          periodEnd: event.periodEnd!,
          cancelAtPeriodEnd: false,
        },
        create: {
          orgId: trial.orgId,
          provider: BillingProvider.STRIPE,
          providerSubId: event.subscriptionId,
          planCode: expectedPlanCode(trial.module),
          status: SubscriptionStatus.ACTIVE,
          periodStart: event.periodStart!,
          periodEnd: event.periodEnd!,
        },
      });
      if (
        currentTrial.status === InstitutionalAddonTrialStatus.CONVERTED &&
        currentTrial.paidSubscriptionId !== subscription.id
      ) {
        throw new ConflictException({ code: "ADDON_TRIAL_ALREADY_CONVERTED" });
      }
      const transition = await tx.institutionalAddonTrial.updateMany({
        where: {
          id: trial.id,
          orgId: trial.orgId,
          status: {
            in: [
              InstitutionalAddonTrialStatus.EXPIRED,
              InstitutionalAddonTrialStatus.CONVERTED,
            ],
          },
          decisionActorUserId: { not: null },
          paidSubscriptionId: currentTrial.paidSubscriptionId,
        },
        data: {
          status: InstitutionalAddonTrialStatus.CONVERTED,
          paidSubscriptionId: subscription.id,
        },
      });
      if (transition.count !== 1) {
        throw new ConflictException({ code: "ADDON_TRIAL_ALREADY_CONVERTED" });
      }
      await tx.moduleGrant.upsert({
        where: {
          orgId_module_source_sourceId: {
            orgId: trial.orgId,
            module: trial.module,
            source: ModuleGrantSource.PAID_ADDON,
            sourceId: event.subscriptionId,
          },
        },
        create: {
          orgId: trial.orgId,
          module: trial.module,
          source: ModuleGrantSource.PAID_ADDON,
          sourceId: event.subscriptionId,
          status: ModuleStatus.ACTIVE,
          expiresAt: event.periodEnd!,
        },
        update: { status: ModuleStatus.ACTIVE, expiresAt: event.periodEnd! },
      });
      await refreshEffectiveOrgModules(
        tx,
        trial.orgId,
        new Set([trial.module]),
      );
    });
  }

  private async applySubscriptionUpdate(
    event: ParsedBillingWebhookEvent,
    module: Module,
  ): Promise<void> {
    await withInstitutionalOrgLock(event.orgId, async (tx) => {
      const subscription = await tx.subscription.findUnique({
        where: { providerSubId: event.subscriptionId },
      });
      if (
        !subscription ||
        subscription.orgId !== event.orgId ||
        subscription.planCode !== expectedPlanCode(module)
      ) {
        throw new ConflictException({
          code: "ADDON_TRIAL_SUBSCRIPTION_UNKNOWN",
        });
      }
      if (event.periodStart && subscription.periodStart > event.periodStart) {
        return;
      }
      const nextStatus =
        event.kind === "subscription.canceled"
          ? SubscriptionStatus.CANCELED
          : (event.status ?? subscription.status);
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: nextStatus,
          ...(event.periodStart ? { periodStart: event.periodStart } : {}),
          ...(event.periodEnd ? { periodEnd: event.periodEnd } : {}),
          ...(event.cancelAtPeriodEnd !== null &&
          event.cancelAtPeriodEnd !== undefined
            ? { cancelAtPeriodEnd: event.cancelAtPeriodEnd }
            : {}),
        },
      });
      if (nextStatus === SubscriptionStatus.CANCELED) {
        await tx.moduleGrant.updateMany({
          where: {
            orgId: event.orgId,
            module,
            source: ModuleGrantSource.PAID_ADDON,
            sourceId: event.subscriptionId,
            status: ModuleStatus.ACTIVE,
          },
          data: { status: ModuleStatus.CANCELLED },
        });
        await refreshEffectiveOrgModules(tx, event.orgId, new Set([module]));
      } else if (event.periodEnd) {
        await tx.moduleGrant.updateMany({
          where: {
            orgId: event.orgId,
            module,
            source: ModuleGrantSource.PAID_ADDON,
            sourceId: event.subscriptionId,
            status: ModuleStatus.ACTIVE,
          },
          data: { expiresAt: event.periodEnd },
        });
        await refreshEffectiveOrgModules(tx, event.orgId, new Set([module]));
      }
    });
  }
}
