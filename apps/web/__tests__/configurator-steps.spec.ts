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

  it("renders Plan first and sends only live module prices to policy actions", () => {
    const page = readFileSync(join(configureDirectory, "page.tsx"), "utf8");

    expect(page).toContain("useRouter");
    expect(page).toContain('router.push("/demo?plan=enterprise")');
    expect(page).toContain("prices: billingPrices.modulePrices");
    expect(page).toContain(
      "selectedOptionalModules={state.selectedOptionalModules}",
    );
    expect(page).toContain("includedModules={includedModules}");
    expect(page).toContain("eligibleOptionalModules={eligibleOptionalModules}");
    expect(page.indexOf('{currentStep === "plan"')).toBeLessThan(
      page.indexOf('{currentStep === "org-type"'),
    );
  });

  it("routes Enterprise directly to the demo path without a checkout plan", () => {
    const plan = readFileSync(join(stepsDirectory, "plan.tsx"), "utf8");

    expect(plan).toContain("onSelectEnterprise");
    expect(plan).toContain("onClick={onSelectEnterprise}");
    expect(plan).not.toContain("mailto:");
  });

  it("distinguishes included, eligible, and unavailable modules", () => {
    const modules = readFileSync(join(stepsDirectory, "modules.tsx"), "utf8");

    expect(modules).toContain("includedModules");
    expect(modules).toContain("eligibleOptionalModules");
    expect(modules).toContain("Included in {planLabel}");
    expect(modules).toContain("isDisabled={true}");
    expect(modules).toContain("eligibleOptionalModules.includes(module)");
  });

  it("separates included modules from paid add-ons in the review", () => {
    const summary = readFileSync(join(stepsDirectory, "summary.tsx"), "utf8");

    expect(summary).toContain("Included modules");
    expect(summary).toContain("Paid add-ons");
    expect(summary).toContain("includedModules");
    expect(summary).toContain("selectedOptionalModules");
  });
});
