import { VERTICAL_OPTIONS, type Vertical } from "@pathway/types";
import type { PlanCode } from "../lib/buy-now-pricing";
import {
  firstIncompleteStep,
  INITIAL_CONFIGURATOR_STATE,
  nextStep,
  prevStep,
  progressStepsForOrgType,
  verticalsForOrgType,
  type ConfiguratorState,
  type OrgType,
} from "../app/configure/state";

const ORG_VERTICALS: Record<OrgType, Vertical[]> = {
  SCHOOL: ["INDEPENDENT_SCHOOL", "ACE_SCHOOL", "STATE_SCHOOL"],
  CHURCH: ["CHURCH"],
  CHARITY: ["CHARITY"],
  CLUB: ["CLUB"],
  NURSERY: ["NURSERY"],
};

const completeState = (
  overrides: Partial<ConfiguratorState> = {},
): ConfiguratorState => ({
  ...INITIAL_CONFIGURATOR_STATE,
  step: "modules",
  orgType: "CHURCH",
  vertical: "CHURCH",
  selectedModules: ["FINANCE"],
  planCode: "STARTER_49_MONTHLY" as PlanCode,
  frequency: "yearly",
  storageChoice: "200",
  ...overrides,
});

describe("configurator state", () => {
  it("maps every organisation type to its exact verticals and partitions all vertical options", () => {
    expect(Object.keys(ORG_VERTICALS).sort()).toEqual([
      "CHARITY",
      "CHURCH",
      "CLUB",
      "NURSERY",
      "SCHOOL",
    ]);

    for (const [orgType, verticals] of Object.entries(ORG_VERTICALS) as [
      OrgType,
      Vertical[],
    ][]) {
      expect(verticalsForOrgType(orgType)).toEqual(verticals);
    }

    expect(Object.values(ORG_VERTICALS).flat().sort()).toEqual(
      VERTICAL_OPTIONS.map(({ value }) => value).sort(),
    );
  });

  it("advances School to vertical without an automatic selection", () => {
    const next = nextStep({ ...INITIAL_CONFIGURATOR_STATE, orgType: "SCHOOL" });

    expect(next.step).toBe("vertical");
    expect(next.vertical).toBeNull();
  });

  it.each([
    ["CHURCH", "CHURCH"],
    ["CHARITY", "CHARITY"],
    ["CLUB", "CLUB"],
    ["NURSERY", "NURSERY"],
  ] as const)("auto-resolves %s to %s before included", (orgType, vertical) => {
    const next = nextStep({ ...INITIAL_CONFIGURATOR_STATE, orgType });

    expect(next).toMatchObject({ step: "included", vertical });
  });

  it("preserves selections through traversal and returns included to the relevant prior step", () => {
    const schoolIncluded = completeState({
      step: "included",
      orgType: "SCHOOL",
      vertical: "ACE_SCHOOL",
    });
    const churchIncluded = completeState({ step: "included" });

    expect(nextStep(churchIncluded)).toMatchObject({
      step: "modules",
      selectedModules: ["FINANCE"],
      planCode: "STARTER_49_MONTHLY",
      frequency: "yearly",
      storageChoice: "200",
    });
    expect(prevStep(schoolIncluded)).toEqual({
      ...schoolIncluded,
      step: "vertical",
    });
    expect(prevStep(churchIncluded)).toEqual({
      ...churchIncluded,
      step: "org-type",
    });
  });

  it("blocks forward progress until organisation, vertical, and plan selections are present", () => {
    expect(nextStep(INITIAL_CONFIGURATOR_STATE)).toEqual(
      INITIAL_CONFIGURATOR_STATE,
    );
    expect(
      nextStep({
        ...INITIAL_CONFIGURATOR_STATE,
        step: "vertical",
        orgType: "SCHOOL",
      }),
    ).toMatchObject({ step: "vertical" });
    expect(
      nextStep(
        completeState({
          step: "plan",
          planCode: null,
        }),
      ),
    ).toMatchObject({ step: "plan" });
  });

  it("guards missing prerequisites before rendering or navigating", () => {
    const missingVertical = completeState({
      step: "plan",
      orgType: "SCHOOL",
      vertical: null,
    });
    const missingPlan = completeState({ step: "summary", planCode: null });

    expect(firstIncompleteStep(missingVertical)).toBe("vertical");
    expect(firstIncompleteStep(missingPlan)).toBe("plan");
    expect(nextStep(missingVertical).step).toBe("vertical");
    expect(prevStep(missingPlan).step).toBe("plan");
  });

  it("uses six progress steps for unknown and School organisations, five for auto-resolved organisations, and never includes summary", () => {
    const schoolSteps = progressStepsForOrgType("SCHOOL");
    const unknownSteps = progressStepsForOrgType(null);
    const churchSteps = progressStepsForOrgType("CHURCH");

    expect(schoolSteps).toHaveLength(6);
    expect(unknownSteps).toHaveLength(6);
    expect(churchSteps).toHaveLength(5);
    expect(schoolSteps).toContain("vertical");
    expect(unknownSteps).toContain("vertical");
    expect(churchSteps).not.toContain("vertical");
    expect([...schoolSteps, ...unknownSteps, ...churchSteps]).not.toContain(
      "summary",
    );
  });
});
