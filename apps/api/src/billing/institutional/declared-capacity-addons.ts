import { Module } from "@pathway/db";

export const DECLARED_CAPACITY_ADDON_MODULES = [
  Module.FINANCE,
  Module.EVENTS,
  Module.TRANSPORT,
  Module.MEALS,
  Module.ASSET_MANAGEMENT,
  Module.HR,
  Module.ADVANCED_REPORTING,
  Module.LEARNING,
] as const;

export type DeclaredCapacityAddonModule =
  (typeof DECLARED_CAPACITY_ADDON_MODULES)[number];

export type DeclaredCapacityAddonPriceCode =
  | `MODULE_${DeclaredCapacityAddonModule}_MONTHLY`
  | `MODULE_${DeclaredCapacityAddonModule}_YEARLY`;
const declaredCapacityAddonModuleSet: ReadonlySet<string> = new Set(
  DECLARED_CAPACITY_ADDON_MODULES,
);

export function isDeclaredCapacityAddonModule(
  module: string,
): module is DeclaredCapacityAddonModule {
  return declaredCapacityAddonModuleSet.has(module);
}

export function declaredCapacityAddonPriceCode(
  module: DeclaredCapacityAddonModule,
  interval: "month" | "year",
): DeclaredCapacityAddonPriceCode {
  return `MODULE_${module}_${interval === "year" ? "YEARLY" : "MONTHLY"}`;
}

export function approvedDeclaredCapacityAddonModules(): ReadonlySet<string> {
  return new Set(
    (process.env.DECLARED_CAPACITY_APPROVED_ADDON_MODULES ?? "")
      .split(",")
      .map((module) => module.trim())
      .filter((module) => module.length > 0),
  );
}

export function deliveredDeclaredCapacityAddonModules(): ReadonlySet<string> {
  return new Set(
    (process.env.DECLARED_CAPACITY_DELIVERED_ADDON_MODULES ?? "")
      .split(",")
      .map((module) => module.trim())
      .filter((module) => module.length > 0),
  );
}
