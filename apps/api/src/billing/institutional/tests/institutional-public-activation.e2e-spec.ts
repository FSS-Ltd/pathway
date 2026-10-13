import { randomUUID } from "node:crypto";
import {
  BillingProvider,
  Module,
  PendingOrderStatus,
  SubscriptionStatus,
  prisma,
} from "@pathway/db";
import { calculateMappedInstitutionalQuote } from "@pathway/pricing";
import { requireDatabase } from "../../../../test-helpers.e2e";
import { InstitutionalPublicActivationService } from "../institutional-public-activation.service";
import { InstitutionalWebhookService } from "../institutional-webhook.service";
import type { BillingWebhookProvider } from "../../billing-webhook.provider";

describe("public institutional order activation (e2e)", () => {
  it("materialises one accepted frozen quote after payment and tolerates replay", async () => {
    if (!requireDatabase()) return;
    const orgId = randomUUID();
    const tenantId = randomUUID();
    const orderId = randomUUID();
    const email = `institutional-${orderId}@example.test`;
    const quote = calculateMappedInstitutionalQuote({
      planCode: "INSTITUTIONAL_STARTER_YEARLY",
      enrolledChildren: 26,
      storageChoice: "none",
      prices: {
        STARTER_49_YEARLY: {
          priceId: "price_acceptedbase",
          unitAmountPence: 49000,
        },
        INSTITUTIONAL_CHILD_UP_TO_100_YEARLY: {
          priceId: "price_acceptedpupil",
          unitAmountPence: 1000,
        },
        INSTITUTIONAL_CHILD_101_TO_250_YEARLY: {
          priceId: "price_acceptednext",
          unitAmountPence: 750,
        },
      },
    });
    if (quote.kind !== "priced") throw new Error("Expected a priced quote");
    await prisma.org.create({
      data: {
        id: orgId,
        name: "Public activation test",
        slug: `institutional-${orgId}`,
        planCode: quote.planCode,
      },
    });
    await prisma.tenant.create({
      data: {
        id: tenantId,
        orgId,
        name: "Main site",
        slug: `institutional-${tenantId}`,
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
        provider: BillingProvider.STRIPE,
        status: PendingOrderStatus.PENDING,
        institutionalCheckoutKey: `checkout-${orderId}`,
        flags: {
          purchaseKind: "institutional_public",
          quote,
          includedModules: [],
          paidModules: [],
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
    await activation.attachAcceptedQuote(orderId, orgId, tenantId);
    await activation.attachAcceptedQuote(orderId, orgId, tenantId);

    const order = await prisma.pendingOrder.findUniqueOrThrow({
      where: { id: orderId },
    });
    if (!order.institutionalSnapshotId) {
      throw new Error("Accepted snapshot was not attached to the order");
    }
    const snapshot =
      await prisma.institutionalBillingSnapshot.findUniqueOrThrow({
        where: { id: order.institutionalSnapshotId },
        include: { acceptance: true },
      });
    expect(snapshot.subtotalPence).toBe(50000);
    expect(snapshot.lines).toEqual(quote.lines);
    expect(snapshot.acceptance?.acceptedAt).toEqual(order.createdAt);
    expect(
      await prisma.orgVertical.findUniqueOrThrow({ where: { orgId } }),
    ).toMatchObject({ vertical: "INDEPENDENT_SCHOOL" });
    expect(
      await prisma.institutionalBillingSnapshot.count({ where: { orgId } }),
    ).toBe(1);

    const subscriptionId = `sub_${orderId.replaceAll("-", "")}`;
    const periodStart = new Date("2030-01-01T00:00:00.000Z");
    const periodEnd = new Date("2031-01-01T00:00:00.000Z");
    const event = {
      provider: BillingProvider.STRIPE,
      eventId: `evt_${orderId}`,
      kind: "invoice.paid" as const,
      orgId,
      subscriptionId,
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
    await webhook.handle(event);
    await webhook.handle({
      ...event,
      eventId: `evt_old_${orderId}`,
      periodStart: new Date("2029-01-01T00:00:00.000Z"),
      periodEnd: periodStart,
    });
    await webhook.handle({
      ...event,
      eventId: `evt_failed_old_${orderId}`,
      kind: "invoice.payment_failed",
      periodStart: new Date("2029-01-01T00:00:00.000Z"),
    });
    expect(
      await prisma.subscription.count({
        where: {
          orgId,
          providerSubId: subscriptionId,
          status: SubscriptionStatus.ACTIVE,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.moduleGrant.count({
        where: { orgId, module: Module.LEARNING, sourceId: subscriptionId },
      }),
    ).toBe(1);
    expect(
      await prisma.orgEntitlementSnapshot.count({ where: { orgId } }),
    ).toBe(1);
    expect(
      (await prisma.pendingOrder.findUniqueOrThrow({ where: { id: orderId } }))
        .pendingOrgDetails,
    ).toEqual({});
  });
});
