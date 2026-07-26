import { VERTICAL_OPTIONS, type Vertical } from "@pathway/types";
import type { ConfiguratorModuleCode } from "@pathway/pricing";

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

export function verticalImagePath(vertical: Vertical): string {
  const slug = vertical.toLowerCase().replace(/_/g, "-");
  return `/configurator/verticals/${slug}.png`;
}

export const SCHOOL_PREVIEW_VERTICALS = [
  "INDEPENDENT_SCHOOL",
  "ACE_SCHOOL",
  "STATE_SCHOOL",
] as const satisfies readonly Vertical[];

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

export const VERTICAL_FEATURES: Record<Vertical, string[]> = {
  CHURCH: [
    "View attendance",
    "Manage attendance registers",
    "Manage volunteers",
    "Manage giving",
    "View your calendar",
  ],
  INDEPENDENT_SCHOOL: [
    "View attendance",
    "Manage attendance registers",
    "Manage student records",
    "Manage classes",
    "View parent information",
    "View standard reports",
  ],
  ACE_SCHOOL: [
    "View attendance",
    "Manage attendance registers",
    "Manage student records",
    "Manage classes",
    "Manage PACE work",
    "View parent information",
    "View standard reports",
    "View and record learning logs",
    "View and add learning evidence",
    "Generate learning progress reports",
  ],
  STATE_SCHOOL: [
    "View attendance",
    "Manage attendance registers",
    "Manage student records",
    "Manage classes",
    "View parent information",
    "View standard reports",
  ],
  NURSERY: [
    "View attendance",
    "Manage attendance registers",
    "Manage child records",
    "View parent information",
  ],
  CHARITY: [
    "View attendance",
    "Manage attendance registers",
    "Manage volunteers",
    "View your calendar",
  ],
  CLUB: [
    "View attendance",
    "Manage attendance registers",
    "Manage member records",
    "View your calendar",
  ],
};

export type ConfiguratorOption =
  | { kind: "module"; module: WebModule }
  | { kind: "storage"; storageChoice: StorageChoice };

export type StorageChoice = "none" | "100" | "200" | "1000";

export function storageImagePath(
  choice: Exclude<StorageChoice, "none">,
): string {
  const filename = choice === "1000" ? "storage-1tb" : `storage-${choice}gb`;
  return `/configurator/storage/${filename}.png`;
}

export const CONFIGURATOR_IMAGE_PATHS: readonly string[] = [
  ...Object.values(MODULE_CATALOG).map(({ imagePath }) => imagePath),
  ...(["100", "200", "1000"] as const).map(storageImagePath),
  ...VERTICAL_OPTIONS.map(({ value }) => verticalImagePath(value)),
];

export const CONFIGURATOR_BACKDROP_SIZES = "(min-width: 1024px) 44vw, 34vw";
export const CONFIGURATOR_OBJECT_SIZES = "(min-width: 1024px) 128px, 48px";

export function configuratorImageSizes(path: string): string {
  return path.startsWith("/configurator/verticals/")
    ? CONFIGURATOR_BACKDROP_SIZES
    : CONFIGURATOR_OBJECT_SIZES;
}

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
