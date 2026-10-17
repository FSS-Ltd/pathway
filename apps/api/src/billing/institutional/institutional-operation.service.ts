import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  InstitutionalBillingOperationKind,
  InstitutionalBillingOperationStatus,
  InstitutionalSnapshotStatus,
  prisma,
  withOrgRlsContext,
} from "@pathway/db";
import Stripe from "stripe";
import {
  BILLING_PROVIDER_CONFIG,
  type BillingProviderConfig,
} from "../billing-provider.config";
import { InstitutionalCensusService } from "./institutional-census.service";
import { withInstitutionalOrgLock } from "./institutional-quote.service";
import { stripeItemsForSnapshot } from "./institutional-stripe-line-items";
import { scheduleInstitutionalRenewal } from "./institutional-subscription-schedule";
import { institutionalStripeKey } from "./institutional-provider-guard";
import { validateFrozenStripePrice } from "./institutional-frozen-stripe-price";
import { isDeclaredCapacityVatEnabled } from "./declared-capacity-gate";
import {
  DECLARED_CAPACITY_PRICING_VERSION,
  INSTITUTIONAL_MAPPED_PRICING_VERSION,
} from "@pathway/pricing";

@Injectable()
export class InstitutionalOperationService {
  constructor(
    @Inject(InstitutionalCensusService)
    private readonly census: InstitutionalCensusService,
    @Inject(BILLING_PROVIDER_CONFIG)
    private readonly config: BillingProviderConfig,
  ) {}

  private stripe(): Stripe {
    return new Stripe(institutionalStripeKey(this.config, "PROVIDER_WRITES"), {
      apiVersion: "2023-10-16",
    });
  }

  async execute(operationId: string): Promise<void> {
    const operation = await prisma.institutionalBillingOperation.findUnique({
      where: { id: operationId },
      select: {
        id: true,
        orgId: true,
        kind: true,
        status: true,
        subscriptionId: true,
        snapshotId: true,
        idempotencyKey: true,
      },
    });
    if (!operation) throw new NotFoundException("Billing operation not found.");
    if (operation.status === InstitutionalBillingOperationStatus.COMPLETED)
      return;
    if (operation.status !== InstitutionalBillingOperationStatus.CLAIMED) {
      throw new ConflictException({ code: "BILLING_OPERATION_NOT_CLAIMED" });
    }
    if (!operation.subscriptionId) {
      throw new ConflictException({ code: "SUBSCRIPTION_REQUIRED" });
    }
    if (operation.kind === InstitutionalBillingOperationKind.CENSUS_FREEZE) {
      const subscription = await withOrgRlsContext(operation.orgId, (tx) =>
        tx.subscription.findFirst({
          where: { id: operation.subscriptionId ?? "", orgId: operation.orgId },
          select: { periodEnd: true },
        }),
      );
      if (
        !subscription ||
        operation.idempotencyKey !==
          `census-freeze:${operation.subscriptionId}:${subscription.periodEnd.toISOString()}`
      ) {
        throw new ConflictException({ code: "CENSUS_PERIOD_CHANGED" });
      }
      const result = await this.census.freezeNext(operation.subscriptionId);
      if (result.kind === "not_due") {
        throw new ConflictException({ code: "CENSUS_NOT_DUE" });
      }
      if (result.snapshot.status !== InstitutionalSnapshotStatus.PRICED) {
        throw new ConflictException({ code: "CENSUS_REVIEW_REQUIRED" });
      }
      await withInstitutionalOrgLock(operation.orgId, async (tx) => {
        for (const item of [
          {
            kind: InstitutionalBillingOperationKind.PROVIDER_SCHEDULE,
            key: `provider-schedule:${result.snapshot.id}`,
            dueAt: new Date(),
          },
          {
            kind: InstitutionalBillingOperationKind.RENEWAL_RECONCILE,
            key: `renewal-reconcile:${result.snapshot.id}`,
            dueAt: new Date(
              (result.snapshot.effectiveAt?.getTime() ?? 0) + 60 * 60_000,
            ),
          },
        ]) {
          await tx.institutionalBillingOperation.upsert({
            where: {
              orgId_idempotencyKey: {
                orgId: operation.orgId,
                idempotencyKey: item.key,
              },
            },
            create: {
              orgId: operation.orgId,
              subscriptionId: operation.subscriptionId,
              snapshotId: result.snapshot.id,
              kind: item.kind,
              idempotencyKey: item.key,
              dueAt: item.dueAt,
            },
            update: {},
          });
        }
      });
      return;
    }
    if (
      operation.kind === InstitutionalBillingOperationKind.RENEWAL_RECONCILE
    ) {
      if (!operation.snapshotId)
        throw new ConflictException({ code: "SNAPSHOT_REQUIRED" });
      const subscription = await withOrgRlsContext(operation.orgId, (tx) =>
        tx.subscription.findFirst({
          where: { id: operation.subscriptionId ?? "", orgId: operation.orgId },
          select: { currentInstitutionalSnapshotId: true, periodEnd: true },
        }),
      );
      if (!subscription) throw new NotFoundException("Subscription not found.");
      if (subscription.currentInstitutionalSnapshotId === operation.snapshotId)
        return;
      const snapshot = await withOrgRlsContext(operation.orgId, (tx) =>
        tx.institutionalBillingSnapshot.findFirst({
          where: { id: operation.snapshotId ?? "", orgId: operation.orgId },
          select: { effectiveAt: true },
        }),
      );
      if (
        !snapshot?.effectiveAt ||
        subscription.periodEnd > snapshot.effectiveAt
      ) {
        throw new ConflictException({
          code: "RENEWAL_PAYMENT_REVIEW_REQUIRED",
        });
      }
      throw new ServiceUnavailableException({
        code: "RENEWAL_PAYMENT_PENDING",
      });
      return;
    }
    if (
      operation.kind === InstitutionalBillingOperationKind.PROVIDER_SCHEDULE
    ) {
      if (!operation.snapshotId) {
        throw new ConflictException({ code: "SNAPSHOT_REQUIRED" });
      }
      await this.schedule(operation, operation.snapshotId);
    }
  }

  private async schedule(
    operation: { id: string; orgId: string; subscriptionId: string | null },
    snapshotId: string,
  ): Promise<void> {
    const stripe = this.stripe();
    const details = await withOrgRlsContext(operation.orgId, async (tx) => {
      const subscription = await tx.subscription.findFirst({
        where: { id: operation.subscriptionId ?? "", orgId: operation.orgId },
        include: { currentInstitutionalSnapshot: true },
      });
      const snapshot = await tx.institutionalBillingSnapshot.findFirst({
        where: { id: snapshotId, orgId: operation.orgId },
      });
      return { subscription, snapshot };
    });
    const { subscription, snapshot } = details;
    if (
      !subscription ||
      !snapshot ||
      snapshot.subscriptionId !== subscription.id ||
      snapshot.status !== InstitutionalSnapshotStatus.PRICED ||
      !snapshot.effectiveAt
    ) {
      throw new ConflictException({ code: "RENEWAL_REVIEW_REQUIRED" });
    }
    if (subscription.nextInstitutionalSnapshotId !== snapshot.id) return;
    await withInstitutionalOrgLock(operation.orgId, async (tx) => {
      await tx.institutionalBillingOperation.update({
        where: { id: operation.id },
        data: {
          providerIdempotencyKey: `institutional-schedule-update:${snapshot.id}`,
        },
      });
    });
    const mapped = stripeItemsForSnapshot(
      snapshot,
      this.config.stripe.priceMap ?? {},
    );
    if (
      snapshot.pricingVersion === INSTITUTIONAL_MAPPED_PRICING_VERSION ||
      snapshot.pricingVersion === DECLARED_CAPACITY_PRICING_VERSION
    ) {
      for (const item of mapped) {
        try {
          validateFrozenStripePrice(
            await stripe.prices.retrieve(item.price),
            snapshot,
            item.price,
            this.config.activeProvider === "STRIPE",
            isDeclaredCapacityVatEnabled(),
          );
        } catch {
          throw new ConflictException({
            code: "RENEWAL_PRICE_REVIEW_REQUIRED",
          });
        }
      }
    }
    if (!subscription.currentInstitutionalSnapshot) {
      throw new ConflictException({ code: "CURRENT_SNAPSHOT_REQUIRED" });
    }
    const currentItems = stripeItemsForSnapshot(
      subscription.currentInstitutionalSnapshot,
      this.config.stripe.priceMap ?? {},
    );
    const providerSub = await stripe.subscriptions.retrieve(
      subscription.providerSubId,
    );
    const currentPrices = new Set(currentItems.map((item) => item.price));
    for (const item of currentItems) {
      const providerItem = providerSub.items.data.find(
        (entry) => entry.price.id === item.price,
      );
      if (!providerItem || providerItem.quantity !== item.quantity) {
        throw new ConflictException({ code: "PROVIDER_ITEMS_CHANGED" });
      }
    }
    const unrelatedItems = providerSub.items.data
      .filter((item) => !currentPrices.has(item.price.id))
      .map((item) => ({ price: item.price.id, quantity: item.quantity ?? 1 }));
    const scheduleId = await scheduleInstitutionalRenewal(
      stripe,
      subscription.providerSubId,
      snapshot.effectiveAt,
      [...unrelatedItems, ...mapped],
      snapshot.id,
      snapshot.planCode,
    );
    await withInstitutionalOrgLock(operation.orgId, async (tx) => {
      await tx.institutionalBillingOperation.update({
        where: { id: operation.id },
        data: { providerReference: scheduleId },
      });
    });
  }
}
