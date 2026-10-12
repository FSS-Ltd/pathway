import {
  InstitutionalSnapshotKind,
  InstitutionalSnapshotStatus,
  type Prisma,
} from "@pathway/db";

type AcceptedQuote = Prisma.InstitutionalBillingSnapshotGetPayload<{
  include: { acceptance: true };
}>;

type CheckoutOrder = Pick<
  Prisma.PendingOrderGetPayload<Record<string, never>>,
  "createdAt" | "institutionalSnapshotId" | "institutionalCheckoutKey" | "orgId"
>;

/** A valid checkout fixes the accepted price; payment may arrive after quote expiry. */
export function quoteWasAcceptedForCheckout(
  snapshot: AcceptedQuote,
  order: CheckoutOrder,
): boolean {
  return (
    snapshot.kind === InstitutionalSnapshotKind.QUOTE &&
    snapshot.status === InstitutionalSnapshotStatus.PRICED &&
    snapshot.orgId === order.orgId &&
    snapshot.id === order.institutionalSnapshotId &&
    !!order.institutionalCheckoutKey &&
    !!snapshot.acceptance &&
    snapshot.acceptance.acceptedAt <= order.createdAt &&
    !!snapshot.expiresAt &&
    order.createdAt < snapshot.expiresAt
  );
}
