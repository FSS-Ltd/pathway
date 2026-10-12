import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import Stripe from "stripe";
import {
  applyTenantContext,
  Module,
  ModuleChangeStatus,
  ModuleGrantSource,
  ModuleStatus,
  OrgRole,
  Prisma,
  prisma,
  SubscriptionStatus,
  withOrgRlsContext,
} from "@pathway/db";
import {
  getConfiguratorPlanPolicy,
  isConfiguratorModuleReady,
} from "@pathway/pricing";
import {
  BILLING_PROVIDER_CONFIG,
  type BillingProviderConfig,
  type StripePriceMap,
} from "./billing-provider.config";
import {
  phasesForRenewal,
  scheduleModuleChange,
  scheduleSubscriptionCancellation,
  type ScheduledItem,
} from "./module-change-schedule";

export type ModuleChangeSelection = {
  planCode: string;
  includedModules: Module[];
  paidModules: Module[];
};

export type ModuleChangePreview = {
  id: string;
  planCode: string;
  includedModules: Module[];
  paidModules: Module[];
  subtotalPence: number;
  effectiveAt: string;
  expiresAt: string;
  status: ModuleChangeStatus;
};

type RetiredSource = {
  sourceId: string;
  modules: Module[];
  current: ScheduledItem[];
  next: ScheduledItem[];
  remainingSubtotalPence: number;
};

type ProviderItems = {
  current: ScheduledItem[];
  next: ScheduledItem[];
  retiredSources?: RetiredSource[];
};

function equalItems(left: ScheduledItem[], right: ScheduledItem[]): boolean {
  const sort = (items: ScheduledItem[]) =>
    [...items].sort(
      (a, b) => a.price.localeCompare(b.price) || a.quantity - b.quantity,
    );
  return JSON.stringify(sort(left)) === JSON.stringify(sort(right));
}

function parseProviderItems(value: unknown): ProviderItems {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ConflictException(
      "The saved module quote is invalid. Request a new preview.",
    );
  }
  const record = value as Record<string, unknown>;
  const valid = (items: unknown): items is ScheduledItem[] =>
    Array.isArray(items) &&
    items.every(
      (item) =>
        !!item &&
        typeof item === "object" &&
        typeof item.price === "string" &&
        Number.isSafeInteger(item.quantity) &&
        item.quantity > 0,
    );
  if (!valid(record.current) || !valid(record.next)) {
    throw new ConflictException(
      "The saved module quote is invalid. Request a new preview.",
    );
  }
  const retiredSources = record.retiredSources ?? [];
  if (
    !Array.isArray(retiredSources) ||
    !retiredSources.every(
      (source) =>
        source &&
        typeof source === "object" &&
        typeof source.sourceId === "string" &&
        Array.isArray(source.modules) &&
        source.modules.every(
          (module: unknown) =>
            typeof module === "string" &&
            Object.values(Module).includes(module as Module),
        ) &&
        valid(source.current) &&
        valid(source.next) &&
        Number.isSafeInteger(source.remainingSubtotalPence) &&
        source.remainingSubtotalPence >= 0,
    )
  ) {
    throw new ConflictException(
      "The saved module quote is invalid. Request a new preview.",
    );
  }
  return { current: record.current, next: record.next, retiredSources };
}

function subscriptionItems(subscription: Stripe.Subscription): ScheduledItem[] {
  return subscription.items.data.map((item) => ({
    price: item.price.id,
    quantity: item.quantity ?? 1,
  }));
}

function previewResponse(change: {
  id: string;
  planCode: string;
  includedModules: Module[];
  paidModules: Module[];
  subtotalPence: number;
  effectiveAt: Date;
  expiresAt: Date;
  status: ModuleChangeStatus;
}): ModuleChangePreview {
  return {
    id: change.id,
    planCode: change.planCode,
    includedModules: change.includedModules,
    paidModules: change.paidModules,
    subtotalPence: change.subtotalPence,
    effectiveAt: change.effectiveAt.toISOString(),
    expiresAt: change.expiresAt.toISOString(),
    status: change.status,
  };
}

@Injectable()
export class ModuleChangeService {
  private readonly stripe: Stripe | null;

  constructor(
    @Inject(BILLING_PROVIDER_CONFIG)
    private readonly config: BillingProviderConfig,
  ) {
    this.stripe = config.stripe.secretKey
      ? new Stripe(config.stripe.secretKey, { apiVersion: "2023-10-16" })
      : null;
  }

  private requireStripe(): Stripe {
    if (
      !this.stripe ||
      !["STRIPE", "STRIPE_TEST"].includes(this.config.activeProvider)
    ) {
      throw new ServiceUnavailableException(
        "Subscription changes are not available with this billing provider.",
      );
    }
    return this.stripe;
  }

  private write<T>(
    orgId: string,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return prisma.$transaction(async (tx) => {
      await applyTenantContext(tx, "", orgId);
      return operation(tx);
    });
  }

  async ensureOrgAdmin(orgId: string, userId: string): Promise<void> {
    const membership = await withOrgRlsContext(orgId, (tx) =>
      tx.orgMembership.findUnique({
        where: { orgId_userId: { orgId, userId } },
        select: { role: true },
      }),
    );
    if (membership?.role !== OrgRole.ORG_ADMIN) {
      throw new ForbiddenException(
        "Only organisation administrators can change billing modules.",
      );
    }
  }

  private validateSelection(selection: ModuleChangeSelection): void {
    const policy = getConfiguratorPlanPolicy(selection.planCode);
    if (!policy || policy.outcome !== "checkout") {
      throw new BadRequestException(
        "This plan is not available for self-service changes.",
      );
    }
    const included = new Set(selection.includedModules);
    const paid = new Set(selection.paidModules);
    if (
      included.size !== selection.includedModules.length ||
      paid.size !== selection.paidModules.length ||
      included.size > policy.includedModuleLimit ||
      [...included].some((module) => paid.has(module)) ||
      [...included, ...paid].some(
        (module) => !policy.eligibleOptionalModules.includes(module),
      )
    ) {
      throw new BadRequestException(
        "The selected modules do not fit this plan's allowance.",
      );
    }
  }

  private async priceFor(
    code: keyof StripePriceMap,
    interval: "month" | "year",
  ): Promise<Stripe.Price> {
    const id = this.config.stripe.priceMap?.[code];
    if (!id)
      throw new BadRequestException(`A price is not configured for ${code}.`);
    const price = await this.requireStripe().prices.retrieve(id);
    if (
      !price.active ||
      price.currency !== "gbp" ||
      price.recurring?.interval !== interval ||
      price.recurring.interval_count !== 1 ||
      price.unit_amount === null
    ) {
      throw new BadRequestException(
        `The price for ${code} is not available for this billing interval.`,
      );
    }
    return price;
  }

  async preview(
    orgId: string,
    selection: ModuleChangeSelection,
  ): Promise<ModuleChangePreview> {
    this.validateSelection(selection);
    const stripe = this.requireStripe();
    const active = await withOrgRlsContext(orgId, (tx) =>
      tx.subscription.findFirst({
        where: {
          orgId,
          status: SubscriptionStatus.ACTIVE,
          planCode: { not: { startsWith: "ADD_ON:" } },
        },
        orderBy: { createdAt: "desc" },
      }),
    );
    if (!active || active.providerSubId === "") {
      throw new BadRequestException(
        "An active subscription is required for renewal changes.",
      );
    }
    const currentGrants = await withOrgRlsContext(orgId, (tx) =>
      tx.moduleGrant.findMany({
        where: { orgId, status: ModuleStatus.ACTIVE },
        select: { module: true, source: true, sourceId: true, expiresAt: true },
      }),
    );
    const now = new Date();
    const existingModules = new Set(
      currentGrants
        .filter((grant) => !grant.expiresAt || grant.expiresAt > now)
        .map((grant) => grant.module),
    );
    if (
      [...selection.includedModules, ...selection.paidModules].some(
        (module) =>
          !existingModules.has(module) && !isConfiguratorModuleReady(module),
      )
    ) {
      throw new BadRequestException("Selected modules are not yet available.");
    }
    const subscription = await stripe.subscriptions.retrieve(
      active.providerSubId,
    );
    if (subscription.status !== "active" || subscription.cancel_at_period_end) {
      throw new ConflictException(
        "This subscription cannot accept a renewal change.",
      );
    }
    const effectiveAt = new Date(subscription.current_period_end * 1000);
    if (effectiveAt <= new Date()) {
      throw new ConflictException(
        "The renewal date has passed. Please refresh billing and try again.",
      );
    }
    const interval = selection.planCode.endsWith("_YEARLY") ? "year" : "month";
    const suffix = interval === "year" ? "YEARLY" : "MONTHLY";
    const basePrice = await this.priceFor(
      selection.planCode as keyof StripePriceMap,
      interval,
    );
    const modulePrices = await Promise.all(
      selection.paidModules.map((module) =>
        this.priceFor(
          `MODULE_${module}_${suffix}` as keyof StripePriceMap,
          interval,
        ),
      ),
    );
    const priceMap = this.config.stripe.priceMap ?? {};
    const knownModulePrices = new Set(
      Object.entries(priceMap)
        .filter(([code]) => code.startsWith("MODULE_"))
        .map(([, id]) => id),
    );
    const knownBasePrices = new Set(
      Object.entries(priceMap)
        .filter(([code]) => /^(STARTER|GROWTH|PROFESSIONAL)_/.test(code))
        .map(([, id]) => id),
    );
    const current = subscriptionItems(subscription);
    const currentBase = current.filter((item) =>
      knownBasePrices.has(item.price),
    );
    if (currentBase.length !== 1) {
      throw new ConflictException(
        "The subscription's base plan needs billing review before changes.",
      );
    }
    const preserved = current.filter(
      (item) =>
        !knownBasePrices.has(item.price) && !knownModulePrices.has(item.price),
    );
    const retiredSourceIds = [
      ...new Set(
        currentGrants
          .filter(
            (grant) =>
              grant.source === ModuleGrantSource.PAID_ADDON &&
              grant.sourceId !== active.providerSubId &&
              (!grant.expiresAt || grant.expiresAt > now),
          )
          .map((grant) => grant.sourceId),
      ),
    ];
    const retiredSources = await Promise.all(
      retiredSourceIds.map(async (sourceId): Promise<RetiredSource> => {
        const source = await stripe.subscriptions.retrieve(sourceId);
        if (
          source.status !== "active" ||
          source.current_period_end < subscription.current_period_end
        ) {
          throw new ConflictException(
            "An existing add-on renews before this plan. Billing review is required.",
          );
        }
        const modules = currentGrants
          .filter(
            (grant) =>
              grant.source === ModuleGrantSource.PAID_ADDON &&
              grant.sourceId === sourceId,
          )
          .map((grant) => grant.module);
        const pricesToRemove = new Set(
          modules.flatMap((module) =>
            [
              priceMap[`MODULE_${module}_MONTHLY` as keyof StripePriceMap],
              priceMap[`MODULE_${module}_YEARLY` as keyof StripePriceMap],
            ].filter((price): price is string => typeof price === "string"),
          ),
        );
        const sourceCurrent = subscriptionItems(source);
        const sourceNext = sourceCurrent.filter(
          (item) => !pricesToRemove.has(item.price),
        );
        if (sourceNext.length === sourceCurrent.length) {
          throw new ConflictException(
            "An existing add-on price needs billing review before changes.",
          );
        }
        let remainingSubtotalPence = 0;
        for (const item of source.items.data.filter((row) =>
          sourceNext.some((nextItem) => nextItem.price === row.price.id),
        )) {
          if (item.price.unit_amount === null) {
            throw new ConflictException(
              "An existing add-on price needs billing review before changes.",
            );
          }
          remainingSubtotalPence +=
            item.price.unit_amount * (item.quantity ?? 1);
        }
        return {
          sourceId,
          modules,
          current: sourceCurrent,
          next: sourceNext,
          remainingSubtotalPence,
        };
      }),
    );
    const next: ScheduledItem[] = [
      { price: basePrice.id, quantity: 1 },
      ...preserved,
      ...modulePrices.map((price) => ({ price: price.id, quantity: 1 })),
    ];
    if (subscription.schedule) {
      const scheduleId =
        typeof subscription.schedule === "string"
          ? subscription.schedule
          : subscription.schedule.id;
      const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
      try {
        phasesForRenewal(
          schedule,
          subscription.current_period_end,
          next,
          selection.planCode,
        );
      } catch {
        throw new ConflictException(
          "An existing subscription schedule needs billing review before this change.",
        );
      }
    }
    if (
      equalItems(current, next) &&
      retiredSources.length === 0 &&
      selection.planCode === active.planCode
    ) {
      const grants = await withOrgRlsContext(orgId, (tx) =>
        tx.moduleGrant.findMany({
          where: {
            orgId,
            sourceId: active.providerSubId,
            status: ModuleStatus.ACTIVE,
          },
          select: { module: true, source: true },
        }),
      );
      const currentIncluded = grants
        .filter((grant) => grant.source === ModuleGrantSource.PLAN)
        .map((grant) => grant.module);
      const currentPaid = grants
        .filter((grant) => grant.source === ModuleGrantSource.PAID_ADDON)
        .map((grant) => grant.module);
      if (
        equalModuleSets(currentIncluded, selection.includedModules) &&
        equalModuleSets(currentPaid, selection.paidModules)
      ) {
        throw new BadRequestException("There are no changes to schedule.");
      }
    }
    const existing = await withOrgRlsContext(orgId, (tx) =>
      tx.moduleChange.findFirst({
        where: {
          orgId,
          providerSubId: active.providerSubId,
          effectiveAt,
          status: {
            in: [ModuleChangeStatus.ACCEPTED, ModuleChangeStatus.SCHEDULED],
          },
        },
        select: { id: true },
      }),
    );
    if (existing)
      throw new ConflictException(
        "A change is already scheduled for this renewal.",
      );
    let subtotalPence =
      basePrice.unit_amount! +
      modulePrices.reduce((sum, price) => sum + price.unit_amount!, 0);
    for (const item of preserved) {
      const price = subscription.items.data.find(
        (row) => row.price.id === item.price,
      )?.price;
      if (price?.unit_amount === null || price?.unit_amount === undefined) {
        throw new ConflictException(
          "The subscription has a price that needs billing review.",
        );
      }
      subtotalPence += price.unit_amount * item.quantity;
    }
    subtotalPence += retiredSources.reduce(
      (sum, source) => sum + source.remainingSubtotalPence,
      0,
    );
    const change = await this.write(orgId, (tx) =>
      tx.moduleChange.create({
        data: {
          orgId,
          providerSubId: active.providerSubId,
          planCode: selection.planCode,
          includedModules: selection.includedModules,
          paidModules: selection.paidModules,
          providerItems: { current, next, retiredSources },
          subtotalPence,
          effectiveAt,
          expiresAt: new Date(Date.now() + 15 * 60_000),
        },
      }),
    );
    return previewResponse(change);
  }

  async accept(
    orgId: string,
    changeId: string,
    idempotencyKey: string,
  ): Promise<ModuleChangePreview> {
    const stripe = this.requireStripe();
    const change = await withOrgRlsContext(orgId, (tx) =>
      tx.moduleChange.findFirst({ where: { id: changeId, orgId } }),
    );
    if (!change) throw new BadRequestException("Module preview not found.");
    if (change.idempotencyKey && change.idempotencyKey !== idempotencyKey) {
      throw new ConflictException(
        "This change was accepted with a different request key.",
      );
    }
    if (change.status === ModuleChangeStatus.SCHEDULED)
      return previewResponse(change);
    if (
      change.status !== ModuleChangeStatus.PREVIEW &&
      change.status !== ModuleChangeStatus.ACCEPTED
    ) {
      throw new ConflictException("This module change cannot be accepted.");
    }
    if (
      change.expiresAt <= new Date() &&
      change.status === ModuleChangeStatus.PREVIEW
    ) {
      throw new ConflictException(
        "This preview has expired. Request a new preview.",
      );
    }
    const items = parseProviderItems(change.providerItems);
    const subscription = await stripe.subscriptions.retrieve(
      change.providerSubId,
    );
    if (
      subscription.current_period_end * 1000 !== change.effectiveAt.getTime() ||
      !equalItems(subscriptionItems(subscription), items.current)
    ) {
      throw new ConflictException(
        "The subscription changed. Request a new preview.",
      );
    }
    for (const source of items.retiredSources ?? []) {
      const currentSource = await stripe.subscriptions.retrieve(
        source.sourceId,
      );
      if (!equalItems(subscriptionItems(currentSource), source.current)) {
        throw new ConflictException(
          "An add-on subscription changed. Request a new preview.",
        );
      }
    }
    if (change.status === ModuleChangeStatus.PREVIEW) {
      let claimed: { count: number };
      try {
        claimed = await this.write(orgId, (tx) =>
          tx.moduleChange.updateMany({
            where: { id: change.id, orgId, status: ModuleChangeStatus.PREVIEW },
            data: {
              status: ModuleChangeStatus.ACCEPTED,
              acceptedAt: new Date(),
              idempotencyKey,
            },
          }),
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new ConflictException(
            "Another change is already scheduled for this renewal.",
          );
        }
        throw error;
      }
      if (claimed.count !== 1) {
        throw new ConflictException(
          "This change is being accepted. Please refresh its status.",
        );
      }
    }
    for (const source of items.retiredSources ?? []) {
      if (source.next.length > 0) {
        await scheduleModuleChange(
          stripe,
          source.sourceId,
          change.effectiveAt,
          source.next,
          `${change.id}:${source.sourceId}`,
          `ADD_ON:${change.planCode}`,
        );
      } else {
        await scheduleSubscriptionCancellation(
          stripe,
          source.sourceId,
          change.effectiveAt,
          `${change.id}:${source.sourceId}`,
        );
      }
    }
    const scheduleId = await scheduleModuleChange(
      stripe,
      change.providerSubId,
      change.effectiveAt,
      items.next,
      change.id,
      change.planCode,
    );
    const scheduled = await this.write(orgId, (tx) =>
      tx.moduleChange.update({
        where: { id: change.id },
        data: {
          status: ModuleChangeStatus.SCHEDULED,
          providerScheduleId: scheduleId,
        },
      }),
    );
    return previewResponse(scheduled);
  }

  async get(orgId: string, changeId: string): Promise<ModuleChangePreview> {
    const change = await withOrgRlsContext(orgId, (tx) =>
      tx.moduleChange.findFirst({ where: { id: changeId, orgId } }),
    );
    if (!change) throw new BadRequestException("Module change not found.");
    return previewResponse(change);
  }
}

function equalModuleSets(
  left: readonly Module[],
  right: readonly Module[],
): boolean {
  return (
    left.length === right.length &&
    left.every((module) => right.includes(module))
  );
}
