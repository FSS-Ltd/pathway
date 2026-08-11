import assert from "node:assert/strict";
import test from "node:test";

import { rebuildPaceProgress, type PaceAssessmentFact } from "./index";

function fact(overrides: Partial<PaceAssessmentFact> = {}): PaceAssessmentFact {
  return {
    id: "fact-1",
    paceNumber: 1,
    assessmentType: "FinalTest",
    result: "passed",
    assessedOn: "2026-08-11",
    ...overrides,
  };
}

test("rebuildPaceProgress returns the initial subject and assigned levels", () => {
  const progress = rebuildPaceProgress({
    assignedLevel: 7,
    startingPace: 61,
    assessmentFacts: [],
  });

  assert.deepEqual(progress.currentPace, { raw: 61, level: 6, sequence: 1 });
  assert.deepEqual(progress.currentLevel, {
    level: 6,
    ukYearTooltip:
      "UK Year 7 equivalent. This is not a placement recommendation.",
  });
  assert.deepEqual(progress.assignedLevel, {
    level: 7,
    ukYearTooltip:
      "UK Year 8 equivalent. This is not a placement recommendation.",
  });
  assert.equal(progress.levelDelta, -1);
  assert.equal(progress.needsAttention, true);
});

test("rebuildPaceProgress advances for a passing Final Test", () => {
  const progress = rebuildPaceProgress({
    assignedLevel: 1,
    startingPace: 1,
    assessmentFacts: [fact()],
  });

  assert.deepEqual(progress.currentPace, { raw: 2, level: 1, sequence: 2 });
});

test("rebuildPaceProgress does not advance for Self Tests or failed Final Tests", () => {
  const progress = rebuildPaceProgress({
    assignedLevel: 1,
    startingPace: 1,
    assessmentFacts: [
      fact({ id: "self-test", assessmentType: "SelfTest" }),
      fact({
        id: "failed-final-test",
        result: "failed",
        assessedOn: "2026-08-12",
      }),
    ],
  });

  assert.equal(progress.currentPace.raw, 1);
});

test("rebuildPaceProgress advances a failed Final Test only when an override is linked", () => {
  const progress = rebuildPaceProgress({
    assignedLevel: 1,
    startingPace: 1,
    assessmentFacts: [fact({ result: "failed", hasAuthorisedOverride: true })],
  });

  assert.equal(progress.currentPace.raw, 2);
});

test("rebuildPaceProgress excludes facts superseded by corrections", () => {
  const progress = rebuildPaceProgress({
    assignedLevel: 1,
    startingPace: 1,
    assessmentFacts: [
      fact(),
      fact({
        id: "correction",
        result: "failed",
        correctsFactId: "fact-1",
      }),
    ],
  });

  assert.equal(progress.currentPace.raw, 1);
});

test("rebuildPaceProgress sorts terminal facts by local assessed date then id", () => {
  const input = {
    assignedLevel: 1,
    startingPace: 1,
    assessmentFacts: [
      fact({ id: "b", paceNumber: 2, assessedOn: "2026-08-12" }),
      fact({ id: "a", paceNumber: 1, assessedOn: "2026-08-11" }),
    ],
  };

  assert.equal(rebuildPaceProgress(input).currentPace.raw, 3);
  assert.equal(
    rebuildPaceProgress({
      ...input,
      assessmentFacts: [...input.assessmentFacts].reverse(),
    }).currentPace.raw,
    3,
  );
});

test("rebuildPaceProgress treats equal and higher subject levels as not needing attention", () => {
  assert.equal(
    rebuildPaceProgress({
      assignedLevel: 2,
      startingPace: 13,
      assessmentFacts: [],
    }).needsAttention,
    false,
  );
  assert.equal(
    rebuildPaceProgress({
      assignedLevel: 2,
      startingPace: 25,
      assessmentFacts: [],
    }).needsAttention,
    false,
  );
});

test("rebuildPaceProgress supports short and long PACE numbering forms", () => {
  assert.equal(
    rebuildPaceProgress({
      assignedLevel: 1,
      startingPace: 1,
      assessmentFacts: [fact()],
    }).currentPace.raw,
    2,
  );
  assert.equal(
    rebuildPaceProgress({
      assignedLevel: 1,
      startingPace: 1001,
      assessmentFacts: [fact()],
    }).currentPace.raw,
    1002,
  );
});

test("rebuildPaceProgress retains a completed terminal PACE", () => {
  const progress = rebuildPaceProgress({
    assignedLevel: 12,
    startingPace: 144,
    assessmentFacts: [fact({ paceNumber: 144 })],
  });

  assert.equal(progress.currentPace.raw, 144);
});

test("rebuildPaceProgress validates level, PACE facts, and correction links", () => {
  assert.throws(
    () =>
      rebuildPaceProgress({
        assignedLevel: 0,
        startingPace: 1,
        assessmentFacts: [],
      }),
    /Assigned ACE level must be an integer between 1 and 12/,
  );
  assert.throws(
    () =>
      rebuildPaceProgress({
        assignedLevel: 1,
        startingPace: 1,
        assessmentFacts: [fact({ assessedOn: "11/08/2026" })],
      }),
    /assessedOn must be a local YYYY-MM-DD date/,
  );
  assert.throws(
    () =>
      rebuildPaceProgress({
        assignedLevel: 1,
        startingPace: 1,
        assessmentFacts: [fact({ correctsFactId: "unknown" })],
      }),
    /corrects an unknown fact/,
  );
  assert.throws(
    () =>
      rebuildPaceProgress({
        assignedLevel: 1,
        startingPace: 1,
        assessmentFacts: [
          fact({ id: "first", correctsFactId: "second" }),
          fact({ id: "second", correctsFactId: "first" }),
        ],
      }),
    /cyclic correction link/,
  );
});

test("rebuildPaceProgress maps ACE Level 1 and 12 to UK tooltip metadata", () => {
  const first = rebuildPaceProgress({
    assignedLevel: 1,
    startingPace: 1,
    assessmentFacts: [],
  });
  const last = rebuildPaceProgress({
    assignedLevel: 12,
    startingPace: 144,
    assessmentFacts: [],
  });

  assert.equal(first.assignedLevel.ukYearTooltip.startsWith("UK Year 2"), true);
  assert.equal(last.assignedLevel.ukYearTooltip.startsWith("UK Year 13"), true);
});
