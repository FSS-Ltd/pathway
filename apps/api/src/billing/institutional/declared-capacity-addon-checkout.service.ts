import {
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  InstitutionalAddonInterval,
  InstitutionalAddonTrialStatus,
  Module,
  withOrgRlsContext,
} from "@pathway/db";
import { DECLARED_CAPACITY_PRICING_VERSION } from "@pathway/pricing";
import Stripe from "stripe";
import { InstitutionalPriceResolver } from "./institutional-price-resolver";
import { DeclaredCapacityAddonTrialsService } from "./declared-capacity-addon-trials.service";
import {
  declaredCapacityAddonPriceCode,
  isDeclaredCapacityAddonModule,
} from "./declared-capacity-addons";
import { isDeclaredCapacityAddonTrialReady } from "./declared-capacity-stripe-pricing";
import {
  BILLING_PROVIDER_CONFIG,
  type BillingProviderConfig,
} from "../billing-provider.config";
import { institutionalStripeKey } from "./institutional-provider-guard";
import { withInstitutionalOrgLock } from "./institutional-quote.service";
import {
  assertDeclaredCapacityBillingEnabled,
  assertDeclaredCapacityTaxRegistration,
  declaredCapacityCheckoutTaxOptions,
} from "./declared-capacity-gate";

type PaidInterval = "MONTHLY" | "YEARLY";

function intervalForStripe(interval: PaidInterval): "month" | "year" {
  return interval === "YEARLY" ? "year" : "month";
}

function intervalForDatabase(
  interval: PaidInterval,
): InstitutionalAddonInterval {
  return interval === "YEARLY"
    ? InstitutionalAddonInterval.YEARLY
    : InstitutionalAddonInterval.MONTHLY;
}

function validateProviderPrice(
  price: Stripe.Price,
  expected: { priceId: string; unitAmountPence: number },
  interval: PaidInterval,
  expectLivemode: boolean,
): void {
  const expectedInterval = intervalForStripe(interval);
  const recurring = price.recurring;
  if (
    !recurring ||
    price.id !== expected.priceId ||
    price.active !== true ||
    price.livemode !== expectLivemode ||
    price.currency !== "gbp" ||
    price.unit_amount !== expected.unitAmountPence ||
    price.tax_behavior !== "inclusive" ||
    recurring.interval !== expectedInterval ||
    recurring.interval_count !== 1 ||
    recurring.usage_type !== "licensed"
  ) {
    throw new ServiceUnavailableException({
      code: "ADDON_PRICE_NOT_CONFIGURED",
    });
  }
}

@Injectable()
export class DeclaredCapacityAddonCheckoutService {
  constructor(
    @Inject(BILLING_PROVIDER_CONFIG)
    private readonly config: BillingProviderConfig,
    @Inject(InstitutionalPriceResolver)
    private readonly prices: InstitutionalPriceResolver,
    @Inject(DeclaredCapacityAddonTrialsService)
    private readonly trials: DeclaredCapacityAddonTrialsService,
  ) {}

  private stripe(): Stripe {
    return new Stripe(institutionalStripeKey(this.config, "CHECKOUT"), {
      apiVersion: "2023-10-16",
    });
  }

  async startCheckout(
    orgId: string,
    module: Module,
    interval: PaidInterval,
    now = new Date(),
  ): Promise<{ checkoutUrl: string; trialId: string }> {
    assertDeclaredCapacityBillingEnabled();
    const taxOptions = declaredCapacityCheckoutTaxOptions(
      DECLARED_CAPACITY_PRICING_VERSION,
    );
    if (!isDeclaredCapacityAddonModule(module)) {
      throw new ConflictException({ code: "ADDON_MODULE_NOT_TRIAL_ELIGIBLE" });
    }
    const { trial, stripeCustomerId } = await this.trials.checkoutContext(
      orgId,
      module,
      now,
    );
    if (
      trial.status !== InstitutionalAddonTrialStatus.EXPIRED ||
      !trial.decisionActorUserId ||
      !trial.decidedAt
    ) {
      throw new ConflictException({
        code: "ADDON_TRIAL_PURCHASE_CONSENT_REQUIRED",
      });
    }

    const priceCode = declaredCapacityAddonPriceCode(
      module,
      intervalForStripe(interval),
    );
    const configuredPrices = await this.prices.resolve();
    if (!isDeclaredCapacityAddonTrialReady(module, configuredPrices)) {
      throw new ServiceUnavailableException({
        code: "ADDON_PRICE_NOT_CONFIGURED",
      });
    }
    const configuredPrice = configuredPrices[priceCode];
    if (!configuredPrice) {
      throw new ServiceUnavailableException({
        code: "ADDON_PRICE_NOT_CONFIGURED",
      });
    }
    const stripe = this.stripe();
    await assertDeclaredCapacityTaxRegistration(
      async () =>
        (await stripe.tax.registrations.list({ status: "active", limit: 100 }))
          .data,
      this.config.activeProvider === "STRIPE",
    );
    let providerPrice: Stripe.Price;
    try {
      providerPrice = await stripe.prices.retrieve(configuredPrice.priceId);
      validateProviderPrice(
        providerPrice,
        configuredPrice,
        interval,
        this.config.activeProvider === "STRIPE",
      );
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException({
        code: "ADDON_PRICE_NOT_CONFIGURED",
      });
    }

    let attempt = await this.reserveAttempt(orgId, module, interval);
    if (attempt.sessionId) {
      let existing: Stripe.Checkout.Session;
      try {
        existing = await stripe.checkout.sessions.retrieve(attempt.sessionId);
      } catch {
        throw new ServiceUnavailableException({
          code: "ADDON_CHECKOUT_UNAVAILABLE",
        });
      }
      if (existing.status === "open" && existing.url) {
        return { checkoutUrl: existing.url, trialId: attempt.trialId };
      }
      if (existing.status !== "expired") {
        throw new ConflictException({
          code: "ADDON_CHECKOUT_ALREADY_COMPLETED",
        });
      }
      attempt = await this.reserveAttempt(orgId, module, interval, true);
    }

    const adminOrigin = this.adminOrigin();
    const addonPlanCode = `ADD_ON:DECLARED_CAPACITY_${module}`;
    const metadata = {
      orgId,
      addonTrialId: attempt.trialId,
      addonModule: module,
      planCode: addonPlanCode,
      addonInterval: interval,
    };
    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create(
        {
          mode: "subscription",
          customer: stripeCustomerId,
          success_url: new URL(
            "/billing/institutional?addonCheckout=complete",
            adminOrigin,
          ).toString(),
          cancel_url: new URL(
            "/billing/institutional?addonCheckout=cancelled",
            adminOrigin,
          ).toString(),
          line_items: [{ price: providerPrice.id, quantity: 1 }],
          ...taxOptions,
          metadata,
          subscription_data: { metadata },
        },
        {
          idempotencyKey: `institutional-addon-trial-checkout:${attempt.trialId}:${attempt.attempt}`,
        },
      );
    } catch {
      throw new ServiceUnavailableException({
        code: "ADDON_CHECKOUT_UNAVAILABLE",
      });
    }
    if (!session.url || session.status !== "open") {
      throw new ServiceUnavailableException({
        code: "ADDON_CHECKOUT_URL_MISSING",
      });
    }

    const saved = await withInstitutionalOrgLock(orgId, async (tx) =>
      tx.institutionalAddonTrial.updateMany({
        where: {
          id: attempt.trialId,
          orgId,
          status: InstitutionalAddonTrialStatus.EXPIRED,
          decisionActorUserId: { not: null },
          chosenPaidInterval: intervalForDatabase(interval),
          paidCheckoutAttempt: attempt.attempt,
          OR: [
            { paidCheckoutSessionId: null },
            { paidCheckoutSessionId: session.id },
          ],
        },
        data: { paidCheckoutSessionId: session.id },
      }),
    );
    if (saved.count !== 1) {
      const current = await withOrgRlsContext(orgId, (tx) =>
        tx.institutionalAddonTrial.findUnique({
          where: { id: attempt.trialId },
          select: { status: true, paidCheckoutSessionId: true },
        }),
      );
      if (
        current?.status !== InstitutionalAddonTrialStatus.CONVERTED ||
        current.paidCheckoutSessionId !== session.id
      ) {
        throw new ConflictException({ code: "ADDON_TRIAL_CHECKOUT_CHANGED" });
      }
    }
    return { checkoutUrl: session.url, trialId: attempt.trialId };
  }

  private async reserveAttempt(
    orgId: string,
    module: Module,
    interval: PaidInterval,
    restartExpired = false,
  ) {
    return withInstitutionalOrgLock(orgId, async (tx) => {
      const trial = await tx.institutionalAddonTrial.findUnique({
        where: { orgId_module: { orgId, module } },
      });
      if (
        !trial ||
        trial.status !== InstitutionalAddonTrialStatus.EXPIRED ||
        !trial.decisionActorUserId ||
        !trial.decidedAt
      ) {
        throw new ConflictException({
          code: "ADDON_TRIAL_PURCHASE_CONSENT_REQUIRED",
        });
      }
      if (trial.paidCheckoutSessionId && !restartExpired) {
        if (trial.chosenPaidInterval !== intervalForDatabase(interval)) {
          throw new ConflictException({
            code: "ADDON_CHECKOUT_INTERVAL_LOCKED",
          });
        }
        return {
          trialId: trial.id,
          attempt: trial.paidCheckoutAttempt,
          sessionId: trial.paidCheckoutSessionId,
        };
      }
      if (trial.paidCheckoutSessionId && restartExpired) {
        const attempt = trial.paidCheckoutAttempt + 1;
        const cleared = await tx.institutionalAddonTrial.updateMany({
          where: {
            id: trial.id,
            orgId,
            paidCheckoutSessionId: trial.paidCheckoutSessionId,
            paidCheckoutAttempt: trial.paidCheckoutAttempt,
          },
          data: {
            chosenPaidInterval: intervalForDatabase(interval),
            paidCheckoutAttempt: attempt,
            paidCheckoutSessionId: null,
          },
        });
        if (cleared.count !== 1) {
          throw new ConflictException({ code: "ADDON_TRIAL_CHECKOUT_CHANGED" });
        }
        return { trialId: trial.id, attempt, sessionId: null };
      }
      if (
        restartExpired &&
        trial.paidCheckoutAttempt > 0 &&
        trial.chosenPaidInterval === intervalForDatabase(interval)
      ) {
        return {
          trialId: trial.id,
          attempt: trial.paidCheckoutAttempt,
          sessionId: null,
        };
      }
      if (restartExpired) {
        throw new ConflictException({ code: "ADDON_TRIAL_CHECKOUT_CHANGED" });
      }
      if (
        trial.paidCheckoutAttempt > 0 &&
        !restartExpired &&
        trial.chosenPaidInterval !== intervalForDatabase(interval)
      ) {
        throw new ConflictException({ code: "ADDON_CHECKOUT_INTERVAL_LOCKED" });
      }
      const attempt = restartExpired
        ? trial.paidCheckoutAttempt + 1
        : Math.max(1, trial.paidCheckoutAttempt);
      const updated = await tx.institutionalAddonTrial.updateMany({
        where: {
          id: trial.id,
          orgId,
          status: InstitutionalAddonTrialStatus.EXPIRED,
          paidCheckoutAttempt: trial.paidCheckoutAttempt,
          paidCheckoutSessionId: trial.paidCheckoutSessionId,
        },
        data: {
          chosenPaidInterval: intervalForDatabase(interval),
          paidCheckoutAttempt: attempt,
          paidCheckoutSessionId: null,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException({ code: "ADDON_TRIAL_CHECKOUT_CHANGED" });
      }
      return { trialId: trial.id, attempt, sessionId: null };
    });
  }

  private adminOrigin(): URL {
    try {
      const origin = new URL(process.env.ADMIN_URL?.trim() ?? "");
      if (
        origin.protocol !== "https:" &&
        !(origin.protocol === "http:" && origin.hostname === "localhost")
      ) {
        throw new Error("Invalid admin URL");
      }
      return origin;
    } catch {
      throw new ServiceUnavailableException({ code: "CHECKOUT_URLS_MISSING" });
    }
  }
}
