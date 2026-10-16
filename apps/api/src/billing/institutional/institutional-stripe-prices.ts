import {
  DECLARED_CAPACITY_PRICE_CODES,
  INSTITUTIONAL_CHILD_PRICE_CODES,
  INSTITUTIONAL_PLANS,
  type DeclaredCapacityPriceCode,
  type InstitutionalPlanCode,
} from "@pathway/pricing";

export type InstitutionalStripePriceCode =
  | InstitutionalPlanCode
  | (typeof INSTITUTIONAL_CHILD_PRICE_CODES)[keyof typeof INSTITUTIONAL_CHILD_PRICE_CODES]
  | DeclaredCapacityPriceCode;

export type InstitutionalStripePriceSpec = Readonly<{
  code: InstitutionalStripePriceCode;
  productName: string;
  unitAmountPence: number;
  interval: "month" | "year";
}>;

export const INSTITUTIONAL_STRIPE_PRICE_SPECS: readonly InstitutionalStripePriceSpec[] =
  [
    {
      code: "INSTITUTIONAL_STARTER_MONTHLY",
      productName: "NexSteps Starter",
      unitAmountPence:
        INSTITUTIONAL_PLANS.INSTITUTIONAL_STARTER_MONTHLY.basePence,
      interval: "month",
    },
    {
      code: "INSTITUTIONAL_GROWTH_MONTHLY",
      productName: "NexSteps Growth",
      unitAmountPence:
        INSTITUTIONAL_PLANS.INSTITUTIONAL_GROWTH_MONTHLY.basePence,
      interval: "month",
    },
    {
      code: "INSTITUTIONAL_PROFESSIONAL_MONTHLY",
      productName: "NexSteps Professional",
      unitAmountPence:
        INSTITUTIONAL_PLANS.INSTITUTIONAL_PROFESSIONAL_MONTHLY.basePence,
      interval: "month",
    },
    {
      code: INSTITUTIONAL_CHILD_PRICE_CODES.upTo100,
      productName: "NexSteps additional enrolled children (to 100)",
      unitAmountPence: 100,
      interval: "month",
    },
    {
      code: INSTITUTIONAL_CHILD_PRICE_CODES.from101To250,
      productName: "NexSteps additional enrolled children (101–250)",
      unitAmountPence: 75,
      interval: "month",
    },
    {
      code: DECLARED_CAPACITY_PRICE_CODES[0],
      productName: "NexSteps declared-capacity subscription base (monthly)",
      unitAmountPence: 7_400,
      interval: "month",
    },
    {
      code: DECLARED_CAPACITY_PRICE_CODES[1],
      productName: "NexSteps declared-capacity subscription base (annual)",
      unitAmountPence: 74_000,
      interval: "year",
    },
    {
      code: DECLARED_CAPACITY_PRICE_CODES[2],
      productName: "NexSteps declared-capacity child (monthly)",
      unitAmountPence: 100,
      interval: "month",
    },
    {
      code: DECLARED_CAPACITY_PRICE_CODES[3],
      productName: "NexSteps declared-capacity child (annual)",
      unitAmountPence: 1_000,
      interval: "year",
    },
  ];

export type InstitutionalStripePriceTerms = Readonly<{
  active: boolean;
  currency: string;
  livemode: boolean;
  product: string | { id: string };
  recurring: null | {
    interval: string;
    interval_count: number;
    usage_type: string;
  };
  unit_amount: number | null;
}>;

export function validateInstitutionalStripePrice(
  price: InstitutionalStripePriceTerms,
  productId: string,
  spec: InstitutionalStripePriceSpec,
): void {
  const actualProductId =
    typeof price.product === "string" ? price.product : price.product.id;
  if (
    !price.active ||
    price.livemode ||
    actualProductId !== productId ||
    price.currency !== "gbp" ||
    price.unit_amount !== spec.unitAmountPence ||
    price.recurring?.interval !== spec.interval ||
    price.recurring.interval_count !== 1 ||
    price.recurring.usage_type !== "licensed"
  ) {
    throw new Error(`INVALID_INSTITUTIONAL_PRICE:${spec.code}`);
  }
}

export function institutionalStripePriceId(
  code: InstitutionalStripePriceCode,
  priceMap: Readonly<Record<string, string | undefined>>,
): string {
  const priceId = priceMap[code];
  if (!priceId || !/^price_[A-Za-z0-9]+$/.test(priceId)) {
    throw new Error(`MISSING_INSTITUTIONAL_PRICE:${code}`);
  }
  return priceId;
}
