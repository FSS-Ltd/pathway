import { VERTICAL_OPTIONS, type Vertical } from "@pathway/types";
import {
  configuredModulesForState,
  firstIncompleteStep,
  includedModulesForState,
  INITIAL_CONFIGURATOR_STATE,
  nextStep,
  prevStep,
  progressStepsForOrgType,
  selectFrequency,
  selectOrgType,
  selectPlan,
  selectVertical,
  toggleModule,
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

const PRICES = {
  MODULE_LEARNING_MONTHLY: { amountMajor: 29 },
  MODULE_LEARNING_YEARLY: { amountMajor: 290 },
  MODULE_FINANCE_MONTHLY: { amountMajor: 19 },
};

const completeState = (
  overrides: Partial<ConfiguratorState> = {},
): ConfiguratorState => ({
  ...INITIAL_CONFIGURATOR_STATE,
  step: "modules",
  orgType: "CHURCH",
  vertical: "CHURCH",
  selectedOptionalModules: ["LEARNING"],
  planCode: "STARTER_49_MONTHLY",
  frequency: "monthly",
  storageChoice: "200",
  ...overrides,
});

describe("configurator state", () => {
  it("maps every organisation type to its exact verticals", () => {
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

  it("starts at Plan and makes it the first progress step", () => {
    expect(INITIAL_CONFIGURATOR_STATE.step).toBe("plan");
    expect(progressStepsForOrgType(null)[0]).toBe("plan");
  });

  it("keeps progress lengths, conditionally shows School setting, and excludes summary", () => {
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

  it("requires a School setting but assigns sole verticals when organisation is selected", () => {
    const school = selectOrgType(
      { ...INITIAL_CONFIGURATOR_STATE, vertical: "CHURCH" },
      "SCHOOL",
    );
    expect(school.vertical).toBeNull();
    expect(selectVertical(school, "ACE_SCHOOL").vertical).toBe("ACE_SCHOOL");

    for (const [orgType, vertical] of [
      ["CHURCH", "CHURCH"],
      ["CHARITY", "CHARITY"],
      ["CLUB", "CLUB"],
      ["NURSERY", "NURSERY"],
    ] as const) {
      expect(selectOrgType(INITIAL_CONFIGURATOR_STATE, orgType).vertical).toBe(
        vertical,
      );
    }
  });

  it("uses the plan-first order and guards missing prerequisites", () => {
    expect(nextStep(INITIAL_CONFIGURATOR_STATE)).toEqual(
      INITIAL_CONFIGURATOR_STATE,
    );
    const planSelected = selectPlan(
      INITIAL_CONFIGURATOR_STATE,
      "STARTER_49_MONTHLY",
      PRICES,
    );
    expect(nextStep({ ...planSelected, step: "org-type" })).toEqual({
      ...planSelected,
      step: "org-type",
    });
    expect(nextStep(planSelected).step).toBe("org-type");
    expect(
      nextStep({ ...planSelected, step: "org-type", orgType: "SCHOOL" }).step,
    ).toBe("vertical");
    expect(firstIncompleteStep({ ...completeState(), planCode: null })).toBe(
      "plan",
    );
    expect(prevStep({ ...completeState(), step: "summary" }).step).toBe(
      "storage",
    );
  });

  it("keeps the current selection step visible until Continue advances it", () => {
    const organisationStep = {
      ...selectPlan(
        INITIAL_CONFIGURATOR_STATE,
        "STARTER_49_MONTHLY",
        PRICES,
      ),
      step: "org-type" as const,
    };
    const school = selectOrgType(organisationStep, "SCHOOL");

    expect(firstIncompleteStep(school)).toBe("org-type");

    const settingStep = nextStep(school);
    expect(settingStep.step).toBe("vertical");

    const selectedSetting = selectVertical(
      settingStep,
      "INDEPENDENT_SCHOOL",
    );
    expect(firstIncompleteStep(selectedSetting)).toBe("vertical");
    expect(nextStep(selectedSetting).step).toBe("included");
  });

  it("stores only eligible live-priced optional modules", () => {
    const growth = selectPlan(
      INITIAL_CONFIGURATOR_STATE,
      "GROWTH_99_MONTHLY",
      PRICES,
    );
    expect(includedModulesForState(growth)).toEqual([
      "FINANCE",
      "EVENTS",
      "ADVANCED_REPORTING",
    ]);
    expect(toggleModule(growth, "FINANCE", PRICES)).toBe(growth);
    expect(toggleModule(growth, "TRANSPORT", PRICES)).toBe(growth);
    expect(
      toggleModule(growth, "LEARNING", PRICES).selectedOptionalModules,
    ).toEqual(["LEARNING"]);
  });

  it("reconciles optionals safely across plan and frequency changes", () => {
    const growth = {
      ...selectPlan(INITIAL_CONFIGURATOR_STATE, "GROWTH_99_MONTHLY", PRICES),
      selectedOptionalModules: ["LEARNING", "FINANCE"],
    };
    const yearly = selectFrequency(growth, "yearly", PRICES);
    expect(yearly.selectedOptionalModules).toEqual(["LEARNING"]);

    expect(
      selectPlan(yearly, "STARTER_49_YEARLY", PRICES).selectedOptionalModules,
    ).toEqual(["LEARNING"]);
    expect(
      selectPlan(
        { ...growth, selectedOptionalModules: ["FINANCE"] },
        "STARTER_49_MONTHLY",
        PRICES,
      ).selectedOptionalModules,
    ).toEqual([]);
  });

  it("returns a deduplicated included and optional module union", () => {
    const state = completeState({
      planCode: "GROWTH_99_MONTHLY",
      selectedOptionalModules: ["LEARNING", "FINANCE"],
    });
    expect(configuredModulesForState(state)).toEqual([
      "FINANCE",
      "EVENTS",
      "ADVANCED_REPORTING",
      "LEARNING",
    ]);
  });
});
