import {
  calculateDeclaredCapacityQuote,
  declaredCapacityIntervalFromPlanCode,
  declaredCapacityPlanCode,
  isDeclaredCapacityPlanCode,
  DECLARED_CAPACITY_PRICING_VERSION,
  calculateInstitutionalQuote,
  INSTITUTIONAL_CHILD_PRICE_CODES,
  INSTITUTIONAL_MAPPED_PRICING_VERSION,
  INSTITUTIONAL_PRICING_VERSION,
} from "@pathway/pricing";
import { z } from "zod";
import {
  declaredCapacityAddonPriceCode,
  isDeclaredCapacityAddonModule,
} from "./declared-capacity-addons";
import { quoteFromFrozenInstitutionalPrices } from "./institutional-frozen-pricing";
import { isInstitutionalPlanCode } from "./institutional-selection";
import { institutionalStripePriceId } from "./institutional-stripe-prices";

export type PricedInstitutionalSnapshot = Readonly<{
  planCode: string;
  pricingVersion: string;
  enrolledChildren: number | null;
  declaredCapacity?: number | null;
  subtotalPence: number | null;
  includedModules: readonly string[];
  paidModules: readonly string[];
  lines?: unknown;
}>;

const declaredCapacityLineSchema = z.object({
  component: z.enum(["BASE", "DECLARED_CAPACITY", "ADDON"]),
  priceCode: z.string(),
  priceId: z.string().regex(/^price_[A-Za-z0-9]+$/),
  currency: z.literal("GBP"),
  quantity: z.number().int().nonnegative().safe(),
  unitAmountPence: z.number().int().positive().safe(),
  subtotalPence: z.number().int().nonnegative().safe(),
});

export type InstitutionalStripeItem = Readonly<{
  price: string;
  quantity: number;
}>;

/** Validate frozen V2 amounts; retain V1 recalculation only for historical snapshots. */
export function stripeItemsForSnapshot(
  snapshot: PricedInstitutionalSnapshot,
  priceMap: Readonly<Record<string, string | undefined>>,
): InstitutionalStripeItem[] {
  if (snapshot.pricingVersion === DECLARED_CAPACITY_PRICING_VERSION) {
    if (
      !isDeclaredCapacityPlanCode(snapshot.planCode) ||
      snapshot.declaredCapacity === null ||
      snapshot.declaredCapacity === undefined ||
      snapshot.subtotalPence === null
    ) {
      throw new Error("INVALID_INSTITUTIONAL_SNAPSHOT");
    }
    const interval = declaredCapacityIntervalFromPlanCode(snapshot.planCode);
    const quote = calculateDeclaredCapacityQuote({
      declaredCapacity: snapshot.declaredCapacity,
      interval,
    });
    if (
      quote.kind !== "priced" ||
      declaredCapacityPlanCode(quote.tier, interval) !== snapshot.planCode
    ) {
      throw new Error("INVALID_INSTITUTIONAL_SNAPSHOT");
    }
    const frozenLines = z
      .array(declaredCapacityLineSchema)
      .safeParse(snapshot.lines);
    if (
      !frozenLines.success ||
      frozenLines.data.length !==
        quote.lines.length + snapshot.paidModules.length ||
      new Set(
        frozenLines.data
          .filter((line) => line.quantity > 0)
          .map((line) => line.priceId),
      ).size !== frozenLines.data.filter((line) => line.quantity > 0).length ||
      new Set(frozenLines.data.map((line) => line.priceCode)).size !==
        frozenLines.data.length ||
      new Set(snapshot.paidModules).size !== snapshot.paidModules.length ||
      frozenLines.data.some(
        (line) =>
          !Number.isSafeInteger(line.quantity * line.unitAmountPence) ||
          line.subtotalPence !== line.quantity * line.unitAmountPence,
      ) ||
      quote.lines.some((expected, index) => {
        const frozen = frozenLines.data[index];
        return (
          frozen.component !== expected.component ||
          frozen.priceCode !== expected.priceCode ||
          frozen.quantity !== expected.quantity ||
          frozen.unitAmountPence !== expected.unitAmountPence ||
          frozen.subtotalPence !== expected.subtotalPence
        );
      }) ||
      !snapshot.paidModules.every((module) => {
        if (!isDeclaredCapacityAddonModule(module)) return false;
        return frozenLines.data.some(
          (line) =>
            line.component === "ADDON" &&
            line.priceCode ===
              declaredCapacityAddonPriceCode(module, interval) &&
            line.quantity === 1,
        );
      }) ||
      frozenLines.data.filter((line) => line.component === "ADDON").length !==
        snapshot.paidModules.length ||
      frozenLines.data.reduce((sum, line) => sum + line.subtotalPence, 0) !==
        snapshot.subtotalPence
    ) {
      throw new Error("INVALID_INSTITUTIONAL_SNAPSHOT");
    }
    return frozenLines.data
      .filter((line) => line.quantity > 0)
      .map((line) => ({ price: line.priceId, quantity: line.quantity }));
  }
  if (snapshot.pricingVersion === INSTITUTIONAL_MAPPED_PRICING_VERSION) {
    if (snapshot.enrolledChildren === null) {
      throw new Error("INVALID_INSTITUTIONAL_SNAPSHOT");
    }
    let quote;
    try {
      quote = quoteFromFrozenInstitutionalPrices(
        snapshot,
        snapshot.enrolledChildren,
      );
    } catch {
      throw new Error("INVALID_INSTITUTIONAL_SNAPSHOT");
    }
    if (quote.kind !== "priced")
      throw new Error("INVALID_INSTITUTIONAL_SNAPSHOT");
    return quote.lines
      .filter((line) => line.quantity > 0)
      .map((line) => ({ price: line.priceId, quantity: line.quantity }));
  }
  if (
    snapshot.pricingVersion !== INSTITUTIONAL_PRICING_VERSION ||
    !isInstitutionalPlanCode(snapshot.planCode) ||
    snapshot.enrolledChildren === null ||
    snapshot.subtotalPence === null
  ) {
    throw new Error("INVALID_INSTITUTIONAL_SNAPSHOT");
  }
  const priced = calculateInstitutionalQuote({
    planCode: snapshot.planCode,
    enrolledChildren: snapshot.enrolledChildren,
    pricingVersion: INSTITUTIONAL_PRICING_VERSION,
  });
  if (
    priced.kind !== "priced" ||
    priced.subtotalPence !== snapshot.subtotalPence
  ) {
    throw new Error("INVALID_INSTITUTIONAL_SNAPSHOT");
  }
  const items = priced.lines.map((line) => {
    const code =
      line.component === "BASE"
        ? priced.planCode
        : line.component === "CHILDREN_UP_TO_100"
          ? INSTITUTIONAL_CHILD_PRICE_CODES.upTo100
          : INSTITUTIONAL_CHILD_PRICE_CODES.from101To250;
    return {
      price: institutionalStripePriceId(code, priceMap),
      quantity: line.quantity,
    };
  });
  for (const module of snapshot.paidModules) {
    const price = priceMap[`MODULE_${module}_MONTHLY`];
    if (!price || !/^price_[A-Za-z0-9]+$/.test(price)) {
      throw new Error(`MISSING_INSTITUTIONAL_MODULE_PRICE:${module}`);
    }
    items.push({ price, quantity: 1 });
  }
  return items;
}
