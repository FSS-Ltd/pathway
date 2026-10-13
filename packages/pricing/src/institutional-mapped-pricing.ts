import { INSTITUTIONAL_PLANS } from "./institutional-pricing";

export const INSTITUTIONAL_MAPPED_PRICING_VERSION =
  "ENROLLED_CHILDREN_V2" as const;

export type InstitutionalMappedPlanCode =
  | "INSTITUTIONAL_STARTER_MONTHLY"
  | "INSTITUTIONAL_STARTER_YEARLY"
  | "INSTITUTIONAL_GROWTH_MONTHLY"
  | "INSTITUTIONAL_GROWTH_YEARLY"
  | "INSTITUTIONAL_PROFESSIONAL_MONTHLY"
  | "INSTITUTIONAL_PROFESSIONAL_YEARLY";

export type InstitutionalStorageChoice = "none" | "100" | "200" | "1000";
export type InstitutionalMappedPriceComponent =
  | "BASE"
  | "CHILDREN_UP_TO_100"
  | "CHILDREN_101_TO_250"
  | "STORAGE";

const mappedPlans = {
  INSTITUTIONAL_STARTER_MONTHLY: {
    plan: INSTITUTIONAL_PLANS.INSTITUTIONAL_STARTER_MONTHLY,
    baseCode: "STARTER_49_MONTHLY",
    interval: "month",
  },
  INSTITUTIONAL_STARTER_YEARLY: {
    plan: INSTITUTIONAL_PLANS.INSTITUTIONAL_STARTER_MONTHLY,
    baseCode: "STARTER_49_YEARLY",
    interval: "year",
  },
  INSTITUTIONAL_GROWTH_MONTHLY: {
    plan: INSTITUTIONAL_PLANS.INSTITUTIONAL_GROWTH_MONTHLY,
    baseCode: "GROWTH_99_MONTHLY",
    interval: "month",
  },
  INSTITUTIONAL_GROWTH_YEARLY: {
    plan: INSTITUTIONAL_PLANS.INSTITUTIONAL_GROWTH_MONTHLY,
    baseCode: "GROWTH_99_YEARLY",
    interval: "year",
  },
  INSTITUTIONAL_PROFESSIONAL_MONTHLY: {
    plan: INSTITUTIONAL_PLANS.INSTITUTIONAL_PROFESSIONAL_MONTHLY,
    baseCode: "PROFESSIONAL_149_MONTHLY",
    interval: "month",
  },
  INSTITUTIONAL_PROFESSIONAL_YEARLY: {
    plan: INSTITUTIONAL_PLANS.INSTITUTIONAL_PROFESSIONAL_MONTHLY,
    baseCode: "PROFESSIONAL_149_YEARLY",
    interval: "year",
  },
} as const;

export const INSTITUTIONAL_MAPPED_PLAN_CODES = Object.keys(
  mappedPlans,
) as InstitutionalMappedPlanCode[];

export function isMappedInstitutionalPlanCode(
  value: string,
): value is InstitutionalMappedPlanCode {
  return Object.hasOwn(mappedPlans, value);
}

export function mappedInstitutionalSelectionPlanCode(
  code: InstitutionalMappedPlanCode,
) {
  return mappedPlans[code].plan.code;
}

export function mappedInstitutionalPlanDetails(
  code: InstitutionalMappedPlanCode,
) {
  const mapped = mappedPlans[code];
  return {
    planCode: code,
    tier: mapped.plan.tier,
    interval: mapped.interval,
    includedChildren: mapped.plan.includedChildren,
    includedModuleSlots: mapped.plan.includedModuleSlots,
    includedSites: mapped.plan.includedSites,
  };
}

type PlanPriceCode =
  (typeof mappedPlans)[InstitutionalMappedPlanCode]["baseCode"];
type ChildPriceCode =
  | "INSTITUTIONAL_CHILD_UP_TO_100_MONTHLY"
  | "INSTITUTIONAL_CHILD_UP_TO_100_YEARLY"
  | "INSTITUTIONAL_CHILD_101_TO_250_MONTHLY"
  | "INSTITUTIONAL_CHILD_101_TO_250_YEARLY";
type StoragePriceCode =
  | "STORAGE_100GB_MONTHLY"
  | "STORAGE_100GB_YEARLY"
  | "STORAGE_200GB_MONTHLY"
  | "STORAGE_200GB_YEARLY"
  | "STORAGE_1TB_MONTHLY"
  | "STORAGE_1TB_YEARLY";
export type InstitutionalMappedPriceCode =
  | PlanPriceCode
  | ChildPriceCode
  | StoragePriceCode;

export const INSTITUTIONAL_MAPPED_PRICE_CODES: readonly InstitutionalMappedPriceCode[] =
  [
    "STARTER_49_MONTHLY",
    "STARTER_49_YEARLY",
    "GROWTH_99_MONTHLY",
    "GROWTH_99_YEARLY",
    "PROFESSIONAL_149_MONTHLY",
    "PROFESSIONAL_149_YEARLY",
    "INSTITUTIONAL_CHILD_UP_TO_100_MONTHLY",
    "INSTITUTIONAL_CHILD_UP_TO_100_YEARLY",
    "INSTITUTIONAL_CHILD_101_TO_250_MONTHLY",
    "INSTITUTIONAL_CHILD_101_TO_250_YEARLY",
    "STORAGE_100GB_MONTHLY",
    "STORAGE_100GB_YEARLY",
    "STORAGE_200GB_MONTHLY",
    "STORAGE_200GB_YEARLY",
    "STORAGE_1TB_MONTHLY",
    "STORAGE_1TB_YEARLY",
  ];

export type InstitutionalResolvedPrice = Readonly<{
  priceId: string;
  unitAmountPence: number;
}>;
export type InstitutionalResolvedPrices = Readonly<
  Partial<Record<InstitutionalMappedPriceCode, InstitutionalResolvedPrice>>
>;

export type InstitutionalMappedQuoteLine = Readonly<{
  component: InstitutionalMappedPriceComponent;
  priceCode: InstitutionalMappedPriceCode;
  priceId: string;
  currency: "GBP";
  quantity: number;
  unitAmountPence: number;
  subtotalPence: number;
}>;

export type InstitutionalMappedQuote =
  | Readonly<{
      kind: "priced";
      pricingVersion: typeof INSTITUTIONAL_MAPPED_PRICING_VERSION;
      planCode: InstitutionalMappedPlanCode;
      enrolledChildren: number;
      includedChildren: number;
      storageChoice: InstitutionalStorageChoice;
      currency: "GBP";
      interval: "month" | "year";
      lines: readonly InstitutionalMappedQuoteLine[];
      subtotalPence: number;
    }>
  | Readonly<{
      kind: "contact_sales";
      pricingVersion: typeof INSTITUTIONAL_MAPPED_PRICING_VERSION;
      planCode: InstitutionalMappedPlanCode;
      enrolledChildren: number;
      reason: "OVER_250_CHILDREN";
    }>;

export class InstitutionalMappedPriceError extends Error {
  constructor(
    readonly code:
      | "INVALID_PLAN"
      | "INVALID_COUNT"
      | "INVALID_STORAGE"
      | "MISSING_PRICE",
    readonly priceCode?: InstitutionalMappedPriceCode,
  ) {
    super(priceCode ? `${code}:${priceCode}` : code);
    this.name = "InstitutionalMappedPriceError";
  }
}

const storageCodes = {
  none: null,
  "100": { month: "STORAGE_100GB_MONTHLY", year: "STORAGE_100GB_YEARLY" },
  "200": { month: "STORAGE_200GB_MONTHLY", year: "STORAGE_200GB_YEARLY" },
  "1000": { month: "STORAGE_1TB_MONTHLY", year: "STORAGE_1TB_YEARLY" },
} as const;

const childCodes = {
  month: {
    first: "INSTITUTIONAL_CHILD_UP_TO_100_MONTHLY",
    second: "INSTITUTIONAL_CHILD_101_TO_250_MONTHLY",
  },
  year: {
    first: "INSTITUTIONAL_CHILD_UP_TO_100_YEARLY",
    second: "INSTITUTIONAL_CHILD_101_TO_250_YEARLY",
  },
} as const;

function addLine(
  lines: InstitutionalMappedQuoteLine[],
  component: InstitutionalMappedPriceComponent,
  priceCode: InstitutionalMappedPriceCode,
  quantity: number,
  prices: InstitutionalResolvedPrices,
): void {
  const price = prices[priceCode];
  if (
    !price ||
    !/^price_[A-Za-z0-9]+$/.test(price.priceId) ||
    !Number.isSafeInteger(price.unitAmountPence) ||
    price.unitAmountPence <= 0
  ) {
    throw new InstitutionalMappedPriceError("MISSING_PRICE", priceCode);
  }
  const subtotalPence = quantity * price.unitAmountPence;
  if (!Number.isSafeInteger(subtotalPence)) {
    throw new InstitutionalMappedPriceError("MISSING_PRICE", priceCode);
  }
  lines.push({
    component,
    priceCode,
    priceId: price.priceId,
    currency: "GBP",
    quantity,
    unitAmountPence: price.unitAmountPence,
    subtotalPence,
  });
}

export function calculateMappedInstitutionalQuote(input: {
  planCode: InstitutionalMappedPlanCode;
  enrolledChildren: number;
  storageChoice: InstitutionalStorageChoice;
  prices: InstitutionalResolvedPrices;
}): InstitutionalMappedQuote {
  if (!Object.hasOwn(mappedPlans, input.planCode)) {
    throw new InstitutionalMappedPriceError("INVALID_PLAN");
  }
  if (
    !Number.isSafeInteger(input.enrolledChildren) ||
    input.enrolledChildren < 0
  ) {
    throw new InstitutionalMappedPriceError("INVALID_COUNT");
  }
  if (!Object.hasOwn(storageCodes, input.storageChoice)) {
    throw new InstitutionalMappedPriceError("INVALID_STORAGE");
  }
  if (input.enrolledChildren > 250) {
    return {
      kind: "contact_sales",
      pricingVersion: INSTITUTIONAL_MAPPED_PRICING_VERSION,
      planCode: input.planCode,
      enrolledChildren: input.enrolledChildren,
      reason: "OVER_250_CHILDREN",
    };
  }

  const { plan, baseCode, interval } = mappedPlans[input.planCode];
  const lines: InstitutionalMappedQuoteLine[] = [];
  addLine(lines, "BASE", baseCode, 1, input.prices);
  const firstBand = Math.max(
    0,
    Math.min(input.enrolledChildren, 100) - plan.includedChildren,
  );
  // Preserve both accepted band Price IDs, even at zero quantity, so a later
  // census can change quantities without adopting a changed price map.
  addLine(
    lines,
    "CHILDREN_UP_TO_100",
    childCodes[interval].first,
    firstBand,
    input.prices,
  );
  const secondBand = Math.max(0, input.enrolledChildren - 100);
  addLine(
    lines,
    "CHILDREN_101_TO_250",
    childCodes[interval].second,
    secondBand,
    input.prices,
  );
  const storage = storageCodes[input.storageChoice];
  if (storage) addLine(lines, "STORAGE", storage[interval], 1, input.prices);

  const subtotalPence = lines.reduce(
    (total, line) => total + line.subtotalPence,
    0,
  );
  if (!Number.isSafeInteger(subtotalPence)) {
    throw new InstitutionalMappedPriceError("MISSING_PRICE");
  }
  return {
    kind: "priced",
    pricingVersion: INSTITUTIONAL_MAPPED_PRICING_VERSION,
    planCode: input.planCode,
    enrolledChildren: input.enrolledChildren,
    includedChildren: plan.includedChildren,
    storageChoice: input.storageChoice,
    currency: "GBP",
    interval,
    lines,
    subtotalPence,
  };
}
