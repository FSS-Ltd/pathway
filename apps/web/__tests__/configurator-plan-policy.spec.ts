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
    "%s includes no modules and exposes every module as optional",
    (planCode) => {
      expect(getConfiguratorPlanPolicy(planCode)).toMatchObject({
        outcome: "checkout",
        includedModules: [],
        eligibleOptionalModules: allModules,
      });
    },
  );

  it.each(["GROWTH_99_MONTHLY", "GROWTH_99_YEARLY"])(
    "%s includes the Growth module bundle",
    (planCode) => {
      expect(getConfiguratorPlanPolicy(planCode)).toMatchObject({
        outcome: "checkout",
        includedModules: ["FINANCE", "EVENTS", "ADVANCED_REPORTING"],
        eligibleOptionalModules: [
          "TRANSPORT",
          "MEALS",
          "ASSET_MANAGEMENT",
          "HR",
          "AI_WORKSPACE",
          "LEARNING",
        ],
      });
    },
  );

  it.each(["PROFESSIONAL_149_MONTHLY", "PROFESSIONAL_149_YEARLY"])(
    "%s includes the Professional module bundle",
    (planCode) => {
      expect(getConfiguratorPlanPolicy(planCode)).toMatchObject({
        outcome: "checkout",
        includedModules: [
          "FINANCE",
          "EVENTS",
          "ADVANCED_REPORTING",
          "HR",
          "ASSET_MANAGEMENT",
          "AI_WORKSPACE",
        ],
        eligibleOptionalModules: ["TRANSPORT", "MEALS", "LEARNING"],
      });
    },
  );

  it("routes Enterprise plans to contact without modules", () => {
    expect(getConfiguratorPlanPolicy("ENTERPRISE_CONTACT")).toEqual({
      outcome: "contact",
      includedModules: [],
      eligibleOptionalModules: [],
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
      includedModules: [],
      eligibleOptionalModules: allModules,
    });
  });

  it("returns undefined for an unknown plan code", () => {
    expect(getConfiguratorPlanPolicy("UNKNOWN_PLAN")).toBeUndefined();
  });

  it.each([
    "STARTER_49_MONTHLY",
    "GROWTH_99_MONTHLY",
    "PROFESSIONAL_149_MONTHLY",
    "ENTERPRISE_CONTACT",
    "CORE_MONTHLY",
  ])("keeps %s included and optional modules disjoint and immutable", (planCode) => {
    const policy = getConfiguratorPlanPolicy(planCode);

    expect(policy).toBeDefined();
    expect(Object.isFrozen(policy!.includedModules)).toBe(true);
    expect(Object.isFrozen(policy!.eligibleOptionalModules)).toBe(true);
    expect(
      policy!.includedModules.some((module) =>
        policy!.eligibleOptionalModules.includes(module),
      ),
    ).toBe(false);
  });
});
