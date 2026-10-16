import { InstitutionalSnapshotStatus, Prisma } from "@pathway/db";
import type { ParsedBillingWebhookEvent } from "../billing-webhook.provider";
import { z } from "zod";

const prorationLineSchema = z.object({
  priceId: z.string().regex(/^price_[A-Za-z0-9]+$/),
  quantity: z.number().int().nullable(),
  amountPence: z.number().int(),
});

export function capacityUpgradeInvoiceMatches(
  event: ParsedBillingWebhookEvent,
  snapshot: Pick<
    Prisma.InstitutionalBillingSnapshotGetPayload<Record<string, never>>,
    "prorationLines" | "status" | "amountDueNowPence"
  >,
): boolean {
  const invoice = event.invoice;
  const expected = z
    .array(prorationLineSchema)
    .safeParse(snapshot.prorationLines);
  if (
    !invoice ||
    !expected.success ||
    expected.data.length === 0 ||
    !invoice.linesComplete ||
    invoice.currency !== "gbp" ||
    invoice.status !== (event.kind === "invoice.draft" ? "draft" : "paid") ||
    invoice.amountDuePence !== snapshot.amountDueNowPence ||
    snapshot.status !== InstitutionalSnapshotStatus.PRICED ||
    snapshot.amountDueNowPence === null
  ) {
    return false;
  }

  const actual = invoice.lines
    .filter((line) => line.proration === true)
    .map((line) => ({
      priceId: line.priceId,
      quantity: line.quantity,
      amountPence: line.amountPence,
    }));
  const normalize = (
    lines: Array<{
      priceId: string | null;
      quantity: number | null;
      amountPence: number;
    }>,
  ): string[] =>
    lines
      .map((line) =>
        JSON.stringify([line.priceId, line.quantity, line.amountPence]),
      )
      .sort();
  const expectedLines = expected.data.map((line) => ({
    priceId: line.priceId,
    quantity: line.quantity,
    amountPence: line.amountPence,
  }));
  return normalize(actual).join("|") === normalize(expectedLines).join("|");
}
