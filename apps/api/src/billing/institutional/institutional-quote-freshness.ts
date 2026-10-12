import {
  InstitutionalCountSource,
  InstitutionalSnapshotKind,
  Prisma,
  prisma,
} from "@pathway/db";
import { INSTITUTIONAL_PRICING_VERSION } from "@pathway/pricing";
import type { ParsedBillingWebhookEvent } from "../billing-webhook.provider";

export async function quoteStillAcceptable(
  snapshot: Prisma.InstitutionalBillingSnapshotGetPayload<
    Record<string, never>
  >,
  event: ParsedBillingWebhookEvent,
  client: Prisma.TransactionClient | typeof prisma,
): Promise<boolean> {
  const paidAt = event.occurredAt ?? new Date();
  if (
    snapshot.kind !== InstitutionalSnapshotKind.QUOTE ||
    snapshot.pricingVersion !== INSTITUTIONAL_PRICING_VERSION ||
    !snapshot.expiresAt ||
    snapshot.expiresAt <= paidAt
  ) {
    return false;
  }
  const [policy, supersedingQuote] = await Promise.all([
    client.institutionalBillingPolicy.findUnique({
      where: { orgId: snapshot.orgId },
    }),
    client.institutionalBillingSnapshot.findFirst({
      where: { orgId: snapshot.orgId, supersedesId: snapshot.id },
      select: { id: true },
    }),
  ]);
  if (
    !policy ||
    supersedingQuote ||
    policy.pricingVersion !== snapshot.pricingVersion
  ) {
    return false;
  }
  if (snapshot.countSource === InstitutionalCountSource.DECLARED) {
    return (
      policy.declaredChildren === snapshot.enrolledChildren &&
      !!policy.declaredAt &&
      policy.declaredAt <= snapshot.createdAt
    );
  }
  if (
    snapshot.countSource !== InstitutionalCountSource.VERIFIED ||
    !snapshot.sourceConfirmationId ||
    !snapshot.sourceRevisionCutoff
  ) {
    return false;
  }
  const [latestConfirmation, laterRevision] = await Promise.all([
    client.enrolmentRollConfirmation.findFirst({
      where: { orgId: snapshot.orgId },
      orderBy: [{ revisionCutoff: "desc" }, { id: "desc" }],
      select: { id: true },
    }),
    client.enrolmentRevision.findFirst({
      where: {
        orgId: snapshot.orgId,
        recordedAt: { gt: snapshot.sourceRevisionCutoff },
      },
      select: { id: true },
    }),
  ]);
  return (
    latestConfirmation?.id === snapshot.sourceConfirmationId && !laterRevision
  );
}
