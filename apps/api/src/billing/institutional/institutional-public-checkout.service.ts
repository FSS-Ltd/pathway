import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  BillingProvider,
  Module,
  PendingOrderStatus,
  prisma,
} from "@pathway/db";
import {
  calculateMappedInstitutionalQuote,
  INSTITUTIONAL_PLANS,
  InstitutionalMappedPriceError,
  mappedInstitutionalSelectionPlanCode,
  type InstitutionalMappedPlanCode,
  type InstitutionalStorageChoice,
} from "@pathway/pricing";
import Stripe from "stripe";
import {
  BILLING_PROVIDER_CONFIG,
  type BillingProviderConfig,
} from "../billing-provider.config";
import { validateInstitutionalSelection } from "./institutional-selection";
import { InstitutionalPriceResolver } from "./institutional-price-resolver";
import { institutionalStripeKey } from "./institutional-provider-guard";
import { validateFrozenStripePrice } from "./institutional-frozen-stripe-price";
import {
  parsePublicInstitutionalOrder,
  publicInstitutionalFingerprint,
  publicInstitutionalOrderId,
} from "./institutional-public-order";

export type PublicInstitutionalCheckoutInput = {
  planCode: InstitutionalMappedPlanCode;
  enrolledChildren: number;
  declarationAccepted: true;
  setting: "INDEPENDENT_SCHOOL" | "ACE_SCHOOL" | "STATE_SCHOOL" | "NURSERY";
  storageChoice: InstitutionalStorageChoice;
  includedModules: Module[];
  paidModules: Module[];
  idempotencyKey: string;
  org: {
    orgName: string;
    contactName: string;
    contactEmail: string;
    password: string;
  };
};

@Injectable()
export class InstitutionalPublicCheckoutService {
  constructor(
    @Inject(BILLING_PROVIDER_CONFIG)
    private readonly config: BillingProviderConfig,
    @Inject(InstitutionalPriceResolver)
    private readonly prices: InstitutionalPriceResolver,
  ) {}

  async checkout(input: PublicInstitutionalCheckoutInput) {
    const stripe = new Stripe(institutionalStripeKey(this.config, "CHECKOUT"), {
      apiVersion: "2023-10-16",
    });
    if (!input.declarationAccepted || input.paidModules.length > 0) {
      throw new BadRequestException({
        code: "INVALID_INSTITUTIONAL_SELECTION",
      });
    }
    const selection = validateInstitutionalSelection(
      mappedInstitutionalSelectionPlanCode(input.planCode),
      input,
    );
    const email = input.org.contactEmail.trim().toLowerCase();
    const orderId = publicInstitutionalOrderId(input.idempotencyKey);
    const fingerprint = publicInstitutionalFingerprint({
      planCode: input.planCode,
      enrolledChildren: input.enrolledChildren,
      storageChoice: input.storageChoice,
      setting: input.setting,
      includedModules: selection.includedModules,
      paidModules: selection.paidModules,
      orgName: input.org.orgName.trim(),
      contactName: input.org.contactName.trim(),
      contactEmail: email,
    });
    let order = await prisma.pendingOrder.findUnique({
      where: { id: orderId },
    });
    if (!order) {
      const existingUser = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (existingUser) {
        throw new ConflictException({ code: "ACCOUNT_SIGN_IN_REQUIRED" });
      }
      let quote;
      try {
        quote = calculateMappedInstitutionalQuote({
          planCode: input.planCode,
          enrolledChildren: input.enrolledChildren,
          storageChoice: input.storageChoice,
          prices: await this.prices.resolve(),
        });
      } catch (error) {
        if (error instanceof InstitutionalMappedPriceError) {
          throw new ServiceUnavailableException({
            code: "INSTITUTIONAL_PRICE_UNAVAILABLE",
            priceCode: error.priceCode,
            retryable: true,
          });
        }
        throw error;
      }
      if (quote.kind !== "priced") {
        throw new ConflictException({ code: "CONTACT_SALES_REQUIRED" });
      }
      for (const line of quote.lines.filter((entry) => entry.quantity > 0)) {
        try {
          validateFrozenStripePrice(
            await stripe.prices.retrieve(line.priceId),
            quote,
            line.priceId,
            this.config.activeProvider === "STRIPE",
          );
        } catch {
          throw new ServiceUnavailableException({
            code: "INSTITUTIONAL_PRICE_UNAVAILABLE",
            priceCode: line.priceCode,
            retryable: true,
          });
        }
      }
      const plan =
        INSTITUTIONAL_PLANS[
          mappedInstitutionalSelectionPlanCode(input.planCode)
        ];
      const slugBase =
        input.org.orgName
          .normalize("NFKD")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 40) || "school";
      order = await prisma.pendingOrder.upsert({
        where: { id: orderId },
        update: {},
        create: {
          id: orderId,
          planCode: input.planCode,
          maxSites: plan.includedSites,
          selectedModules: [
            ...selection.includedModules,
            ...selection.paidModules,
          ],
          flags: {
            purchaseKind: "institutional_public",
            quote,
            setting: input.setting,
            includedModules: selection.includedModules,
            paidModules: selection.paidModules,
            requestFingerprint: fingerprint,
          },
          provider: BillingProvider.STRIPE,
          institutionalCheckoutKey: input.idempotencyKey,
          pendingOrgDetails: {
            orgName: input.org.orgName.trim(),
            slug: `${slugBase}-${orderId.slice(0, 8)}`,
            contactName: input.org.contactName.trim(),
            contactEmail: email,
            password: input.org.password,
            sector: "SCHOOL",
            planCode: input.planCode,
          },
        },
      });
    }
    const frozen = parsePublicInstitutionalOrder(order.flags);
    if (
      !frozen ||
      frozen.requestFingerprint !== fingerprint ||
      order.status !== PendingOrderStatus.PENDING
    ) {
      throw new ConflictException({ code: "IDEMPOTENCY_CONFLICT" });
    }
    if (order.providerCheckoutId) {
      const existing = await stripe.checkout.sessions.retrieve(
        order.providerCheckoutId,
      );
      if (existing.url && existing.status === "open") {
        return { checkoutUrl: existing.url, pendingOrderId: order.id };
      }
      throw new ConflictException({ code: "CHECKOUT_EXPIRED" });
    }
    const successUrl = this.config.stripe.successUrlDefault;
    const cancelUrl = this.config.stripe.cancelUrlDefault;
    if (!successUrl || !cancelUrl) {
      throw new ServiceUnavailableException({ code: "CHECKOUT_URLS_MISSING" });
    }
    const metadata = {
      pendingOrderId: order.id,
      planCode: frozen.quote.planCode,
    };
    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        success_url: successUrl,
        cancel_url: cancelUrl,
        line_items: frozen.quote.lines
          .filter((line) => line.quantity > 0)
          .map((line) => ({ price: line.priceId, quantity: line.quantity })),
        metadata,
        subscription_data: { metadata },
      },
      { idempotencyKey: `institutional-public:${order.id}` },
    );
    if (!session.url) {
      throw new ServiceUnavailableException({ code: "CHECKOUT_URL_MISSING" });
    }
    await prisma.pendingOrder.update({
      where: { id: order.id },
      data: { providerCheckoutId: session.id },
    });
    return { checkoutUrl: session.url, pendingOrderId: order.id };
  }
}
