export type WebModule =
  | "FINANCE"
  | "EVENTS"
  | "TRANSPORT"
  | "MEALS"
  | "ASSET_MANAGEMENT"
  | "HR"
  | "AI_WORKSPACE"
  | "ADVANCED_REPORTING"
  | "LEARNING";

export type ModulePriceCode = `MODULE_${WebModule}_${"MONTHLY" | "YEARLY"}`;

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
