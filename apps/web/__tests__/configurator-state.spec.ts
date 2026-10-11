import { VERTICAL_OPTIONS, type Vertical } from "@pathway/types";
import {
  configuredModulesForState,
  firstIncompleteStep,
  includedModuleLimitForState,
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
  type WebModule,
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
  MODULE_EVENTS_MONTHLY: { amountMajor: 12 },
  MODULE_TRANSPORT_MONTHLY: { amountMajor: 15 },
  MODULE_MEALS_MONTHLY: { amountMajor: 18 },
  MODULE_HR_MONTHLY: { amountMajor: 20 },
  MODULE_ASSET_MANAGEMENT_MONTHLY: { amountMajor: 22 },
  MODULE_AI_WORKSPACE_MONTHLY: { amountMajor: 25 },
  MODULE_ADVANCED_REPORTING_MONTHLY: { amountMajor: 27 },
};

const completeState = (
  overrides: Partial<ConfiguratorState> = {},
): ConfiguratorState => ({
  ...INITIAL_CONFIGURATOR_STATE,
  step: "modules",
  orgType: "CHURCH",
  vertical: "CHURCH",
  selectedOptionalModules: ["LEARNING"],
  selectedIncludedModules: [],
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
    // HOME_EDUCATION is intentionally excluded: it's never selectable through
    // this institutional configurator — NexSteps Home has its own onboarding
    // (docs/NexStepsV2/07-nexsteps-home.md).
    expect(Object.values(ORG_VERTICALS).flat().sort()).toEqual(
      VERTICAL_OPTIONS.map(({ value }) => value)
        .filter((value) => value !== "HOME_EDUCATION")
        .sort(),
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
      ...selectPlan(INITIAL_CONFIGURATOR_STATE, "STARTER_49_MONTHLY", PRICES),
      step: "org-type" as const,
    };
    const school = selectOrgType(organisationStep, "SCHOOL");

    expect(firstIncompleteStep(school)).toBe("org-type");

    const settingStep = nextStep(school);
    expect(settingStep.step).toBe("vertical");

    const selectedSetting = selectVertical(settingStep, "INDEPENDENT_SCHOOL");
    expect(firstIncompleteStep(selectedSetting)).toBe("vertical");
    expect(nextStep(selectedSetting).step).toBe("included");
  });

  it("offers an unpriced module as a free included choice but never as a paid extra", () => {
    const growth = selectPlan(
      INITIAL_CONFIGURATOR_STATE,
      "GROWTH_99_MONTHLY",
      PRICES,
    );
    const five = ["FINANCE", "EVENTS", "TRANSPORT", "MEALS", "HR"].reduce(
      (state, module) => toggleModule(state, module as WebModule, PRICES),
      selectPlan(
        INITIAL_CONFIGURATOR_STATE,
        "PROFESSIONAL_149_MONTHLY",
        PRICES,
      ),
    );

    expect(toggleModule(growth, "HR", PRICES).selectedIncludedModules).toEqual([
      "HR",
    ]);
    const newlyIncluded = toggleModule(five, "AI_WORKSPACE", PRICES);
    expect(newlyIncluded.selectedIncludedModules).toContain("AI_WORKSPACE");
    expect(newlyIncluded.selectedOptionalModules).not.toContain("AI_WORKSPACE");
    const availableIncludedChoice = toggleModule(
      newlyIncluded,
      "ADVANCED_REPORTING",
      PRICES,
    );
    expect(availableIncludedChoice.selectedOptionalModules).toContain(
      "ADVANCED_REPORTING",
    );
    const noIncludedSlots = toggleModule(availableIncludedChoice, "LEARNING", {
      ...PRICES,
      MODULE_AI_WORKSPACE_MONTHLY: { amountMajor: 25 },
      MODULE_ADVANCED_REPORTING_MONTHLY: { amountMajor: 27 },
    });
    const unavailablePaidExtra = toggleModule(
      noIncludedSlots,
      "ASSET_MANAGEMENT",
      {},
    );
    expect(unavailablePaidExtra).toBe(noIncludedSlots);
  });

  it("allows three customer-chosen included Growth modules and prices further choices", () => {
    const growth = selectPlan(
      INITIAL_CONFIGURATOR_STATE,
      "GROWTH_99_MONTHLY",
      PRICES,
    );
    expect(includedModuleLimitForState(growth)).toBe(3);
    const chosen = ["TRANSPORT", "MEALS", "EVENTS", "LEARNING"].reduce(
      (state, module) =>
        toggleModule(
          state,
          module as "TRANSPORT" | "MEALS" | "EVENTS" | "LEARNING",
          PRICES,
        ),
      growth,
    );
    expect(chosen.selectedIncludedModules).toEqual([
      "TRANSPORT",
      "MEALS",
      "EVENTS",
    ]);
    expect(chosen.selectedOptionalModules).toEqual(["LEARNING"]);

    const deselected = toggleModule(chosen, "TRANSPORT", PRICES);
    expect(deselected.selectedIncludedModules).toEqual([
      "MEALS",
      "EVENTS",
      "LEARNING",
    ]);
    expect(deselected.selectedOptionalModules).toEqual([]);
  });

  it("allows six customer-chosen included Professional modules", () => {
    const professional = selectPlan(
      INITIAL_CONFIGURATOR_STATE,
      "PROFESSIONAL_149_MONTHLY",
      PRICES,
    );
    const chosen = [
      "TRANSPORT",
      "MEALS",
      "EVENTS",
      "LEARNING",
      "FINANCE",
      "HR",
      "AI_WORKSPACE",
    ].reduce(
      (state, module) =>
        toggleModule(
          state,
          module as
            | "TRANSPORT"
            | "MEALS"
            | "EVENTS"
            | "LEARNING"
            | "FINANCE"
            | "HR"
            | "AI_WORKSPACE",
          PRICES,
        ),
      professional,
    );
    expect(chosen.selectedIncludedModules).toEqual([
      "TRANSPORT",
      "MEALS",
      "EVENTS",
      "LEARNING",
      "FINANCE",
      "HR",
    ]);
    expect(chosen.selectedOptionalModules).toEqual(["AI_WORKSPACE"]);
  });

  it("reconciles customer-chosen inclusions safely across plan and frequency changes", () => {
    const growth = {
      ...selectPlan(INITIAL_CONFIGURATOR_STATE, "GROWTH_99_MONTHLY", PRICES),
      selectedIncludedModules: ["FINANCE", "EVENTS", "ADVANCED_REPORTING"],
      selectedOptionalModules: ["LEARNING"],
    };
    const yearly = selectFrequency(growth, "yearly", PRICES);
    expect(yearly.selectedIncludedModules).toEqual([
      "FINANCE",
      "EVENTS",
      "ADVANCED_REPORTING",
    ]);
    expect(yearly.selectedOptionalModules).toEqual(["LEARNING"]);

    const starter = selectPlan(yearly, "STARTER_49_YEARLY", {
      ...PRICES,
      MODULE_FINANCE_YEARLY: { amountMajor: 190 },
      MODULE_EVENTS_YEARLY: { amountMajor: 120 },
      MODULE_ADVANCED_REPORTING_YEARLY: { amountMajor: 270 },
    });
    expect(starter.selectedIncludedModules).toEqual([]);
    expect(starter.selectedOptionalModules).toEqual([
      "FINANCE",
      "EVENTS",
      "ADVANCED_REPORTING",
      "LEARNING",
    ]);
  });

  it("moves deselected inclusions into any remaining included slots before charging them", () => {
    const state: ConfiguratorState = {
      ...selectPlan(INITIAL_CONFIGURATOR_STATE, "GROWTH_99_MONTHLY", PRICES),
      selectedIncludedModules: ["FINANCE", "EVENTS", "ADVANCED_REPORTING"],
      selectedOptionalModules: ["LEARNING"],
    };

    const changed = toggleModule(state, "EVENTS", PRICES);

    expect(changed.selectedIncludedModules).toEqual([
      "FINANCE",
      "ADVANCED_REPORTING",
      "LEARNING",
    ]);
    expect(changed.selectedOptionalModules).toEqual([]);
  });

  it("deduplicates module state when selections cross included and paid lists", () => {
    const state: ConfiguratorState = {
      ...selectPlan(INITIAL_CONFIGURATOR_STATE, "GROWTH_99_MONTHLY", PRICES),
      selectedIncludedModules: ["FINANCE", "FINANCE"],
      selectedOptionalModules: ["FINANCE", "LEARNING"],
    };
    expect(configuredModulesForState(state)).toEqual(["FINANCE", "LEARNING"]);
  });

  it("returns a deduplicated included and optional module union", () => {
    const state = completeState({
      planCode: "GROWTH_99_MONTHLY",
      selectedIncludedModules: ["FINANCE", "EVENTS"],
      selectedOptionalModules: ["LEARNING", "MEALS"],
    });
    expect(configuredModulesForState(state)).toEqual([
      "FINANCE",
      "EVENTS",
      "LEARNING",
      "MEALS",
    ]);
  });
});
