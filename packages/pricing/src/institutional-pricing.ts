export const INSTITUTIONAL_PRICING_VERSION = "ENROLLED_CHILDREN_V1" as const;
export const INSTITUTIONAL_BILLING_METRIC = "ENROLLED_CHILDREN" as const;

export type InstitutionalPlanCode =
  | "INSTITUTIONAL_STARTER_MONTHLY"
  | "INSTITUTIONAL_GROWTH_MONTHLY"
  | "INSTITUTIONAL_PROFESSIONAL_MONTHLY";

export type InstitutionalPriceComponent =
  | "BASE"
  | "CHILDREN_UP_TO_100"
  | "CHILDREN_101_TO_250";

export const INSTITUTIONAL_CHILD_PRICE_CODES = Object.freeze({
  upTo100: "INSTITUTIONAL_CHILD_UP_TO_100_MONTHLY",
  from101To250: "INSTITUTIONAL_CHILD_101_TO_250_MONTHLY",
} as const);

export type InstitutionalPlanDefinition = Readonly<{
  code: InstitutionalPlanCode;
  tier: "starter" | "growth" | "professional";
  interval: "month";
  billingMetric: typeof INSTITUTIONAL_BILLING_METRIC;
  pricingVersion: typeof INSTITUTIONAL_PRICING_VERSION;
  basePence: number;
  includedChildren: number;
  includedModuleSlots: number;
  includedSites: number;
  checkoutEnabled: false;
}>;

export const INSTITUTIONAL_PLANS: Readonly<
  Record<InstitutionalPlanCode, InstitutionalPlanDefinition>
> = Object.freeze({
  INSTITUTIONAL_STARTER_MONTHLY: Object.freeze({
    code: "INSTITUTIONAL_STARTER_MONTHLY",
    tier: "starter",
    interval: "month",
    billingMetric: INSTITUTIONAL_BILLING_METRIC,
    pricingVersion: INSTITUTIONAL_PRICING_VERSION,
    basePence: 4_900,
    includedChildren: 25,
    includedModuleSlots: 0,
    includedSites: 1,
    checkoutEnabled: false,
  }),
  INSTITUTIONAL_GROWTH_MONTHLY: Object.freeze({
    code: "INSTITUTIONAL_GROWTH_MONTHLY",
    tier: "growth",
    interval: "month",
    billingMetric: INSTITUTIONAL_BILLING_METRIC,
    pricingVersion: INSTITUTIONAL_PRICING_VERSION,
    basePence: 9_900,
    includedChildren: 75,
    includedModuleSlots: 3,
    includedSites: 2,
    checkoutEnabled: false,
  }),
  INSTITUTIONAL_PROFESSIONAL_MONTHLY: Object.freeze({
    code: "INSTITUTIONAL_PROFESSIONAL_MONTHLY",
    tier: "professional",
    interval: "month",
    billingMetric: INSTITUTIONAL_BILLING_METRIC,
    pricingVersion: INSTITUTIONAL_PRICING_VERSION,
    basePence: 14_900,
    includedChildren: 100,
    includedModuleSlots: 6,
    includedSites: 5,
    checkoutEnabled: false,
  }),
});

export type InstitutionalQuoteInput = {
  planCode: InstitutionalPlanCode;
  enrolledChildren: number;
  pricingVersion: typeof INSTITUTIONAL_PRICING_VERSION;
};

export type InstitutionalQuoteLine = {
  component: InstitutionalPriceComponent;
  quantity: number;
  unitAmountPence: number;
  subtotalPence: number;
};

export type InstitutionalQuoteResult =
  | {
      kind: "priced";
      currency: "GBP";
      interval: "month";
      billingMetric: typeof INSTITUTIONAL_BILLING_METRIC;
      pricingVersion: typeof INSTITUTIONAL_PRICING_VERSION;
      planCode: InstitutionalPlanCode;
      enrolledChildren: number;
      includedChildren: number;
      lines: InstitutionalQuoteLine[];
      subtotalPence: number;
    }
  | {
      kind: "contact_sales";
      pricingVersion: typeof INSTITUTIONAL_PRICING_VERSION;
      planCode: InstitutionalPlanCode;
      enrolledChildren: number;
      reason: "OVER_250_CHILDREN";
    };

export type InstitutionalPricingInputErrorCode =
  | "INVALID_PLAN"
  | "INVALID_PRICING_VERSION"
  | "INVALID_COUNT";

export class InstitutionalPricingInputError extends Error {
  constructor(readonly code: InstitutionalPricingInputErrorCode) {
    super(code);
    this.name = "InstitutionalPricingInputError";
  }
}

export function calculateInstitutionalQuote(
  input: InstitutionalQuoteInput,
): InstitutionalQuoteResult {
  if (!input || !Object.hasOwn(INSTITUTIONAL_PLANS, input.planCode)) {
    throw new InstitutionalPricingInputError("INVALID_PLAN");
  }
  if (input.pricingVersion !== INSTITUTIONAL_PRICING_VERSION) {
    throw new InstitutionalPricingInputError("INVALID_PRICING_VERSION");
  }
  if (
    !Number.isSafeInteger(input.enrolledChildren) ||
    input.enrolledChildren < 0
  ) {
    throw new InstitutionalPricingInputError("INVALID_COUNT");
  }
  if (input.enrolledChildren > 250) {
    return {
      kind: "contact_sales",
      pricingVersion: INSTITUTIONAL_PRICING_VERSION,
      planCode: input.planCode,
      enrolledChildren: input.enrolledChildren,
      reason: "OVER_250_CHILDREN",
    };
  }

  const plan = INSTITUTIONAL_PLANS[input.planCode];
  const firstBandQuantity = Math.max(
    0,
    Math.min(input.enrolledChildren, 100) - plan.includedChildren,
  );
  const secondBandQuantity = Math.max(0, input.enrolledChildren - 100);
  const lines: InstitutionalQuoteLine[] = [
    {
      component: "BASE",
      quantity: 1,
      unitAmountPence: plan.basePence,
      subtotalPence: plan.basePence,
    },
  ];
  if (firstBandQuantity > 0) {
    lines.push({
      component: "CHILDREN_UP_TO_100",
      quantity: firstBandQuantity,
      unitAmountPence: 100,
      subtotalPence: firstBandQuantity * 100,
    });
  }
  if (secondBandQuantity > 0) {
    lines.push({
      component: "CHILDREN_101_TO_250",
      quantity: secondBandQuantity,
      unitAmountPence: 75,
      subtotalPence: secondBandQuantity * 75,
    });
  }
  return {
    kind: "priced",
    currency: "GBP",
    interval: "month",
    billingMetric: INSTITUTIONAL_BILLING_METRIC,
    pricingVersion: INSTITUTIONAL_PRICING_VERSION,
    planCode: input.planCode,
    enrolledChildren: input.enrolledChildren,
    includedChildren: plan.includedChildren,
    lines,
    subtotalPence: lines.reduce((sum, line) => sum + line.subtotalPence, 0),
  };
}
