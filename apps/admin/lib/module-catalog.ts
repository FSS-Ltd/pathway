import type { ConfiguratorModuleCode } from "@pathway/pricing";

// Trimmed copy of apps/web/lib/module-catalog.ts for the admin configurator.
// The admin flow has no org-type/vertical/artwork stage, so vertical imagery
// and image-manifest helpers are omitted.

export type WebModule = ConfiguratorModuleCode;

export type ModulePriceCode = `MODULE_${WebModule}_${"MONTHLY" | "YEARLY"}`;
export type StoragePriceCode =
  | "STORAGE_100GB_MONTHLY"
  | "STORAGE_100GB_YEARLY"
  | "STORAGE_200GB_MONTHLY"
  | "STORAGE_200GB_YEARLY"
  | "STORAGE_1TB_MONTHLY"
  | "STORAGE_1TB_YEARLY";

export type ModuleCatalogEntry = {
  label: string;
  description: string;
  imagePath: string;
  imageAlt: string;
  priceCodes: { monthly: ModulePriceCode; yearly: ModulePriceCode };
};

export function moduleImagePath(module: WebModule): string {
  const slug = module.toLowerCase().replace(/_/g, "-");
  return `/configurator/modules/${slug}.png`;
}

function moduleEntry(
  module: WebModule,
  label: string,
  description: string,
): ModuleCatalogEntry {
  return {
    label,
    description,
    imagePath: moduleImagePath(module),
    imageAlt: `${label} module illustration`,
    priceCodes: {
      monthly: `MODULE_${module}_MONTHLY`,
      yearly: `MODULE_${module}_YEARLY`,
    },
  };
}

export const MODULE_CATALOG: Record<WebModule, ModuleCatalogEntry> = {
  FINANCE: moduleEntry(
    "FINANCE",
    "Finance",
    "Invoices, payments and financial reporting for your organisation.",
  ),
  EVENTS: moduleEntry(
    "EVENTS",
    "Events",
    "Plan, publish and manage sign-ups for services, sessions and events.",
  ),
  TRANSPORT: moduleEntry(
    "TRANSPORT",
    "Transport",
    "Routes, vehicles and passenger lists for trips and daily runs.",
  ),
  MEALS: moduleEntry(
    "MEALS",
    "Meals",
    "Menus, dietary needs and meal counts, planned in one place.",
  ),
  ASSET_MANAGEMENT: moduleEntry(
    "ASSET_MANAGEMENT",
    "Asset Management",
    "Track equipment and resources — what you own, where it is, who has it.",
  ),
  HR: moduleEntry(
    "HR",
    "HR",
    "Staff records, roles and onboarding for your team and volunteers.",
  ),
  AI_WORKSPACE: moduleEntry(
    "AI_WORKSPACE",
    "AI Workspace",
    "Drafting, summarising and admin assistance, built into your workspace.",
  ),
  ADVANCED_REPORTING: moduleEntry(
    "ADVANCED_REPORTING",
    "Advanced Reporting",
    "Deeper analytics, trends and exportable reports across your data.",
  ),
  LEARNING: moduleEntry(
    "LEARNING",
    "Learning",
    "Log learning activity, attach evidence and generate progress reports.",
  ),
};

export type StorageChoice = "none" | "100" | "200" | "1000";

export type ConfiguratorOption =
  | { kind: "module"; module: WebModule }
  | { kind: "storage"; storageChoice: StorageChoice };

export type OptionPriceLookup = Partial<
  Record<ModulePriceCode | StoragePriceCode, { amountMajor: number }>
>;

export type OptionDelta =
  | { status: "included" }
  | { status: "priced"; amountMajor: number }
  | { status: "coming-soon" };

const STORAGE_PRICE_CODES: Record<
  Exclude<StorageChoice, "none">,
  { monthly: StoragePriceCode; yearly: StoragePriceCode }
> = {
  "100": {
    monthly: "STORAGE_100GB_MONTHLY",
    yearly: "STORAGE_100GB_YEARLY",
  },
  "200": {
    monthly: "STORAGE_200GB_MONTHLY",
    yearly: "STORAGE_200GB_YEARLY",
  },
  "1000": {
    monthly: "STORAGE_1TB_MONTHLY",
    yearly: "STORAGE_1TB_YEARLY",
  },
};

export function optionDelta(
  option: ConfiguratorOption,
  frequency: "monthly" | "yearly",
  prices: OptionPriceLookup,
): OptionDelta {
  let priceCode: ModulePriceCode | StoragePriceCode;
  if (option.kind === "module") {
    priceCode = MODULE_CATALOG[option.module].priceCodes[frequency];
  } else {
    if (option.storageChoice === "none") return { status: "included" };
    priceCode = STORAGE_PRICE_CODES[option.storageChoice][frequency];
  }
  const price = prices[priceCode];

  return price
    ? { status: "priced", amountMajor: price.amountMajor }
    : { status: "coming-soon" };
}
