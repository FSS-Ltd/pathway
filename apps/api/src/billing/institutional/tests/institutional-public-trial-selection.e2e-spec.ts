import { randomUUID } from "node:crypto";
import {
  BillingProvider,
  InstitutionalAddonTrialStatus,
  Module,
  PendingOrderStatus,
  prisma,
} from "@pathway/db";
import { quoteDeclaredCapacityWithStripePrices } from "../declared-capacity-stripe-pricing";
import { InstitutionalPublicActivationService } from "../institutional-public-activation.service";
import { InstitutionalWebhookService } from "../institutional-webhook.service";
import type { BillingWebhookProvider } from "../../billing-webhook.provider";
import { requireDatabase } from "../../../../test-helpers.e2e";

const addonPrices = {
  DECLARED_CAPACITY_BASE_MONTHLY: {
    priceId: "price_publicbase",
    unitAmountPence: 7_400,
  },
  DECLARED_CAPACITY_BASE_YEARLY: {
    priceId: "price_publicbaseyear",
    unitAmountPence: 74_000,
  },
  DECLARED_CAPACITY_CHILD_MONTHLY: {
    priceId: "price_publicchild",
    unitAmountPence: 100,
  },
  DECLARED_CAPACITY_CHILD_YEARLY: {
    priceId: "price_publicchildyear",
    unitAmountPence: 1_000,
  },
  MODULE_EVENTS_MONTHLY: {
    priceId: "price_publiceventsmonth",
    unitAmountPence: 2_000,
  },
  MODULE_EVENTS_YEARLY: {
    priceId: "price_publiceventsyear",
    unitAmountPence: 20_000,
  },
  STORAGE_100GB_MONTHLY: {
    priceId: "price_publicstorage100month",
    unitAmountPence: 149,
  },
};

describe("public institutional trial selection (e2e)", () => {
  const oldApproved = process.env.DECLARED_CAPACITY_APPROVED_ADDON_MODULES;
  const oldDelivered = process.env.DECLARED_CAPACITY_DELIVERED_ADDON_MODULES;

  afterAll(() => {
    if (oldApproved === undefined) {
      delete process.env.DECLARED_CAPACITY_APPROVED_ADDON_MODULES;
    } else {
      process.env.DECLARED_CAPACITY_APPROVED_ADDON_MODULES = oldApproved;
    }
    if (oldDelivered === undefined) {
      delete process.env.DECLARED_CAPACITY_DELIVERED_ADDON_MODULES;
    } else {
      process.env.DECLARED_CAPACITY_DELIVERED_ADDON_MODULES = oldDelivered;
    }
  });

  it("persists storage and trial selection after payment without charging or granting the trial", async () => {
    if (!requireDatabase()) return;
    process.env.DECLARED_CAPACITY_APPROVED_ADDON_MODULES = "EVENTS";
    process.env.DECLARED_CAPACITY_DELIVERED_ADDON_MODULES = "EVENTS";

    const orgId = randomUUID();
    const tenantId = randomUUID();
    const orderId = randomUUID();
    const email = `public-trial-${orderId}@example.test`;
    const periodStart = new Date("2030-01-01T00:00:00.000Z");
    const periodEnd = new Date("2030-02-01T00:00:00.000Z");
    const quote = quoteDeclaredCapacityWithStripePrices(
      { declaredCapacity: 10, interval: "month" },
      addonPrices,
      { trialModules: [Module.EVENTS], storageChoice: "100" },
    );
    if (quote.kind !== "priced") throw new Error("Expected a priced quote");
    expect(quote.trialModules).toEqual([Module.EVENTS]);
    expect(quote.lines.every((line) => line.component !== "ADDON")).toBe(true);
    expect(quote.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          component: "STORAGE",
          priceCode: "STORAGE_100GB_MONTHLY",
          priceId: "price_publicstorage100month",
        }),
      ]),
    );

    await prisma.org.create({
      data: {
        id: orgId,
        name: "Public trial test",
        slug: `public-trial-${orgId}`,
        planCode: quote.planCode,
      },
    });
    await prisma.tenant.create({
      data: {
        id: tenantId,
        orgId,
        name: "Main site",
        slug: `public-trial-${tenantId}`,
        timezone: "Europe/London",
      },
    });
    await prisma.user.create({
      data: {
        email,
        name: "Billing contact",
        tenantId,
      },
    });
    await prisma.pendingOrder.create({
      data: {
        id: orderId,
        orgId,
        tenantId,
        planCode: quote.planCode,
        maxSites: quote.siteAllowance,
        storageGbCap: 100,
        selectedModules: [],
        provider: BillingProvider.STRIPE,
        status: PendingOrderStatus.PENDING,
        institutionalCheckoutKey: `public-trial-${orderId}`,
        flags: {
          purchaseKind: "institutional_declared_capacity_public",
          quote,
          paidModules: [],
          trialModules: [Module.EVENTS],
          setting: "INDEPENDENT_SCHOOL",
          requestFingerprint: "a".repeat(64),
        },
        pendingOrgDetails: {
          contactEmail: email,
          password: "temporary-password",
        },
      },
    });

    const activation = new InstitutionalPublicActivationService();
    await activation.attachAcceptedQuote(orderId, orgId, tenantId, periodStart);
    const order = await prisma.pendingOrder.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(order.selectedModules).toEqual([]);
    if (!order.institutionalSnapshotId) {
      throw new Error("Paid public order did not attach its quote snapshot");
    }
    expect(
      await prisma.institutionalAddonTrial.count({ where: { orgId } }),
    ).toBe(0);
    const acceptedSnapshot =
      await prisma.institutionalBillingSnapshot.findUniqueOrThrow({
        where: { id: order.institutionalSnapshotId },
        include: { acceptance: true },
      });
    expect(acceptedSnapshot.acceptance?.effectiveAt).toEqual(periodStart);

    const event = {
      provider: BillingProvider.STRIPE,
      eventId: `evt_public_trial_${orderId}`,
      kind: "invoice.paid" as const,
      orgId,
      subscriptionId: `sub_${orderId.replaceAll("-", "")}`,
      pendingOrderId: orderId,
      periodStart,
      periodEnd,
      invoice: {
        id: `in_${orderId}`,
        status: "paid" as const,
        currency: "gbp",
        linesComplete: true,
        lines: quote.lines
          .filter((line) => line.quantity > 0)
          .map((line) => ({
            priceId: line.priceId,
            quantity: line.quantity,
            amountPence: line.subtotalPence,
          })),
      },
    };
    const webhook = new InstitutionalWebhookService(
      { verifyAndParse: async () => event } satisfies BillingWebhookProvider,
      { activeProvider: "STRIPE", stripe: { priceMap: {} }, goCardless: {} },
    );
    await webhook.handle(event);
    await webhook.handle({ ...event, eventId: `${event.eventId}_replay` });

    await expect(
      prisma.orgEntitlementSnapshot.findFirst({
        where: { orgId },
        orderBy: { createdAt: "desc" },
      }),
    ).resolves.toMatchObject({ storageGbIncluded: 100 });

    expect(
      await prisma.institutionalAddonTrial.findUnique({
        where: { orgId_module: { orgId, module: Module.EVENTS } },
      }),
    ).toMatchObject({
      status: InstitutionalAddonTrialStatus.SELECTED,
      activatedAt: null,
      expiresAt: null,
    });
    expect(
      await prisma.orgModule.findUnique({
        where: { orgId_module: { orgId, module: Module.EVENTS } },
      }),
    ).toBeNull();
    expect(
      await prisma.moduleGrant.findFirst({
        where: { orgId, module: Module.EVENTS },
      }),
    ).toBeNull();
  });
});
