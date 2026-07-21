import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  INITIAL_CONFIGURATOR_STATE,
  selectFrequency,
  selectOrgType,
  selectStorage,
  selectVertical,
  toggleModule,
} from "../app/configure/state";

const configureDirectory = join(process.cwd(), "app/configure");
const stepsDirectory = join(configureDirectory, "steps");

describe("configurator step contracts", () => {
  it("keeps valid choices while applying typed selection actions", () => {
    const school = selectOrgType(
      {
        ...INITIAL_CONFIGURATOR_STATE,
        vertical: "CHURCH",
        selectedModules: ["LEARNING"],
      },
      "SCHOOL",
    );
    expect(school.vertical).toBeNull();
    expect(school.selectedModules).toEqual(["LEARNING"]);
    expect(selectVertical(school, "ACE_SCHOOL").vertical).toBe("ACE_SCHOOL");
    expect(toggleModule(school, "LEARNING").selectedModules).toEqual([]);
    expect(
      toggleModule(
        toggleModule({ ...school, selectedModules: [] }, "LEARNING"),
        "LEARNING",
      ).selectedModules,
    ).toEqual([]);
    expect(selectStorage(school, "200").storageChoice).toBe("200");
  });

  it("remaps self-serve plan codes when frequency changes without losing choices", () => {
    const priceLookup = {
      MODULE_LEARNING_MONTHLY: { amountMajor: 29 },
      MODULE_LEARNING_YEARLY: { amountMajor: 290 },
    };

    for (const [monthly, yearly] of [
      ["STARTER_49_MONTHLY", "STARTER_49_YEARLY"],
      ["GROWTH_99_MONTHLY", "GROWTH_99_YEARLY"],
      ["PROFESSIONAL_149_MONTHLY", "PROFESSIONAL_149_YEARLY"],
    ] as const) {
      const state = {
        ...INITIAL_CONFIGURATOR_STATE,
        planCode: monthly,
        selectedModules: ["LEARNING" as const],
        storageChoice: "100" as const,
      };
      const yearlyState = selectFrequency(state, "yearly", priceLookup);
      expect(yearlyState).toMatchObject({
        planCode: yearly,
        frequency: "yearly",
        selectedModules: ["LEARNING"],
        storageChoice: "100",
      });
      expect(
        selectFrequency(yearlyState, "monthly", priceLookup).planCode,
      ).toBe(monthly);
    }
  });

  it("removes modules without a price in the newly selected interval", () => {
    const state = {
      ...INITIAL_CONFIGURATOR_STATE,
      planCode: "STARTER_49_MONTHLY" as const,
      selectedModules: ["LEARNING", "FINANCE"] as const,
    };
    const next = selectFrequency(state, "yearly", {
      MODULE_LEARNING_YEARLY: { amountMajor: 290 },
      MODULE_FINANCE_MONTHLY: { amountMajor: 19 },
    });

    expect(next).toMatchObject({
      frequency: "yearly",
      planCode: "STARTER_49_YEARLY",
      selectedModules: ["LEARNING"],
    });
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
