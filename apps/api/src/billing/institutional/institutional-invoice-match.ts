import { InstitutionalSnapshotStatus, Prisma } from "@pathway/db";
import type { ParsedBillingWebhookEvent } from "../billing-webhook.provider";
import { INSTITUTIONAL_STRIPE_PRICE_SPECS } from "./institutional-stripe-prices";
import { stripeItemsForSnapshot } from "./institutional-stripe-line-items";

export function invoiceMatchesSnapshot(
  event: ParsedBillingWebhookEvent,
  snapshot: Prisma.InstitutionalBillingSnapshotGetPayload<
    Record<string, never>
  >,
  priceMap: Readonly<Record<string, string | undefined>>,
): boolean {
  const invoice = event.invoice;
  if (
    !invoice ||
    !invoice.linesComplete ||
    invoice.currency !== "gbp" ||
    invoice.status !== (event.kind === "invoice.draft" ? "draft" : "paid") ||
    snapshot.status !== InstitutionalSnapshotStatus.PRICED ||
    snapshot.subtotalPence === null ||
    snapshot.paidModules.length !== 0
  ) {
    return false;
  }
  try {
    const expected = stripeItemsForSnapshot(snapshot, priceMap);
    const expectedQuantities = new Map(
      expected.map((item) => [item.price, item.quantity]),
    );
    const knownInstitutionalIds = new Set(
      INSTITUTIONAL_STRIPE_PRICE_SPECS.map(
        (spec) => priceMap[spec.code],
      ).filter((id): id is string => typeof id === "string"),
    );
    for (const item of expected) knownInstitutionalIds.add(item.price);
    const actualQuantities = new Map<string, number>();
    let actualSubtotal = 0;
    for (const line of invoice.lines) {
      if (!line.priceId || !knownInstitutionalIds.has(line.priceId)) continue;
      if (
        line.quantity === null ||
        !Number.isSafeInteger(line.quantity) ||
        line.quantity < 1
      ) {
        return false;
      }
      actualQuantities.set(
        line.priceId,
        (actualQuantities.get(line.priceId) ?? 0) + line.quantity,
      );
      actualSubtotal += line.amountPence;
    }
    return (
      actualSubtotal === snapshot.subtotalPence &&
      actualQuantities.size === expectedQuantities.size &&
      [...expectedQuantities].every(
        ([id, quantity]) => actualQuantities.get(id) === quantity,
      )
    );
  } catch {
    return false;
  }
}
