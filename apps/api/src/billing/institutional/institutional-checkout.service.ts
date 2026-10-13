import {
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  BillingProvider,
  InstitutionalCountSource,
  InstitutionalSnapshotKind,
  InstitutionalSnapshotStatus,
  PendingOrderStatus,
  SubscriptionStatus,
  type Prisma,
} from "@pathway/db";
import {
  INSTITUTIONAL_PLANS,
  INSTITUTIONAL_MAPPED_PRICING_VERSION,
  INSTITUTIONAL_PRICING_VERSION,
  isMappedInstitutionalPlanCode,
  mappedInstitutionalSelectionPlanCode,
} from "@pathway/pricing";
import Stripe from "stripe";
import { EnrolmentRollService } from "../../enrolments/enrolment-roll.service";
import {
  BILLING_PROVIDER_CONFIG,
  type BillingProviderConfig,
} from "../billing-provider.config";
import { withInstitutionalOrgLock } from "./institutional-quote.service";
import {
  isInstitutionalPlanCode,
  validateInstitutionalSelection,
} from "./institutional-selection";
import { stripeItemsForSnapshot } from "./institutional-stripe-line-items";
import {
  INSTITUTIONAL_STRIPE_PRICE_SPECS,
  validateInstitutionalStripePrice,
} from "./institutional-stripe-prices";
import { localDateAt } from "./institutional-time";
import { institutionalStripeKey } from "./institutional-provider-guard";
import { validateFrozenStripePrice } from "./institutional-frozen-stripe-price";

@Injectable()
export class InstitutionalCheckoutService {
  constructor(
    @Inject(BILLING_PROVIDER_CONFIG)
    private readonly config: BillingProviderConfig,
    @Inject(EnrolmentRollService) private readonly roll: EnrolmentRollService,
  ) {}

  private stripe(): Stripe {
    return new Stripe(institutionalStripeKey(this.config, "CHECKOUT"), {
      apiVersion: "2023-10-16",
    });
  }

  private async assertCurrentQuote(
    tx: Prisma.TransactionClient,
    orgId: string,
    snapshotId: string,
    now: Date,
  ) {
    const snapshot = await tx.institutionalBillingSnapshot.findFirst({
      where: { id: snapshotId, orgId, kind: InstitutionalSnapshotKind.QUOTE },
      include: { acceptance: true, policy: true },
    });
    if (
      !snapshot ||
      !snapshot.acceptance ||
      snapshot.status !== InstitutionalSnapshotStatus.PRICED ||
      !snapshot.expiresAt ||
      snapshot.expiresAt <= now ||
      (snapshot.pricingVersion !== INSTITUTIONAL_PRICING_VERSION &&
        snapshot.pricingVersion !== INSTITUTIONAL_MAPPED_PRICING_VERSION) ||
      (snapshot.pricingVersion === INSTITUTIONAL_PRICING_VERSION &&
        snapshot.policy.pricingVersion !== snapshot.pricingVersion) ||
      (!isInstitutionalPlanCode(snapshot.planCode) &&
        !isMappedInstitutionalPlanCode(snapshot.planCode))
    ) {
      throw new ConflictException({ code: "QUOTE_CHANGED" });
    }
    const superseding = await tx.institutionalBillingSnapshot.findFirst({
      where: { orgId, supersedesId: snapshotId },
      select: { id: true },
    });
    if (superseding) throw new ConflictException({ code: "QUOTE_CHANGED" });
    const selectionPlan = isInstitutionalPlanCode(snapshot.planCode)
      ? snapshot.planCode
      : mappedInstitutionalSelectionPlanCode(snapshot.planCode);
    validateInstitutionalSelection(selectionPlan, {
      includedModules: snapshot.includedModules,
      paidModules: snapshot.paidModules,
    });
    if (snapshot.countSource === InstitutionalCountSource.DECLARED) {
      const confirmation = await tx.enrolmentRollConfirmation.findFirst({
        where: { orgId },
        select: { id: true },
      });
      if (
        confirmation ||
        snapshot.policy.declaredChildren !== snapshot.enrolledChildren
      ) {
        throw new ConflictException({ code: "QUOTE_CHANGED" });
      }
    } else if (snapshot.countSource === InstitutionalCountSource.VERIFIED) {
      const confirmation = await tx.enrolmentRollConfirmation.findFirst({
        where: { orgId },
        orderBy: [{ revisionCutoff: "desc" }, { id: "desc" }],
        select: { id: true, revisionCutoff: true },
      });
      if (!confirmation || confirmation.id !== snapshot.sourceConfirmationId) {
        throw new ConflictException({ code: "QUOTE_CHANGED" });
      }
      const current = await this.roll.roll(
        orgId,
        localDateAt(now, snapshot.policy.timezone),
        confirmation.revisionCutoff,
      );
      if (current.enrolledCount !== snapshot.enrolledChildren) {
        throw new ConflictException({ code: "QUOTE_CHANGED" });
      }
    } else {
      throw new ConflictException({ code: "QUOTE_CHANGED" });
    }
    return snapshot;
  }

  async checkout(orgId: string, snapshotId: string, idempotencyKey: string) {
    const stripe = this.stripe();
    const priceMap = this.config.stripe.priceMap ?? {};
    const now = new Date();
    const prepared = await withInstitutionalOrgLock(orgId, async (tx) => {
      const existing = await tx.pendingOrder.findUnique({
        where: {
          orgId_institutionalCheckoutKey: {
            orgId,
            institutionalCheckoutKey: idempotencyKey,
          },
        },
      });
      if (existing) {
        if (
          existing.institutionalSnapshotId !== snapshotId ||
          existing.status !== PendingOrderStatus.PENDING
        ) {
          throw new ConflictException({ code: "IDEMPOTENCY_CONFLICT" });
        }
        const snapshot = await this.assertCurrentQuote(
          tx,
          orgId,
          snapshotId,
          now,
        );
        return { order: existing, snapshot };
      }
      const snapshot = await this.assertCurrentQuote(
        tx,
        orgId,
        snapshotId,
        now,
      );
      const active = await tx.subscription.findFirst({
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
        select: { id: true },
      });
      if (active)
        throw new ConflictException({ code: "SUBSCRIPTION_ALREADY_EXISTS" });
      const tenant = await tx.tenant.findFirst({
        where: { orgId },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (!tenant)
        throw new ConflictException({ code: "ORGANISATION_SITE_REQUIRED" });
      if (
        !isInstitutionalPlanCode(snapshot.planCode) &&
        !isMappedInstitutionalPlanCode(snapshot.planCode)
      ) {
        throw new ConflictException({ code: "QUOTE_CHANGED" });
      }
      const plan =
        INSTITUTIONAL_PLANS[
          isInstitutionalPlanCode(snapshot.planCode)
            ? snapshot.planCode
            : mappedInstitutionalSelectionPlanCode(snapshot.planCode)
        ];
      const order = await tx.pendingOrder.create({
        data: {
          orgId,
          tenantId: tenant.id,
          planCode: snapshot.planCode,
          maxSites: plan.includedSites,
          selectedModules: [
            ...snapshot.includedModules,
            ...snapshot.paidModules,
          ],
          flags: {
            purchaseKind: "institutional",
            moduleSelection: {
              includedModules: snapshot.includedModules,
              paidModules: snapshot.paidModules,
            },
          },
          provider: BillingProvider.STRIPE,
          institutionalSnapshotId: snapshot.id,
          institutionalCheckoutKey: idempotencyKey,
        },
      });
      return { order, snapshot };
    });
    const { order, snapshot } = prepared;
    if (order.providerCheckoutId) {
      const session = await stripe.checkout.sessions.retrieve(
        order.providerCheckoutId,
      );
      if (session.url && session.status === "open")
        return { checkoutUrl: session.url, pendingOrderId: order.id };
      throw new ConflictException({ code: "CHECKOUT_EXPIRED" });
    }
    const adminUrl = process.env.ADMIN_URL?.trim();
    const mappedCheckout =
      snapshot.pricingVersion === INSTITUTIONAL_MAPPED_PRICING_VERSION;
    let adminOrigin: URL | null = null;
    if (mappedCheckout) {
      try {
        adminOrigin = new URL(adminUrl ?? "");
        if (
          adminOrigin.protocol !== "https:" &&
          !(
            adminOrigin.protocol === "http:" &&
            adminOrigin.hostname === "localhost"
          )
        )
          throw new Error("Invalid admin checkout return URL");
      } catch {
        throw new ServiceUnavailableException({
          code: "CHECKOUT_URLS_MISSING",
        });
      }
    }
    const successUrl = adminOrigin
      ? new URL(
          "/billing/institutional?checkout=pending",
          adminOrigin,
        ).toString()
      : this.config.stripe.successUrlDefault;
    const cancelUrl = adminOrigin
      ? new URL(
          "/billing/institutional?checkout=cancelled",
          adminOrigin,
        ).toString()
      : this.config.stripe.cancelUrlDefault;
    if (!successUrl || !cancelUrl) {
      throw new ServiceUnavailableException({ code: "CHECKOUT_URLS_MISSING" });
    }
    let lineItems: ReturnType<typeof stripeItemsForSnapshot>;
    try {
      lineItems = stripeItemsForSnapshot(snapshot, priceMap);
    } catch {
      throw new ServiceUnavailableException({ code: "PRICE_NOT_CONFIGURED" });
    }
    for (const item of lineItems) {
      try {
        const providerPrice = await stripe.prices.retrieve(item.price);
        if (snapshot.pricingVersion === INSTITUTIONAL_MAPPED_PRICING_VERSION) {
          validateFrozenStripePrice(
            providerPrice,
            snapshot,
            item.price,
            this.config.activeProvider === "STRIPE",
          );
        } else {
          const spec = INSTITUTIONAL_STRIPE_PRICE_SPECS.find(
            (entry) => priceMap[entry.code] === item.price,
          );
          if (!spec) throw new Error("PRICE_NOT_CONFIGURED");
          const productId =
            typeof providerPrice.product === "string"
              ? providerPrice.product
              : providerPrice.product.id;
          validateInstitutionalStripePrice(providerPrice, productId, spec);
        }
      } catch {
        throw new ServiceUnavailableException({ code: "PRICE_NOT_CONFIGURED" });
      }
    }
    const metadata = {
      pendingOrderId: order.id,
      institutionalSnapshotId: snapshot.id,
      orgId,
      tenantId: order.tenantId ?? "",
      planCode: snapshot.planCode,
    };
    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        success_url: successUrl,
        cancel_url: cancelUrl,
        line_items: lineItems,
        metadata,
        subscription_data: { metadata },
      },
      { idempotencyKey: `institutional-checkout:${order.id}` },
    );
    if (!session.url)
      throw new ServiceUnavailableException({ code: "CHECKOUT_URL_MISSING" });
    await withInstitutionalOrgLock(orgId, async (tx) => {
      await tx.pendingOrder.update({
        where: { id: order.id },
        data: { providerCheckoutId: session.id },
      });
    });
    return { checkoutUrl: session.url, pendingOrderId: order.id };
  }
}
