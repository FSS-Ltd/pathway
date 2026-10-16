export const DECLARED_CAPACITY_PRICING_VERSION =
  "DECLARED_CAPACITY_V2" as const;

export type DeclaredCapacityInterval = "month" | "year";

export type DeclaredCapacityTier =
  | "starter"
  | "growth"
  | "professional"
  | "enterprise";

type SelfServiceTier = Exclude<DeclaredCapacityTier, "enterprise">;
const NO_INCLUDED_PAID_MODULES: readonly never[] = Object.freeze([]);
export const DECLARED_CAPACITY_MAX_SELF_SERVICE_CAPACITY = 250;

type SelfServicePlan = Readonly<{
  tier: SelfServiceTier;
  minimumCapacity: number;
  siteAllowance: number;
  trialModuleSlots: number;
  includedPaidModules: readonly never[];
}>;

export type DeclaredCapacityPlan = SelfServicePlan;

export const DECLARED_CAPACITY_PLANS: Readonly<
  Record<SelfServiceTier, SelfServicePlan>
> = Object.freeze({
  starter: Object.freeze({
    tier: "starter",
    minimumCapacity: 0,
    siteAllowance: 1,
    trialModuleSlots: 2,
    includedPaidModules: NO_INCLUDED_PAID_MODULES,
  }),
  growth: Object.freeze({
    tier: "growth",
    minimumCapacity: 75,
    siteAllowance: 2,
    trialModuleSlots: 3,
    includedPaidModules: NO_INCLUDED_PAID_MODULES,
  }),
  professional: Object.freeze({
    tier: "professional",
    minimumCapacity: 150,
    siteAllowance: 5,
    trialModuleSlots: 4,
    includedPaidModules: NO_INCLUDED_PAID_MODULES,
  }),
});

export type DeclaredCapacityQuoteInput = Readonly<{
  declaredCapacity: number;
  interval: DeclaredCapacityInterval;
}>;

export type DeclaredCapacityQuoteLine = Readonly<{
  component: "BASE" | "DECLARED_CAPACITY";
  priceCode:
    | "DECLARED_CAPACITY_BASE_MONTHLY"
    | "DECLARED_CAPACITY_BASE_YEARLY"
    | "DECLARED_CAPACITY_CHILD_MONTHLY"
    | "DECLARED_CAPACITY_CHILD_YEARLY";
  quantity: number;
  unitAmountPence: number;
  subtotalPence: number;
}>;

export type DeclaredCapacityPlanCode =
  | "DECLARED_CAPACITY_STARTER_MONTHLY"
  | "DECLARED_CAPACITY_STARTER_YEARLY"
  | "DECLARED_CAPACITY_GROWTH_MONTHLY"
  | "DECLARED_CAPACITY_GROWTH_YEARLY"
  | "DECLARED_CAPACITY_PROFESSIONAL_MONTHLY"
  | "DECLARED_CAPACITY_PROFESSIONAL_YEARLY";

export const DECLARED_CAPACITY_PLAN_CODES: readonly DeclaredCapacityPlanCode[] =
  [
    "DECLARED_CAPACITY_STARTER_MONTHLY",
    "DECLARED_CAPACITY_STARTER_YEARLY",
    "DECLARED_CAPACITY_GROWTH_MONTHLY",
    "DECLARED_CAPACITY_GROWTH_YEARLY",
    "DECLARED_CAPACITY_PROFESSIONAL_MONTHLY",
    "DECLARED_CAPACITY_PROFESSIONAL_YEARLY",
  ];
const declaredCapacityPlanCodeSet: ReadonlySet<string> = new Set(
  DECLARED_CAPACITY_PLAN_CODES,
);

export const DECLARED_CAPACITY_PRICE_CODES = [
  "DECLARED_CAPACITY_BASE_MONTHLY",
  "DECLARED_CAPACITY_BASE_YEARLY",
  "DECLARED_CAPACITY_CHILD_MONTHLY",
  "DECLARED_CAPACITY_CHILD_YEARLY",
] as const;
export type DeclaredCapacityPriceCode =
  (typeof DECLARED_CAPACITY_PRICE_CODES)[number];
export type DeclaredCapacityResolvedPrices = Readonly<
  Partial<
    Record<
      DeclaredCapacityPriceCode,
      { priceId: string; unitAmountPence: number }
    >
  >
>;

type DeclaredCapacityQuoteBase = Readonly<{
  pricingVersion: typeof DECLARED_CAPACITY_PRICING_VERSION;
  tier: DeclaredCapacityTier;
  declaredCapacity: number;
  interval: DeclaredCapacityInterval;
}>;

export type DeclaredCapacityQuoteResult =
  | (DeclaredCapacityQuoteBase &
      Readonly<{
        kind: "priced";
        tier: SelfServiceTier;
        currency: "GBP";
        siteAllowance: number;
        trialModuleSlots: number;
        includedPaidModules: readonly never[];
        lines: readonly DeclaredCapacityQuoteLine[];
        totalPence: number;
      }>)
  | (DeclaredCapacityQuoteBase &
      Readonly<{
        kind: "contact_sales";
        tier: "enterprise";
        siteAllowance: null;
        contactPath: "/demo?plan=enterprise";
      }>);

export type DeclaredCapacityPricingInputErrorCode =
  | "INVALID_COUNT"
  | "INVALID_INTERVAL";

export class DeclaredCapacityPricingInputError extends Error {
  constructor(readonly code: DeclaredCapacityPricingInputErrorCode) {
    super(code);
    this.name = "DeclaredCapacityPricingInputError";
  }
}

function assertDeclaredCapacity(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DeclaredCapacityPricingInputError("INVALID_COUNT");
  }
}

function tierForCapacity(capacity: number): DeclaredCapacityTier {
  if (capacity < DECLARED_CAPACITY_PLANS.growth.minimumCapacity) {
    return "starter";
  }
  if (capacity < DECLARED_CAPACITY_PLANS.professional.minimumCapacity) {
    return "growth";
  }
  if (capacity <= DECLARED_CAPACITY_MAX_SELF_SERVICE_CAPACITY) {
    return "professional";
  }
  return "enterprise";
}

function baseUnitAmountPence(interval: DeclaredCapacityInterval): number {
  return interval === "year" ? 74_000 : 7_400;
}

function capacityUnitAmountPence(interval: DeclaredCapacityInterval): number {
  return interval === "year" ? 1_000 : 100;
}

export function isDeclaredCapacityPlanCode(
  value: string,
): value is DeclaredCapacityPlanCode {
  return declaredCapacityPlanCodeSet.has(value);
}

const planCodesByTierAndInterval: Readonly<
  Record<
    Exclude<DeclaredCapacityTier, "enterprise">,
    Record<DeclaredCapacityInterval, DeclaredCapacityPlanCode>
  >
> = {
  starter: {
    month: "DECLARED_CAPACITY_STARTER_MONTHLY",
    year: "DECLARED_CAPACITY_STARTER_YEARLY",
  },
  growth: {
    month: "DECLARED_CAPACITY_GROWTH_MONTHLY",
    year: "DECLARED_CAPACITY_GROWTH_YEARLY",
  },
  professional: {
    month: "DECLARED_CAPACITY_PROFESSIONAL_MONTHLY",
    year: "DECLARED_CAPACITY_PROFESSIONAL_YEARLY",
  },
};

export function declaredCapacityPlanCode(
  tier: Exclude<DeclaredCapacityTier, "enterprise">,
  interval: DeclaredCapacityInterval,
): DeclaredCapacityPlanCode {
  return planCodesByTierAndInterval[tier][interval];
}

export function declaredCapacityIntervalFromPlanCode(
  planCode: DeclaredCapacityPlanCode,
): DeclaredCapacityInterval {
  return planCode.endsWith("_YEARLY") ? "year" : "month";
}

export function calculateDeclaredCapacityQuote(
  input: DeclaredCapacityQuoteInput,
): DeclaredCapacityQuoteResult {
  if (typeof input !== "object" || input === null) {
    throw new DeclaredCapacityPricingInputError("INVALID_COUNT");
  }
  assertDeclaredCapacity(input.declaredCapacity);
  if (input.interval !== "month" && input.interval !== "year") {
    throw new DeclaredCapacityPricingInputError("INVALID_INTERVAL");
  }

  const tier = tierForCapacity(input.declaredCapacity);
  const common = {
    pricingVersion: DECLARED_CAPACITY_PRICING_VERSION,
    declaredCapacity: input.declaredCapacity,
    interval: input.interval,
  };

  if (tier === "enterprise") {
    return {
      kind: "contact_sales",
      ...common,
      tier: "enterprise",
      siteAllowance: null,
      contactPath: "/demo?plan=enterprise",
    };
  }

  const plan = DECLARED_CAPACITY_PLANS[tier];
  const baseAmountPence = baseUnitAmountPence(input.interval);
  const capacityAmountPence = capacityUnitAmountPence(input.interval);
  const lines: readonly DeclaredCapacityQuoteLine[] = [
    {
      component: "BASE",
      priceCode:
        input.interval === "year"
          ? "DECLARED_CAPACITY_BASE_YEARLY"
          : "DECLARED_CAPACITY_BASE_MONTHLY",
      quantity: 1,
      unitAmountPence: baseAmountPence,
      subtotalPence: baseAmountPence,
    },
    {
      component: "DECLARED_CAPACITY",
      priceCode:
        input.interval === "year"
          ? "DECLARED_CAPACITY_CHILD_YEARLY"
          : "DECLARED_CAPACITY_CHILD_MONTHLY",
      quantity: input.declaredCapacity,
      unitAmountPence: capacityAmountPence,
      subtotalPence: input.declaredCapacity * capacityAmountPence,
    },
  ];

  return {
    kind: "priced",
    ...common,
    tier,
    currency: "GBP",
    siteAllowance: plan.siteAllowance,
    trialModuleSlots: plan.trialModuleSlots,
    includedPaidModules: plan.includedPaidModules,
    lines,
    totalPence: lines.reduce((total, line) => total + line.subtotalPence, 0),
  };
}
