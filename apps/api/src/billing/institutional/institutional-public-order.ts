import { createHash } from "node:crypto";
import {
  INSTITUTIONAL_MAPPED_PRICING_VERSION,
  type InstitutionalMappedQuote,
} from "@pathway/pricing";
import type { ParsedBillingWebhookEvent } from "../billing-webhook.provider";
import { Module } from "@pathway/db";
import { quoteFromFrozenInstitutionalPrices } from "./institutional-frozen-pricing";
import { z } from "zod";

const priceLineSchema = z.object({
  component: z.enum([
    "BASE",
    "CHILDREN_UP_TO_100",
    "CHILDREN_101_TO_250",
    "STORAGE",
  ]),
  priceCode: z.string(),
  priceId: z.string().regex(/^price_[A-Za-z0-9]+$/),
  currency: z.literal("GBP"),
  quantity: z.number().int().nonnegative().safe(),
  unitAmountPence: z.number().int().positive().safe(),
  subtotalPence: z.number().int().nonnegative().safe(),
});

const publicOrderSchema = z.object({
  purchaseKind: z.literal("institutional_public"),
  quote: z.object({
    kind: z.literal("priced"),
    pricingVersion: z.literal(INSTITUTIONAL_MAPPED_PRICING_VERSION),
    planCode: z.string(),
    enrolledChildren: z.number().int().nonnegative().safe(),
    includedChildren: z.number().int().nonnegative().safe(),
    storageChoice: z.enum(["none", "100", "200", "1000"]),
    currency: z.literal("GBP"),
    interval: z.enum(["month", "year"]),
    lines: z.array(priceLineSchema),
    subtotalPence: z.number().int().nonnegative().safe(),
  }),
  includedModules: z.array(z.nativeEnum(Module)),
  paidModules: z.array(z.nativeEnum(Module)),
  setting: z.enum([
    "INDEPENDENT_SCHOOL",
    "ACE_SCHOOL",
    "STATE_SCHOOL",
    "NURSERY",
  ]),
  requestFingerprint: z.string().length(64),
});

export type PublicInstitutionalOrder = z.infer<typeof publicOrderSchema>;

export function parsePublicInstitutionalOrder(
  value: unknown,
): PublicInstitutionalOrder | null {
  const parsed = publicOrderSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function publicInstitutionalOrderId(idempotencyKey: string): string {
  const hex = createHash("sha256")
    .update(`institutional-public:${idempotencyKey}`)
    .digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function publicInstitutionalFingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function publicInstitutionalInvoiceMatches(
  event: ParsedBillingWebhookEvent,
  quote:
    | Extract<InstitutionalMappedQuote, { kind: "priced" }>
    | PublicInstitutionalOrder["quote"],
): boolean {
  const invoice = event.invoice;
  try {
    const frozen = quoteFromFrozenInstitutionalPrices(
      quote,
      quote.enrolledChildren,
    );
    if (frozen.kind !== "priced") return false;
  } catch {
    return false;
  }
  if (
    (event.kind !== "invoice.paid" && event.kind !== "invoice.draft") ||
    !invoice ||
    invoice.status !== (event.kind === "invoice.paid" ? "paid" : "draft") ||
    invoice.currency !== "gbp" ||
    !invoice.linesComplete ||
    invoice.lines.length !==
      quote.lines.filter((line) => line.quantity > 0).length
  )
    return false;
  const expected = new Map(
    quote.lines
      .filter((line) => line.quantity > 0)
      .map((line) => [line.priceId, line]),
  );
  let total = 0;
  for (const line of invoice.lines) {
    if (!line.priceId) return false;
    const matched = expected.get(line.priceId);
    if (
      !matched ||
      line.quantity !== matched.quantity ||
      line.amountPence !== matched.subtotalPence
    )
      return false;
    total += line.amountPence;
    expected.delete(line.priceId);
  }
  return expected.size === 0 && total === quote.subtotalPence;
}
