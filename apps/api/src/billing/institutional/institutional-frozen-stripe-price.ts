import { z } from "zod";

const lineSchema = z.object({
  priceId: z.string(),
  currency: z.literal("GBP"),
  unitAmountPence: z.number().int().positive(),
});

type ProviderPrice = Readonly<{
  id: string;
  active: boolean;
  livemode: boolean;
  currency: string;
  unit_amount: number | null;
  recurring: null | {
    interval: string;
    interval_count: number;
    usage_type: string;
  };
}>;

/** Check the accepted, frozen quote rather than a mutable price map. */
export function validateFrozenStripePrice(
  price: ProviderPrice,
  snapshot: { planCode: string; lines: unknown },
  priceId: string,
  live: boolean,
): void {
  const parsed = z.array(lineSchema).safeParse(snapshot.lines);
  const line = parsed.success
    ? parsed.data.find((entry) => entry.priceId === priceId)
    : undefined;
  const interval = snapshot.planCode.endsWith("_YEARLY") ? "year" : "month";
  if (
    !line ||
    price.id !== priceId ||
    !price.active ||
    price.livemode !== live ||
    price.currency !== "gbp" ||
    price.unit_amount !== line.unitAmountPence ||
    price.recurring?.interval !== interval ||
    price.recurring.interval_count !== 1 ||
    price.recurring.usage_type !== "licensed"
  ) {
    throw new Error("INSTITUTIONAL_PRICE_CHANGED");
  }
}
