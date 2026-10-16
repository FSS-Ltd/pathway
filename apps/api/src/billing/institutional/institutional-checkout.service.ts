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
  calculateDeclaredCapacityQuote,
  declaredCapacityIntervalFromPlanCode,
  declaredCapacityPlanCode,
  DECLARED_CAPACITY_PRICING_VERSION,
  isDeclaredCapacityPlanCode,
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
import {
  assertDeclaredCapacityBillingEnabled,
  assertDeclaredCapacityTaxRegistration,
  declaredCapacityCheckoutTaxOptions,
} from "./declared-capacity-gate";

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
    if (snapshot?.pricingVersion === DECLARED_CAPACITY_PRICING_VERSION) {
      assertDeclaredCapacityBillingEnabled();
      const org = await tx.org.findUnique({
        where: { id: orgId },
        select: { isMasterOrg: true },
      });
      if (org?.isMasterOrg) {
        throw new ConflictException({ code: "MASTER_ORG_EXEMPT" });
      }
    }
    if (
      !snapshot ||
      !snapshot.acceptance ||
      snapshot.status !== InstitutionalSnapshotStatus.PRICED ||
      !snapshot.expiresAt ||
      snapshot.expiresAt <= now ||
      (snapshot.pricingVersion !== INSTITUTIONAL_PRICING_VERSION &&
        snapshot.pricingVersion !== INSTITUTIONAL_MAPPED_PRICING_VERSION &&
        snapshot.pricingVersion !== DECLARED_CAPACITY_PRICING_VERSION) ||
      (snapshot.pricingVersion === INSTITUTIONAL_PRICING_VERSION &&
        snapshot.policy.pricingVersion !== snapshot.pricingVersion) ||
      (snapshot.pricingVersion === DECLARED_CAPACITY_PRICING_VERSION &&
        (snapshot.policy.pricingVersion !== DECLARED_CAPACITY_PRICING_VERSION ||
          snapshot.countSource !== null ||
          snapshot.declaredCapacity === null ||
          !isDeclaredCapacityPlanCode(snapshot.planCode))) ||
      (snapshot.pricingVersion !== DECLARED_CAPACITY_PRICING_VERSION &&
        !isInstitutionalPlanCode(snapshot.planCode) &&
        !isMappedInstitutionalPlanCode(snapshot.planCode))
    ) {
      throw new ConflictException({ code: "QUOTE_CHANGED" });
    }
    const superseding = await tx.institutionalBillingSnapshot.findFirst({
      where: { orgId, supersedesId: snapshotId },
      select: { id: true },
    });
    if (superseding) throw new ConflictException({ code: "QUOTE_CHANGED" });
    if (snapshot.pricingVersion === DECLARED_CAPACITY_PRICING_VERSION) {
      if (!isDeclaredCapacityPlanCode(snapshot.planCode)) {
        throw new ConflictException({ code: "QUOTE_CHANGED" });
      }
      try {
        stripeItemsForSnapshot(snapshot, {});
      } catch {
        throw new ConflictException({ code: "QUOTE_CHANGED" });
      }
      const interval = declaredCapacityIntervalFromPlanCode(snapshot.planCode);
      if (snapshot.declaredCapacity === null) {
        throw new ConflictException({ code: "QUOTE_CHANGED" });
      }
      const quote = calculateDeclaredCapacityQuote({
        declaredCapacity: snapshot.declaredCapacity,
        interval,
      });
      if (
        quote.kind !== "priced" ||
        declaredCapacityPlanCode(quote.tier, interval) !== snapshot.planCode ||
        snapshot.policy.declaredCapacity !== null
      ) {
        throw new ConflictException({ code: "QUOTE_CHANGED" });
      }
    } else {
      const selectionPlan = isInstitutionalPlanCode(snapshot.planCode)
        ? snapshot.planCode
        : isMappedInstitutionalPlanCode(snapshot.planCode)
          ? mappedInstitutionalSelectionPlanCode(snapshot.planCode)
          : null;
      if (!selectionPlan) {
        throw new ConflictException({ code: "QUOTE_CHANGED" });
      }
      validateInstitutionalSelection(selectionPlan, {
        includedModules: snapshot.includedModules,
        paidModules: snapshot.paidModules,
      });
    }
    if (
      snapshot.pricingVersion !== DECLARED_CAPACITY_PRICING_VERSION &&
      snapshot.countSource === InstitutionalCountSource.DECLARED
    ) {
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
    } else if (
      snapshot.pricingVersion !== DECLARED_CAPACITY_PRICING_VERSION &&
      snapshot.countSource === InstitutionalCountSource.VERIFIED
    ) {
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
    } else if (snapshot.pricingVersion !== DECLARED_CAPACITY_PRICING_VERSION) {
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
      let maxSites: number;
      if (snapshot.pricingVersion === DECLARED_CAPACITY_PRICING_VERSION) {
        if (
          !isDeclaredCapacityPlanCode(snapshot.planCode) ||
          snapshot.declaredCapacity === null
        ) {
          throw new ConflictException({ code: "QUOTE_CHANGED" });
        }
        const quote = calculateDeclaredCapacityQuote({
          declaredCapacity: snapshot.declaredCapacity,
          interval: declaredCapacityIntervalFromPlanCode(snapshot.planCode),
        });
        if (quote.kind !== "priced") {
          throw new ConflictException({ code: "CONTACT_SALES_REQUIRED" });
        }
        maxSites = quote.siteAllowance;
      } else if (isInstitutionalPlanCode(snapshot.planCode)) {
        maxSites = INSTITUTIONAL_PLANS[snapshot.planCode].includedSites;
      } else if (isMappedInstitutionalPlanCode(snapshot.planCode)) {
        maxSites =
          INSTITUTIONAL_PLANS[
            mappedInstitutionalSelectionPlanCode(snapshot.planCode)
          ].includedSites;
      } else {
        throw new ConflictException({ code: "QUOTE_CHANGED" });
      }
      if (
        snapshot.pricingVersion === DECLARED_CAPACITY_PRICING_VERSION &&
        (await tx.tenant.count({ where: { orgId } })) > maxSites
      ) {
        throw new ConflictException({ code: "CAPACITY_BELOW_SITE_ALLOWANCE" });
      }
      const order = await tx.pendingOrder.create({
        data: {
          orgId,
          tenantId: tenant.id,
          planCode: snapshot.planCode,
          maxSites,
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
            selectedTrialModules: snapshot.selectedTrialModules,
          },
          provider: BillingProvider.STRIPE,
          institutionalSnapshotId: snapshot.id,
          institutionalCheckoutKey: idempotencyKey,
        },
      });
      return { order, snapshot };
    });
    const { order, snapshot } = prepared;
    if (snapshot.pricingVersion === DECLARED_CAPACITY_PRICING_VERSION) {
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
    }
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
    const declaredCapacityCheckout =
      snapshot.pricingVersion === DECLARED_CAPACITY_PRICING_VERSION;
    let adminOrigin: URL | null = null;
    if (mappedCheckout || declaredCapacityCheckout) {
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
        if (
          snapshot.pricingVersion === INSTITUTIONAL_MAPPED_PRICING_VERSION ||
          snapshot.pricingVersion === DECLARED_CAPACITY_PRICING_VERSION
        ) {
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
        ...declaredCapacityCheckoutTaxOptions(snapshot.pricingVersion),
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
