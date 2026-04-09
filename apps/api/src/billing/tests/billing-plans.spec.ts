import {
  PLAN_CATALOGUE,
  type PlanCode,
  getPlanDefinition,
} from "../billing-plans";

describe("billing-plans catalogue", () => {
  const allPlanCodes: PlanCode[] = [
    "CORE_MONTHLY",
    "CORE_YEARLY",
    "STARTER_MONTHLY",
    "STARTER_YEARLY",
    "GROWTH_MONTHLY",
    "GROWTH_YEARLY",
    "ENTERPRISE_CONTACT",
  ];

  it("returns definitions for each known plan code", () => {
    allPlanCodes.forEach((code) => {
      const definition = getPlanDefinition(code);
      expect(definition).toBeTruthy();
      expect(definition?.code).toBe(code);
      expect(definition?.tier).toBe(
        code.startsWith("CORE")
          ? "core"
          : code.startsWith("STARTER")
          ? "starter"
          : code.startsWith("GROWTH")
            ? "growth"
            : "enterprise",
      );
      expect(definition?.selfServe).toBe(
        code === "ENTERPRISE_CONTACT" ? false : true,
      );
    });
  });

  it("has AV30 included for self-serve plans per Option A spec", () => {
    expect(getPlanDefinition("CORE_MONTHLY")?.av30Included).toBe(15);
    expect(getPlanDefinition("CORE_YEARLY")?.av30Included).toBe(15);
    expect(getPlanDefinition("STARTER_MONTHLY")?.av30Included).toBe(50);
    expect(getPlanDefinition("STARTER_YEARLY")?.av30Included).toBe(50);
    expect(getPlanDefinition("GROWTH_MONTHLY")?.av30Included).toBe(200);
    expect(getPlanDefinition("GROWTH_YEARLY")?.av30Included).toBe(200);
    expect(getPlanDefinition("ENTERPRISE_CONTACT")?.av30Included).toBeNull();
  });

  it("returns null for unknown plan codes", () => {
    expect(getPlanDefinition("UNKNOWN_PLAN_CODE")).toBeNull();
    expect(getPlanDefinition(null)).toBeNull();
    expect(getPlanDefinition(undefined)).toBeNull();
  });

  it("includes expected site caps from catalogue", () => {
    expect(getPlanDefinition("CORE_MONTHLY")?.maxSitesIncluded).toBe(1);
    expect(getPlanDefinition("STARTER_MONTHLY")?.maxSitesIncluded).toBe(1);
    expect(getPlanDefinition("GROWTH_MONTHLY")?.maxSitesIncluded).toBe(3);
    expect(getPlanDefinition("ENTERPRISE_CONTACT")?.maxSitesIncluded).toBeNull();
  });

  it("exposes the catalogue entries with display names", () => {
    const starter = PLAN_CATALOGUE.STARTER_MONTHLY;
    expect(starter.displayName).toBe("Starter");
  });

  it("includes core max children and starter-like class behaviour", () => {
    expect(getPlanDefinition("CORE_MONTHLY")?.maxChildrenIncluded).toBe(50);
    expect(getPlanDefinition("CORE_MONTHLY")?.maxActiveClasses).toBeNull();
  });
});
