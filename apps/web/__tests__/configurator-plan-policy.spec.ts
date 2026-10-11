import {
  CONFIGURATOR_MODULE_CODES,
  getConfiguratorPlanPolicy,
} from "@pathway/pricing";

const allModules = [
  "FINANCE",
  "EVENTS",
  "TRANSPORT",
  "MEALS",
  "ASSET_MANAGEMENT",
  "HR",
  "AI_WORKSPACE",
  "ADVANCED_REPORTING",
  "LEARNING",
] as const;

describe("configurator plan policy", () => {
  it("publishes the complete eligible module catalogue as an immutable list", () => {
    expect(CONFIGURATOR_MODULE_CODES).toEqual(allModules);
    expect(Object.isFrozen(CONFIGURATOR_MODULE_CODES)).toBe(true);
  });

  it.each(["STARTER_49_MONTHLY", "STARTER_49_YEARLY"])(
    "%s has no included allowance and exposes every module as optional",
    (planCode) => {
      expect(getConfiguratorPlanPolicy(planCode)).toMatchObject({
        outcome: "checkout",
        includedModuleLimit: 0,
        eligibleOptionalModules: allModules,
      });
    },
  );

  it.each(["GROWTH_99_MONTHLY", "GROWTH_99_YEARLY"])(
    "%s allows three customer-chosen included modules and paid extras",
    (planCode) => {
      expect(getConfiguratorPlanPolicy(planCode)).toMatchObject({
        outcome: "checkout",
        includedModuleLimit: 3,
        eligibleOptionalModules: allModules,
        legacyIncludedModules: ["FINANCE", "EVENTS", "ADVANCED_REPORTING"],
      });
    },
  );

  it.each(["PROFESSIONAL_149_MONTHLY", "PROFESSIONAL_149_YEARLY"])(
    "%s allows six customer-chosen included modules and paid extras",
    (planCode) => {
      expect(getConfiguratorPlanPolicy(planCode)).toMatchObject({
        outcome: "checkout",
        includedModuleLimit: 6,
        eligibleOptionalModules: allModules,
        legacyIncludedModules: [
          "FINANCE",
          "EVENTS",
          "ADVANCED_REPORTING",
          "HR",
          "ASSET_MANAGEMENT",
          "AI_WORKSPACE",
        ],
      });
    },
  );

  it("routes Enterprise plans to contact without modules", () => {
    expect(getConfiguratorPlanPolicy("ENTERPRISE_CONTACT")).toEqual({
      outcome: "contact",
      includedModuleLimit: 0,
      eligibleOptionalModules: [],
      legacyIncludedModules: [],
      contactPath: "/demo?plan=enterprise",
    });
  });

  it.each([
    "CORE_MONTHLY",
    "CORE_YEARLY",
    "MINIMUM_MONTHLY",
    "MINIMUM_YEARLY",
    "STARTER_MONTHLY",
    "STARTER_YEARLY",
    "GROWTH_MONTHLY",
    "GROWTH_YEARLY",
  ])("preserves %s as a no-bundle legacy checkout plan", (planCode) => {
    expect(getConfiguratorPlanPolicy(planCode)).toEqual({
      outcome: "checkout",
      includedModuleLimit: 0,
      eligibleOptionalModules: allModules,
      legacyIncludedModules: [],
    });
  });

  it.each(["UNKNOWN_PLAN", "toString", "constructor"])(
    "returns undefined for unknown plan code %s",
    (planCode) => {
      expect(getConfiguratorPlanPolicy(planCode)).toBeUndefined();
    },
  );

  it.each([
    "STARTER_49_MONTHLY",
    "GROWTH_99_MONTHLY",
    "PROFESSIONAL_149_MONTHLY",
    "ENTERPRISE_CONTACT",
    "CORE_MONTHLY",
  ])("keeps %s policy and eligible modules immutable", (planCode) => {
    const policy = getConfiguratorPlanPolicy(planCode);

    expect(policy).toBeDefined();
    expect(Object.isFrozen(policy)).toBe(true);
    expect(Object.isFrozen(policy!.eligibleOptionalModules)).toBe(true);
    expect(Object.isFrozen(policy!.legacyIncludedModules)).toBe(true);
  });
});
