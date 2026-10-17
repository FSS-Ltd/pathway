import assert from "node:assert/strict";
import type { OptionPriceLookup } from "../../../lib/module-catalog";
import {
  firstIncompleteStep,
  INITIAL_CONFIGURATOR_STATE,
  initialStateFromSubscription,
  nextStep,
  prevStep,
  selectFrequency,
  selectPlan,
  selectStorage,
  toggleModule,
  type ConfiguratorState,
} from "./state";

const PRICES: OptionPriceLookup = {
  MODULE_ASSET_MANAGEMENT_MONTHLY: { amountMajor: 29 },
  MODULE_ASSET_MANAGEMENT_YEARLY: { amountMajor: 290 },
  MODULE_FINANCE_MONTHLY: { amountMajor: 29 },
  MODULE_FINANCE_YEARLY: { amountMajor: 290 },
};

// --- seeding from the current subscription ---
{
  const seeded = initialStateFromSubscription("GROWTH_99_YEARLY");
  assert.equal(seeded.planCode, "GROWTH_99_YEARLY", "seeds known plan code");
  assert.equal(seeded.frequency, "yearly", "derives frequency from code");
  assert.equal(seeded.step, "plan", "starts on the plan step");

  const legacy = initialStateFromSubscription("GROWTH_MONTHLY");
  assert.equal(
    legacy.planCode,
    null,
    "legacy/unknown plan codes leave the plan unselected",
  );
  assert.equal(initialStateFromSubscription(null).planCode, null);
  const withModules = initialStateFromSubscription("GROWTH_99_MONTHLY", {
    included: ["EVENTS"],
    paid: ["FINANCE"],
  });
  assert.deepEqual(withModules.selectedIncludedModules, ["EVENTS"]);
  assert.deepEqual(withModules.selectedOptionalModules, ["FINANCE"]);
  const moved = toggleModule(withModules, "FINANCE", PRICES);
  assert.deepEqual(moved.selectedIncludedModules, ["EVENTS", "FINANCE"]);
  assert.deepEqual(moved.selectedOptionalModules, []);
}

// --- the plan step gates everything else ---
{
  assert.equal(
    firstIncompleteStep(INITIAL_CONFIGURATOR_STATE),
    "plan",
    "no plan selected -> forced back to plan",
  );
  // Jumping ahead without a plan redirects to plan rather than advancing.
  const jumped: ConfiguratorState = {
    ...INITIAL_CONFIGURATOR_STATE,
    step: "summary",
  };
  assert.equal(nextStep(jumped).step, "plan");
  assert.equal(prevStep(jumped).step, "plan");
}

// --- forward/back transitions preserve prior selections ---
{
  let state = selectPlan(
    INITIAL_CONFIGURATOR_STATE,
    "STARTER_49_MONTHLY",
    PRICES,
  );
  state = toggleModule(state, "FINANCE", PRICES);
  state = selectStorage(state, "200");
  assert.deepEqual(state.selectedOptionalModules, ["FINANCE"]);

  const atModules = nextStep(state);
  assert.equal(atModules.step, "modules");
  const atStorage = nextStep(atModules);
  assert.equal(atStorage.step, "storage");
  const atSummary = nextStep(atStorage);
  assert.equal(atSummary.step, "summary");
  assert.equal(nextStep(atSummary).step, "summary", "summary is terminal");

  // Back preserves selections made earlier.
  const backToStorage = prevStep(atSummary);
  assert.equal(backToStorage.step, "storage");
  assert.equal(backToStorage.storageChoice, "200");
  assert.deepEqual(backToStorage.selectedOptionalModules, ["FINANCE"]);
  assert.equal(prevStep(prevStep(prevStep(atSummary))).step, "plan");
}

// --- toggleModule respects eligibility + pricing ---
{
  const starter = selectPlan(
    INITIAL_CONFIGURATOR_STATE,
    "STARTER_49_MONTHLY",
    PRICES,
  );
  // Asset Management is priced and eligible in the future catalogue.
  assert.deepEqual(
    toggleModule(starter, "ASSET_MANAGEMENT", PRICES).selectedOptionalModules,
    ["ASSET_MANAGEMENT"],
  );
  // A module without a price is not selectable.
  assert.deepEqual(
    toggleModule(starter, "HR", PRICES).selectedOptionalModules,
    [],
    "unpriced modules cannot be toggled on",
  );
}

// --- switching plan reconciles now-included / ineligible modules ---
{
  // Starter has no free slots. Switching to Growth keeps a customer-chosen module paid unless explicitly selected as included.
  let state = selectPlan(
    INITIAL_CONFIGURATOR_STATE,
    "STARTER_49_MONTHLY",
    PRICES,
  );
  state = toggleModule(state, "FINANCE", PRICES);
  assert.deepEqual(state.selectedOptionalModules, ["FINANCE"]);
  const onGrowth = selectPlan(state, "GROWTH_99_MONTHLY", PRICES);
  assert.deepEqual(onGrowth.selectedIncludedModules, ["FINANCE"]);
  assert.deepEqual(onGrowth.selectedOptionalModules, []);
  assert.deepEqual(
    toggleModule(onGrowth, "FINANCE", PRICES).selectedIncludedModules,
    [],
    "removing an included choice frees a slot",
  );

  const growthPrices: OptionPriceLookup = {
    ...PRICES,
    MODULE_EVENTS_MONTHLY: { amountMajor: 10 },
    MODULE_MEALS_MONTHLY: { amountMajor: 12 },
  };
  const afterExtraSelections = ["ASSET_MANAGEMENT", "EVENTS", "MEALS"].reduce(
    (current, module) =>
      toggleModule(
        current,
        module as "ASSET_MANAGEMENT" | "EVENTS" | "MEALS",
        growthPrices,
      ),
    onGrowth,
  );
  assert.deepEqual(afterExtraSelections.selectedIncludedModules, [
    "FINANCE",
    "ASSET_MANAGEMENT",
    "EVENTS",
  ]);
  assert.deepEqual(afterExtraSelections.selectedOptionalModules, ["MEALS"]);
}

// --- selectFrequency remaps the plan code ---
{
  const monthly = selectPlan(
    INITIAL_CONFIGURATOR_STATE,
    "STARTER_49_MONTHLY",
    PRICES,
  );
  const yearly = selectFrequency(monthly, "yearly", PRICES);
  assert.equal(yearly.planCode, "STARTER_49_YEARLY");
  assert.equal(yearly.frequency, "yearly");
}

// An empty selection is intentional, including when a customer changes plans.
{
  const growth = selectPlan(
    INITIAL_CONFIGURATOR_STATE,
    "GROWTH_99_MONTHLY",
    PRICES,
  );
  const starter = selectPlan(growth, "STARTER_49_MONTHLY", PRICES);
  assert.deepEqual(starter.selectedIncludedModules, []);
  assert.deepEqual(starter.selectedOptionalModules, []);
  const yearly = selectFrequency(growth, "yearly", PRICES);
  assert.deepEqual(yearly.selectedIncludedModules, []);
  assert.deepEqual(yearly.selectedOptionalModules, []);
}

console.log("admin configurator state.test.ts: all assertions passed");
