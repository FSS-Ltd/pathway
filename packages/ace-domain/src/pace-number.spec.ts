import assert from "node:assert/strict";
import test from "node:test";

import { comparePaceNumbers, nextPaceNumber, parsePaceNumber } from "./index";

test("parsePaceNumber rejects invalid PACE numbers", () => {
  for (const raw of [
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    145,
    1000,
    1145,
  ]) {
    assert.throws(() => parsePaceNumber(raw), RangeError);
  }
});

test("parsePaceNumber maps the boundaries of short and long PACE numbering", () => {
  assert.deepEqual(parsePaceNumber(1), { raw: 1, level: 1, sequence: 1 });
  assert.deepEqual(parsePaceNumber(12), { raw: 12, level: 1, sequence: 12 });
  assert.deepEqual(parsePaceNumber(13), { raw: 13, level: 2, sequence: 1 });
  assert.deepEqual(parsePaceNumber(144), { raw: 144, level: 12, sequence: 12 });

  assert.deepEqual(parsePaceNumber(1001), { raw: 1001, level: 1, sequence: 1 });
  assert.deepEqual(parsePaceNumber(1012), {
    raw: 1012,
    level: 1,
    sequence: 12,
  });
  assert.deepEqual(parsePaceNumber(1013), { raw: 1013, level: 2, sequence: 1 });
  assert.deepEqual(parsePaceNumber(1144), {
    raw: 1144,
    level: 12,
    sequence: 12,
  });
});

test("comparePaceNumbers compares logical progression rather than numbering form", () => {
  assert.equal(
    comparePaceNumbers(parsePaceNumber(1001), parsePaceNumber(1)),
    0,
  );
  assert.equal(
    comparePaceNumbers(parsePaceNumber(1012), parsePaceNumber(1013)),
    -1,
  );
  assert.equal(
    comparePaceNumbers(parsePaceNumber(144), parsePaceNumber(1144)),
    0,
  );
  assert.equal(
    comparePaceNumbers(parsePaceNumber(1144), parsePaceNumber(1143)),
    1,
  );
});

test("nextPaceNumber advances within and across levels while preserving numbering form", () => {
  assert.deepEqual(nextPaceNumber(parsePaceNumber(12)), parsePaceNumber(13));
  assert.deepEqual(
    nextPaceNumber(parsePaceNumber(1012)),
    parsePaceNumber(1013),
  );
  assert.throws(() => nextPaceNumber(parsePaceNumber(144)), RangeError);
  assert.throws(() => nextPaceNumber(parsePaceNumber(1144)), RangeError);
});
