import {
  calculateInstitutionalQuote,
  INSTITUTIONAL_CHILD_PRICE_CODES,
  INSTITUTIONAL_PRICING_VERSION,
} from "@pathway/pricing";
import { isInstitutionalPlanCode } from "./institutional-selection";
import { institutionalStripePriceId } from "./institutional-stripe-prices";

export type PricedInstitutionalSnapshot = Readonly<{
  planCode: string;
  pricingVersion: string;
  enrolledChildren: number | null;
  subtotalPence: number | null;
  includedModules: readonly string[];
  paidModules: readonly string[];
}>;

export type InstitutionalStripeItem = Readonly<{
  price: string;
  quantity: number;
}>;

/** Recalculate instead of trusting a mutable price map or arbitrary snapshot JSON. */
export function stripeItemsForSnapshot(
  snapshot: PricedInstitutionalSnapshot,
  priceMap: Readonly<Record<string, string | undefined>>,
): InstitutionalStripeItem[] {
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
