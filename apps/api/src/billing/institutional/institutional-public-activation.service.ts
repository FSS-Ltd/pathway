import { Injectable } from "@nestjs/common";
import {
  applyTenantContext,
  InstitutionalCountSource,
  InstitutionalSnapshotKind,
  InstitutionalSnapshotStatus,
  PendingOrderStatus,
  prisma,
  type Prisma,
} from "@pathway/db";
import { DECLARED_CAPACITY_PRICING_VERSION } from "@pathway/pricing";
import type { ParsedBillingWebhookEvent } from "../billing-webhook.provider";
import {
  parsePublicInstitutionalOrder,
  publicInstitutionalInvoiceMatches,
} from "./institutional-public-order";
import { QUOTE_VALIDITY_MS } from "./institutional-time";

type PendingOrder = Prisma.PendingOrderGetPayload<Record<string, never>>;

@Injectable()
export class InstitutionalPublicActivationService {
  isPublicInstitutionalOrder(order: PendingOrder | null): boolean {
    return !!order && !!parsePublicInstitutionalOrder(order.flags);
  }

  draftInvoiceMatches(
    event: ParsedBillingWebhookEvent,
    order: PendingOrder,
  ): boolean {
    const frozen = parsePublicInstitutionalOrder(order.flags);
    return !!frozen && publicInstitutionalInvoiceMatches(event, frozen.quote);
  }

  assertPaidInvoice(
    event: ParsedBillingWebhookEvent,
    order: PendingOrder,
  ): void {
    const frozen = parsePublicInstitutionalOrder(order.flags);
    if (
      !frozen ||
      order.status !== PendingOrderStatus.PENDING ||
      (event.providerCheckoutId &&
        event.providerCheckoutId !== order.providerCheckoutId) ||
      !event.subscriptionId ||
      !event.periodStart ||
      !event.periodEnd ||
      !publicInstitutionalInvoiceMatches(event, frozen.quote)
    ) {
      throw new Error("Institutional public invoice requires review.");
    }
  }

  async attachAcceptedQuote(
    orderId: string,
    orgId: string,
    tenantId: string,
    effectiveAt?: Date,
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await applyTenantContext(tx, tenantId, orgId);
      await tx.$queryRaw`SELECT id FROM "PendingOrder" WHERE id = ${orderId} FOR UPDATE`;
      const order = await tx.pendingOrder.findUniqueOrThrow({
        where: { id: orderId },
      });
      if (order.orgId !== orgId || order.tenantId !== tenantId) {
        throw new Error("Institutional order organisation changed.");
      }
      if (order.institutionalSnapshotId) return;
      const frozen = parsePublicInstitutionalOrder(order.flags);
      const details = order.pendingOrgDetails;
      if (
        !frozen ||
        !details ||
        typeof details !== "object" ||
        Array.isArray(details) ||
        typeof details.contactEmail !== "string"
      ) {
        throw new Error("Institutional order details are unavailable.");
      }
      const actor = await tx.user.findUnique({
        where: { email: details.contactEmail },
        select: { id: true },
      });
      const tenant = await tx.tenant.findFirst({
        where: { id: tenantId, orgId },
        select: { timezone: true },
      });
      if (!actor || !tenant) {
        throw new Error("Institutional account is incomplete.");
      }
      const declaredCapacity =
        frozen.quote.pricingVersion === DECLARED_CAPACITY_PRICING_VERSION
          ? frozen.quote.declaredCapacity
          : null;
      const enrolledChildren =
        frozen.quote.pricingVersion === DECLARED_CAPACITY_PRICING_VERSION
          ? null
          : frozen.quote.enrolledChildren;
      const includedModules =
        frozen.purchaseKind === "institutional_public"
          ? frozen.includedModules
          : [];
      await tx.orgVertical.upsert({
        where: { orgId },
        create: { orgId, vertical: frozen.setting },
        update: { vertical: frozen.setting },
      });
      const policy = await tx.institutionalBillingPolicy.create({
        data: {
          orgId,
          pricingVersion: frozen.quote.pricingVersion,
          timezone: tenant.timezone ?? "Europe/London",
          declaredChildren: enrolledChildren,
          declaredCapacity,
          declaredAt: order.createdAt,
          declaredByUserId: actor.id,
        },
      });
      const snapshot = await tx.institutionalBillingSnapshot.create({
        data: {
          orgId,
          policyId: policy.id,
          kind: InstitutionalSnapshotKind.QUOTE,
          status: InstitutionalSnapshotStatus.PRICED,
          planCode: frozen.quote.planCode,
          pricingVersion: frozen.quote.pricingVersion,
          countSource:
            declaredCapacity === null
              ? InstitutionalCountSource.DECLARED
              : null,
          enrolledChildren,
          declaredCapacity,
          includedChildren:
            frozen.quote.pricingVersion === DECLARED_CAPACITY_PRICING_VERSION
              ? null
              : frozen.quote.includedChildren,
          includedModules,
          paidModules: frozen.paidModules,
          selectedTrialModules:
            frozen.purchaseKind === "institutional_declared_capacity_public"
              ? frozen.trialModules
              : [],
          lines: frozen.quote.lines,
          subtotalPence: frozen.quote.subtotalPence,
          amountDueNowPence: frozen.quote.subtotalPence,
          expiresAt: new Date(order.createdAt.getTime() + QUOTE_VALIDITY_MS),
        },
      });
      await tx.institutionalQuoteAcceptance.create({
        data: {
          orgId,
          snapshotId: snapshot.id,
          actorUserId: actor.id,
          idempotencyKey: order.institutionalCheckoutKey ?? order.id,
          acceptedAmountPence: frozen.quote.subtotalPence,
          effectiveAt:
            frozen.quote.pricingVersion === DECLARED_CAPACITY_PRICING_VERSION
              ? (effectiveAt ?? order.createdAt)
              : order.createdAt,
          acceptedAt: order.createdAt,
        },
      });
      await tx.pendingOrder.update({
        where: { id: order.id },
        data: { institutionalSnapshotId: snapshot.id },
      });
    });
  }
}
