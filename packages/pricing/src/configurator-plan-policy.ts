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

export type ConfiguratorModuleCode = (typeof CONFIGURATOR_MODULE_CODES)[number];

// Learning is a core platform capability. Keep its historical code readable,
// while excluding it from every optional-module allowance and new purchase.
const OPTIONAL_MODULE_CODES = Object.freeze(
  CONFIGURATOR_MODULE_CODES.filter((code) => code !== "LEARNING"),
);

// Product launch gate. Modules remain in the catalogue for display and legacy
// order decoding, but none may be newly selected until their offering is ready.
const READY_OPTIONAL_MODULES: ReadonlySet<ConfiguratorModuleCode> = new Set();

export function isConfiguratorModuleReady(
  module: ConfiguratorModuleCode,
): boolean {
  return READY_OPTIONAL_MODULES.has(module);
}

export interface ConfiguratorPlanPolicy {
  outcome: "checkout" | "contact";
  includedModuleLimit: number;
  eligibleOptionalModules: readonly ConfiguratorModuleCode[];
  /** Modules bundled before customer-selected allowances were introduced. */
  legacyIncludedModules: readonly ConfiguratorModuleCode[];
  contactPath?: string;
}

const NO_MODULES = Object.freeze([] as ConfiguratorModuleCode[]);

function freezePolicy(policy: ConfiguratorPlanPolicy): ConfiguratorPlanPolicy {
  return Object.freeze({
    ...policy,
    eligibleOptionalModules: Object.freeze([...policy.eligibleOptionalModules]),
    legacyIncludedModules: Object.freeze([...policy.legacyIncludedModules]),
  });
}

const STARTER_POLICY = freezePolicy({
  outcome: "checkout",
  includedModuleLimit: 0,
  eligibleOptionalModules: OPTIONAL_MODULE_CODES,
  legacyIncludedModules: NO_MODULES,
});

const GROWTH_POLICY = freezePolicy({
  outcome: "checkout",
  includedModuleLimit: 3,
  eligibleOptionalModules: OPTIONAL_MODULE_CODES,
  legacyIncludedModules: ["FINANCE", "EVENTS", "ADVANCED_REPORTING"],
});

const PROFESSIONAL_POLICY = freezePolicy({
  outcome: "checkout",
  includedModuleLimit: 6,
  eligibleOptionalModules: OPTIONAL_MODULE_CODES,
  legacyIncludedModules: [
    "FINANCE",
    "EVENTS",
    "ADVANCED_REPORTING",
    "HR",
    "ASSET_MANAGEMENT",
    "AI_WORKSPACE",
  ],
});

const ENTERPRISE_POLICY = freezePolicy({
  outcome: "contact",
  includedModuleLimit: 0,
  eligibleOptionalModules: NO_MODULES,
  legacyIncludedModules: NO_MODULES,
  contactPath: "/demo?plan=enterprise",
});

export const LEGACY_PLAN_CODES = [
  "CORE_MONTHLY",
  "CORE_YEARLY",
  "MINIMUM_MONTHLY",
  "MINIMUM_YEARLY",
  "STARTER_MONTHLY",
  "STARTER_YEARLY",
  "GROWTH_MONTHLY",
  "GROWTH_YEARLY",
] as const;

const CONFIGURATOR_PLAN_POLICIES: Readonly<
  Record<string, ConfiguratorPlanPolicy>
> = Object.freeze({
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
  return Object.hasOwn(CONFIGURATOR_PLAN_POLICIES, planCode)
    ? CONFIGURATOR_PLAN_POLICIES[planCode]
    : undefined;
}
