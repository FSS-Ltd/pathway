import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import { BillingProvider, prisma } from "@pathway/db";
import { requireDatabase } from "../../../../test-helpers.e2e";
import { ClerkManagementService } from "../../../auth/clerk-management.service";
import { Auth0ManagementService } from "../../../auth/auth0-management.service";
import { LoggingService } from "../../../common/logging/logging.service";
import { BILLING_PROVIDER_CONFIG } from "../../billing-provider.config";
import {
  BILLING_WEBHOOK_PROVIDER,
  type ParsedBillingWebhookEvent,
} from "../../billing-webhook.provider";
import { EntitlementsService } from "../../entitlements.service";
import { BillingWebhookController } from "../../webhook.controller";
import { InstitutionalPublicCheckoutService } from "../institutional-public-checkout.service";
import { InstitutionalPublicActivationService } from "../institutional-public-activation.service";
import { InstitutionalWebhookService } from "../institutional-webhook.service";
import { InstitutionalPriceResolver } from "../institutional-price-resolver";
import { parsePublicInstitutionalOrder } from "../institutional-public-order";

// Only external payment and identity providers are replaced; pending orders,
// provisioning transactions, membership creation and activation use PostgreSQL.
jest.mock("stripe", () => ({
  __esModule: true,
  default: jest.fn(() => ({
    prices: {
      retrieve: async (id: string) => ({
        id,
        active: true,
        livemode: false,
        currency: "gbp",
        unit_amount: 4900,
        recurring: {
          interval: "month",
          interval_count: 1,
          usage_type: "licensed",
        },
      }),
    },
    checkout: {
      sessions: {
        create: async () => ({
          id: `cs_${randomUUID()}`,
          url: "https://checkout.example.test/session",
        }),
      },
    },
  })),
}));

describe("Learning Centre checkout through paid provisioning (e2e)", () => {
  it.each(["ACE_LEARNING_CENTRE", "PUBLIC_LEARNING_CENTRE"] as const)(
    "persists the sector, %s identity and administrator memberships exactly once",
    async (setting) => {
      if (!requireDatabase()) return;
      const savedCheckout = process.env.INSTITUTIONAL_CHECKOUT_ENABLED;
      const savedWrites = process.env.INSTITUTIONAL_PROVIDER_WRITES_ENABLED;
      process.env.INSTITUTIONAL_CHECKOUT_ENABLED = "true";
      process.env.INSTITUTIONAL_PROVIDER_WRITES_ENABLED = "true";
      const provider = {
        verifyAndParse: jest.fn<Promise<ParsedBillingWebhookEvent>, []>(),
      };
      const identity = {
        isReady: () => true,
        createUser: async () => `test_${randomUUID()}`,
      };
      const module = await Test.createTestingModule({
        controllers: [BillingWebhookController],
        providers: [
          InstitutionalPublicCheckoutService,
          InstitutionalPublicActivationService,
          InstitutionalWebhookService,
          {
            provide: BILLING_PROVIDER_CONFIG,
            useValue: {
              activeProvider: "STRIPE_TEST",
              stripe: {
                secretKey: "sk_test_disposable",
                priceMap: {},
                successUrlDefault: "https://example.test/success",
                cancelUrlDefault: "https://example.test/cancel",
              },
              goCardless: {},
            },
          },
          { provide: BILLING_WEBHOOK_PROVIDER, useValue: provider },
          {
            provide: InstitutionalPriceResolver,
            useValue: {
              resolve: async () => ({
                STARTER_49_MONTHLY: {
                  priceId: "price_acceptedbase",
                  unitAmountPence: 4900,
                },
                INSTITUTIONAL_CHILD_UP_TO_100_MONTHLY: {
                  priceId: "price_acceptedpupil",
                  unitAmountPence: 100,
                },
                INSTITUTIONAL_CHILD_101_TO_250_MONTHLY: {
                  priceId: "price_acceptednext",
                  unitAmountPence: 75,
                },
              }),
            },
          },
          {
            provide: EntitlementsService,
            useValue: { resolve: async () => undefined },
          },
          { provide: ClerkManagementService, useValue: identity },
          { provide: Auth0ManagementService, useValue: identity },
          {
            provide: LoggingService,
            useValue: {
              createLogger: () => ({
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
              }),
            },
          },
        ],
      }).compile();
      try {
        const email = `learning-centre-${randomUUID()}@example.test`;
        const checkout = await module
          .get(InstitutionalPublicCheckoutService)
          .checkout({
            planCode: "INSTITUTIONAL_STARTER_MONTHLY",
            enrolledChildren: 20,
            declarationAccepted: true,
            setting,
            storageChoice: "none",
            includedModules: [],
            paidModules: [],
            idempotencyKey: randomUUID(),
            org: {
              orgName: "Learning Centre provisioning test",
              contactName: "Administrator",
              contactEmail: email,
              password: "test-only-password",
            },
          });
        const beforePayment = await prisma.pendingOrder.findUniqueOrThrow({
          where: { id: checkout.pendingOrderId },
        });
        expect(beforePayment.orgId).toBeNull();
        expect(beforePayment.pendingOrgDetails).toMatchObject({
          sector: "LEARNING_CENTRE",
          vertical: setting,
        });
        const frozen = parsePublicInstitutionalOrder(beforePayment.flags);
        if (!frozen) throw new Error("Missing accepted checkout quote");
        expect(frozen.setting).toBe(setting);
        const event: ParsedBillingWebhookEvent = {
          provider: BillingProvider.STRIPE,
          eventId: `evt_${randomUUID()}`,
          kind: "invoice.paid",
          orgId: "pending",
          pendingOrderId: beforePayment.id,
          subscriptionId: `sub_${randomUUID()}`,
          periodStart: new Date("2030-01-01T00:00:00Z"),
          periodEnd: new Date("2030-02-01T00:00:00Z"),
          invoice: {
            id: `in_${randomUUID()}`,
            status: "paid",
            currency: "gbp",
            linesComplete: true,
            lines: frozen.quote.lines
              .filter((line) => line.quantity > 0)
              .map((line) => ({
                priceId: line.priceId,
                quantity: line.quantity,
                amountPence: line.subtotalPence,
              })),
          },
        };
        provider.verifyAndParse.mockResolvedValue(event);
        const controller = module.get(BillingWebhookController);
        await controller.handleWebhook({});
        await controller.handleWebhook({});
        const paid = await prisma.pendingOrder.findUniqueOrThrow({
          where: { id: beforePayment.id },
        });
        if (!paid.orgId || !paid.tenantId)
          throw new Error("Payment did not provision the institution");
        const org = await prisma.org.findUniqueOrThrow({
          where: { id: paid.orgId },
        });
        expect(org.sector).toBe("LEARNING_CENTRE");
        expect(
          await prisma.orgVertical.findUniqueOrThrow({
            where: { orgId: org.id },
          }),
        ).toMatchObject({ vertical: setting });
        const user = await prisma.user.findUniqueOrThrow({ where: { email } });
        expect(
          await prisma.siteMembership.findUniqueOrThrow({
            where: {
              tenantId_userId: { tenantId: paid.tenantId, userId: user.id },
            },
          }),
        ).toMatchObject({ role: "SITE_ADMIN" });
        expect(
          await prisma.orgMembership.findUniqueOrThrow({
            where: { orgId_userId: { orgId: org.id, userId: user.id } },
          }),
        ).toMatchObject({ role: "ORG_ADMIN" });
        expect(await prisma.org.count({ where: { slug: org.slug } })).toBe(1);
        expect(await prisma.tenant.count({ where: { orgId: org.id } })).toBe(1);
        expect(
          await prisma.institutionalBillingSnapshot.count({
            where: { orgId: org.id },
          }),
        ).toBe(1);
        expect(paid.pendingOrgDetails).toEqual({});
      } finally {
        await module.close();
        if (savedCheckout === undefined)
          delete process.env.INSTITUTIONAL_CHECKOUT_ENABLED;
        else process.env.INSTITUTIONAL_CHECKOUT_ENABLED = savedCheckout;
        if (savedWrites === undefined)
          delete process.env.INSTITUTIONAL_PROVIDER_WRITES_ENABLED;
        else process.env.INSTITUTIONAL_PROVIDER_WRITES_ENABLED = savedWrites;
      }
    },
  );
});
