import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  INITIAL_CONFIGURATOR_STATE,
  selectFrequency,
  selectOrgType,
  selectPlan,
  selectStorage,
  selectVertical,
  toggleModule,
} from "../app/configure/state";

const configureDirectory = join(process.cwd(), "app/configure");
const stepsDirectory = join(configureDirectory, "steps");
const PRICES = {
  MODULE_LEARNING_MONTHLY: { amountMajor: 29 },
  MODULE_LEARNING_YEARLY: { amountMajor: 290 },
};

describe("configurator step contracts", () => {
  it("keeps valid choices while applying policy-aware selection actions", () => {
    const school = selectOrgType(INITIAL_CONFIGURATOR_STATE, "SCHOOL");
    expect(school.vertical).toBeNull();
    expect(selectVertical(school, "ACE_SCHOOL").vertical).toBe("ACE_SCHOOL");

    const starter = selectPlan(school, "STARTER_49_MONTHLY", PRICES);
    expect(
      toggleModule(starter, "LEARNING", PRICES).selectedOptionalModules,
    ).toEqual(["LEARNING"]);
    expect(selectStorage(starter, "200").storageChoice).toBe("200");
  });

  it("remaps plans and removes modules without a live price in the new interval", () => {
    for (const [monthly, yearly] of [
      ["STARTER_49_MONTHLY", "STARTER_49_YEARLY"],
      ["GROWTH_99_MONTHLY", "GROWTH_99_YEARLY"],
      ["PROFESSIONAL_149_MONTHLY", "PROFESSIONAL_149_YEARLY"],
    ] as const) {
      const state = {
        ...selectPlan(INITIAL_CONFIGURATOR_STATE, monthly, PRICES),
        selectedOptionalModules: ["LEARNING" as const],
      };
      const yearlyState = selectFrequency(state, "yearly", PRICES);

      expect(yearlyState).toMatchObject({
        planCode: yearly,
        frequency: "yearly",
        selectedOptionalModules: ["LEARNING"],
      });
      expect(selectFrequency(yearlyState, "monthly", PRICES).planCode).toBe(
        monthly,
      );
    }
  });

  it("uses authoritative collections and does not hard-code step money", () => {
    const modules = readFileSync(join(stepsDirectory, "modules.tsx"), "utf8");
    const vertical = readFileSync(join(stepsDirectory, "vertical.tsx"), "utf8");
    const plan = readFileSync(join(stepsDirectory, "plan.tsx"), "utf8");
    const summary = readFileSync(join(stepsDirectory, "summary.tsx"), "utf8");
    const page = readFileSync(join(configureDirectory, "page.tsx"), "utf8");

    expect(modules).toContain("MODULE_CATALOG");
    expect(modules).toMatch(
      /MODULE_CATALOG[\s\S]*\.map|\.map[\s\S]*MODULE_CATALOG/,
    );
    expect(vertical).toContain("VERTICAL_OPTIONS");
    expect(plan).toContain("PLANS");
    expect(summary).toContain("Organisation name");
    expect(summary).toContain("Contact name");
    expect(summary).toContain("Work email");
    expect(summary).toContain("Password");
    expect(summary).not.toMatch(/sector|createCheckoutSession/i);

    for (const file of readdirSync(stepsDirectory)) {
      expect(readFileSync(join(stepsDirectory, file), "utf8")).not.toContain(
        "£",
      );
    }

    for (const component of [
      "OrgTypeStep",
      "VerticalStep",
      "IncludedStep",
      "ModulesStep",
      "PlanStep",
      "StorageStep",
      "SummaryStep",
    ]) {
      expect(page).toContain(component);
    }
    expect(page).not.toContain("will be available here in the next stage");
  });
});
