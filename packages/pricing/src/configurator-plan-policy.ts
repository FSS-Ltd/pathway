export const CONFIGURATOR_MODULE_CODES = Object.freeze([
  "FINANCE",
  "EVENTS",
  "TRANSPORT",
  "MEALS",
  "ASSET_MANAGEMENT",
  "HR",
  "AI_WORKSPACE",
  "ADVANCED_REPORTING",
  "LEARNING",
] as const);

export type ConfiguratorModuleCode =
  (typeof CONFIGURATOR_MODULE_CODES)[number];

export interface ConfiguratorPlanPolicy {
  outcome: "checkout" | "contact";
  includedModules: readonly ConfiguratorModuleCode[];
  eligibleOptionalModules: readonly ConfiguratorModuleCode[];
  contactPath?: string;
}

const NO_MODULES = Object.freeze([] as ConfiguratorModuleCode[]);

const GROWTH_INCLUDED_MODULES = Object.freeze([
  "FINANCE",
  "EVENTS",
  "ADVANCED_REPORTING",
] as const);

const PROFESSIONAL_INCLUDED_MODULES = Object.freeze([
  "FINANCE",
  "EVENTS",
  "ADVANCED_REPORTING",
  "HR",
  "ASSET_MANAGEMENT",
  "AI_WORKSPACE",
] as const);

function optionalModulesExcluding(
  includedModules: readonly ConfiguratorModuleCode[],
): readonly ConfiguratorModuleCode[] {
  return Object.freeze(
    CONFIGURATOR_MODULE_CODES.filter(
      (moduleCode) => !includedModules.includes(moduleCode),
    ),
  );
}

const STARTER_POLICY: ConfiguratorPlanPolicy = {
  outcome: "checkout",
  includedModules: NO_MODULES,
  eligibleOptionalModules: CONFIGURATOR_MODULE_CODES,
};

const GROWTH_POLICY: ConfiguratorPlanPolicy = {
  outcome: "checkout",
  includedModules: GROWTH_INCLUDED_MODULES,
  eligibleOptionalModules: optionalModulesExcluding(GROWTH_INCLUDED_MODULES),
};

const PROFESSIONAL_POLICY: ConfiguratorPlanPolicy = {
  outcome: "checkout",
  includedModules: PROFESSIONAL_INCLUDED_MODULES,
  eligibleOptionalModules: optionalModulesExcluding(
    PROFESSIONAL_INCLUDED_MODULES,
  ),
};

const ENTERPRISE_POLICY: ConfiguratorPlanPolicy = {
  outcome: "contact",
  includedModules: NO_MODULES,
  eligibleOptionalModules: NO_MODULES,
  contactPath: "/demo?plan=enterprise",
};

const LEGACY_PLAN_CODES = [
  "CORE_MONTHLY",
  "CORE_YEARLY",
  "MINIMUM_MONTHLY",
  "MINIMUM_YEARLY",
  "STARTER_MONTHLY",
  "STARTER_YEARLY",
  "GROWTH_MONTHLY",
  "GROWTH_YEARLY",
] as const;

const CONFIGURATOR_PLAN_POLICIES: Readonly<Record<string, ConfiguratorPlanPolicy>> =
  Object.freeze({
    STARTER_49_MONTHLY: STARTER_POLICY,
    STARTER_49_YEARLY: STARTER_POLICY,
    GROWTH_99_MONTHLY: GROWTH_POLICY,
    GROWTH_99_YEARLY: GROWTH_POLICY,
    PROFESSIONAL_149_MONTHLY: PROFESSIONAL_POLICY,
    PROFESSIONAL_149_YEARLY: PROFESSIONAL_POLICY,
    ENTERPRISE_CONTACT: ENTERPRISE_POLICY,
    ...Object.fromEntries(
      LEGACY_PLAN_CODES.map((planCode) => [planCode, STARTER_POLICY]),
    ),
  });

export function getConfiguratorPlanPolicy(
  planCode: string,
): ConfiguratorPlanPolicy | undefined {
  return CONFIGURATOR_PLAN_POLICIES[planCode];
}
