import assert from "node:assert/strict";
import test from "node:test";

import { evaluateDemeritStage } from "./demerit-policy";

const baseInput = {
  demeritUnits: 0,
  stageOneThreshold: 3,
  stageTwoThreshold: 6,
  stageThreeThreshold: 10,
  seriousMisconductStage: 3,
  hasSeriousMisconduct: false,
};

test("returns no action below the first cumulative threshold", () => {
  assert.deepEqual(evaluateDemeritStage(baseInput), {
    stage: 0,
    action: "none",
    requiresNote: false,
  });
});

test("maps cumulative demerit units to the configured escalation stages", () => {
  assert.deepEqual(
    evaluateDemeritStage({ ...baseInput, demeritUnits: 3 }),
    { stage: 1, action: "review", requiresNote: false },
  );
  assert.deepEqual(
    evaluateDemeritStage({ ...baseInput, demeritUnits: 6 }),
    { stage: 2, action: "notify", requiresNote: false },
  );
  assert.deepEqual(
    evaluateDemeritStage({ ...baseInput, demeritUnits: 10 }),
    { stage: 3, action: "head-review", requiresNote: true },
  );
});

test("uses an active manual stage only when it raises the calculated stage", () => {
  assert.deepEqual(
    evaluateDemeritStage({ ...baseInput, demeritUnits: 6, manualStage: 1 }),
    { stage: 2, action: "notify", requiresNote: false },
  );
  assert.deepEqual(
    evaluateDemeritStage({ ...baseInput, manualStage: 2 }),
    { stage: 2, action: "notify", requiresNote: false },
  );
});

test("always sends serious misconduct to head review with a required note", () => {
  assert.deepEqual(
    evaluateDemeritStage({
      ...baseInput,
      seriousMisconductStage: 1,
      hasSeriousMisconduct: true,
    }),
    { stage: 1, action: "head-review", requiresNote: true },
  );
  assert.deepEqual(
    evaluateDemeritStage({
      ...baseInput,
      demeritUnits: 6,
      seriousMisconductStage: 1,
      hasSeriousMisconduct: true,
    }),
    { stage: 2, action: "head-review", requiresNote: true },
  );
  assert.deepEqual(
    evaluateDemeritStage({
      ...baseInput,
      seriousMisconductStage: 2,
      hasSeriousMisconduct: true,
      manualStage: 1,
    }),
    { stage: 2, action: "head-review", requiresNote: true },
  );
  assert.deepEqual(
    evaluateDemeritStage({
      ...baseInput,
      seriousMisconductStage: 2,
      hasSeriousMisconduct: true,
      manualStage: 3,
    }),
    { stage: 3, action: "head-review", requiresNote: true },
  );
});

test("requires a note for a non-serious manual Stage 3", () => {
  assert.deepEqual(
    evaluateDemeritStage({ ...baseInput, manualStage: 3 }),
    { stage: 3, action: "head-review", requiresNote: true },
  );
});

test("rejects invalid unit totals and stage configuration", () => {
  assert.throws(
    () => evaluateDemeritStage({ ...baseInput, demeritUnits: -1 }),
    /Demerit units must be a non-negative integer/,
  );
  assert.throws(
    () =>
      evaluateDemeritStage({
        ...baseInput,
        stageTwoThreshold: baseInput.stageOneThreshold,
      }),
    /Demerit stage thresholds must be positive integers in ascending order/,
  );
  assert.throws(
    () => evaluateDemeritStage({ ...baseInput, manualStage: 4 }),
    /Manual demerit stage must be an integer between 1 and 3/,
  );
});
