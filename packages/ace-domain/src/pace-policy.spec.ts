import assert from "node:assert/strict";
import test from "node:test";

import { parsePaceNumber } from "./pace-number";
import { evaluatePaceAssessment } from "./pace-policy";

const baseInput = {
  assessmentType: "FinalTest" as const,
  score: 80,
  passThreshold: 80,
  assessedPace: parsePaceNumber(1001),
  currentPace: parsePaceNumber(1001),
  dailyTestCount: 0,
  dailyTestLimitEnabled: false,
  dailyTestLimit: 2,
  samePaceSameDayBlockEnabled: true,
  hasExistingSelfTest: false,
  hasRequiredSelfTest: true,
  hasOppositeTypeAssessmentOnSameDay: false,
  hasAuthorisedOverride: false,
};

test("blocks at the enabled daily assessment limit before other policy outcomes", () => {
  assert.deepEqual(
    evaluatePaceAssessment({
      ...baseInput,
      dailyTestLimitEnabled: true,
      dailyTestCount: 2,
      hasAuthorisedOverride: true,
    }),
    { decision: "block", code: "daily-limit" },
  );
});

test("blocks a Final Test without its required Self Test", () => {
  assert.deepEqual(
    evaluatePaceAssessment({ ...baseInput, hasRequiredSelfTest: false }),
    { decision: "block", code: "progression-blocked" },
  );
});

test("blocks an existing Self Test across dates while allowing repeated Final Tests", () => {
  assert.deepEqual(
    evaluatePaceAssessment({
      ...baseInput,
      assessmentType: "SelfTest",
      hasExistingSelfTest: true,
      hasRequiredSelfTest: false,
    }),
    { decision: "block", code: "duplicate-self-test" },
  );

  assert.deepEqual(
    evaluatePaceAssessment({ ...baseInput, hasExistingSelfTest: true }),
    {
      decision: "allow",
      code: "allowed",
      nextPace: parsePaceNumber(1002),
    },
  );
});

test("blocks same-PACE opposite-type assessments only when the policy is enabled", () => {
  assert.deepEqual(
    evaluatePaceAssessment({
      ...baseInput,
      hasOppositeTypeAssessmentOnSameDay: true,
    }),
    { decision: "block", code: "same-pace-same-day" },
  );

  assert.deepEqual(
    evaluatePaceAssessment({
      ...baseInput,
      samePaceSameDayBlockEnabled: false,
      hasOppositeTypeAssessmentOnSameDay: true,
    }),
    {
      decision: "allow",
      code: "allowed",
      nextPace: parsePaceNumber(1002),
    },
  );
});

test("allows a Self Test without advancing PACE", () => {
  assert.deepEqual(
    evaluatePaceAssessment({
      ...baseInput,
      assessmentType: "SelfTest",
      hasRequiredSelfTest: false,
    }),
    { decision: "allow", code: "allowed" },
  );
});

test("warns for a failed Final Test without an authorised override", () => {
  assert.deepEqual(
    evaluatePaceAssessment({ ...baseInput, score: 79 }),
    { decision: "warn", code: "score-below-threshold" },
  );
});

test("allows an authorised override for a failed Final Test that may progress", () => {
  assert.deepEqual(
    evaluatePaceAssessment({
      ...baseInput,
      score: 79,
      hasAuthorisedOverride: true,
    }),
    {
      decision: "allow",
      code: "allowed",
      nextPace: parsePaceNumber(1002),
    },
  );
});

test("does not advance an earlier PACE, even with an authorised override", () => {
  assert.deepEqual(
    evaluatePaceAssessment({
      ...baseInput,
      score: 79,
      assessedPace: parsePaceNumber(1001),
      currentPace: parsePaceNumber(1002),
      hasAuthorisedOverride: true,
    }),
    { decision: "warn", code: "progression-blocked" },
  );
});

test("warns when a passing Final Test cannot advance beyond the last PACE", () => {
  assert.deepEqual(
    evaluatePaceAssessment({
      ...baseInput,
      assessedPace: parsePaceNumber(1144),
      currentPace: parsePaceNumber(1144),
    }),
    { decision: "warn", code: "progression-blocked" },
  );

  assert.deepEqual(
    evaluatePaceAssessment({
      ...baseInput,
      assessedPace: parsePaceNumber(144),
      currentPace: parsePaceNumber(144),
    }),
    { decision: "warn", code: "progression-blocked" },
  );
});
