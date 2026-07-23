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
  MODULE_LEARNING_MONTHLY: { amountMajor: 29 },
  MODULE_LEARNING_YEARLY: { amountMajor: 290 },
  MODULE_FINANCE_MONTHLY: { amountMajor: 19 },
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
  let state = selectPlan(INITIAL_CONFIGURATOR_STATE, "STARTER_49_MONTHLY", PRICES);
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
  const starter = selectPlan(INITIAL_CONFIGURATOR_STATE, "STARTER_49_MONTHLY", PRICES);
  // LEARNING is priced + eligible -> toggles on then off.
  assert.deepEqual(toggleModule(starter, "LEARNING", PRICES).selectedOptionalModules, [
    "LEARNING",
  ]);
  // A module without a price is not selectable.
  assert.deepEqual(
    toggleModule(starter, "HR", PRICES).selectedOptionalModules,
    [],
    "unpriced modules cannot be toggled on",
  );
}

// --- switching plan reconciles now-included / ineligible modules ---
{
  // FINANCE is optional on Starter but INCLUDED on Growth -> drops from paid add-ons.
  let state = selectPlan(INITIAL_CONFIGURATOR_STATE, "STARTER_49_MONTHLY", PRICES);
  state = toggleModule(state, "FINANCE", PRICES);
  assert.deepEqual(state.selectedOptionalModules, ["FINANCE"]);
  const onGrowth = selectPlan(state, "GROWTH_99_MONTHLY", PRICES);
  assert.deepEqual(
    onGrowth.selectedOptionalModules,
    [],
    "a module included in the new plan is removed from paid add-ons",
  );
}

// --- selectFrequency remaps the plan code ---
{
  const monthly = selectPlan(INITIAL_CONFIGURATOR_STATE, "STARTER_49_MONTHLY", PRICES);
  const yearly = selectFrequency(monthly, "yearly", PRICES);
  assert.equal(yearly.planCode, "STARTER_49_YEARLY");
  assert.equal(yearly.frequency, "yearly");
}

console.log("admin configurator state.test.ts: all assertions passed");
