import "@/lib/register-test-styles";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import type { TrackerProgress } from "@pathway/types";
import { CompletionOverview } from "./completion-overview";

const progress: TrackerProgress = {
  completed: 2,
  applicable: 5,
  unresolved: 3,
  notApplicable: 4,
  overdue: 6,
  stale: 7,
  evidenceGaps: 8,
};

function render(value: TrackerProgress): Document {
  return new JSDOM(
    renderToStaticMarkup(
      <CompletionOverview
        progress={value}
        coverageGaps={9}
        observedAt="2026-10-17T09:30:00.000Z"
      />,
    ),
  ).window.document;
}

const document = render(progress);
const meter = document.querySelector("progress");
assert.ok(meter, "applicable actions expose a native progress element");
assert.equal(meter.getAttribute("aria-label"), "Checklist completion");
assert.equal(meter.value, 2);
assert.equal(meter.max, 5);
assert.match(document.body.textContent ?? "", /40%/);
assert.match(
  document.body.textContent ?? "",
  /2 of 5 applicable actions completed/,
);
assert.equal(
  document.querySelector('[aria-hidden="true"] > div')?.getAttribute("style"),
  "width:40%",
);
assert.deepEqual(
  Array.from(document.querySelectorAll("dl > div"), (metric) => [
    metric.querySelector("dt")?.textContent,
    metric.querySelector("dd")?.textContent,
  ]),
  [
    ["Unresolved applicability", "3"],
    ["Coverage gaps", "9"],
    ["Overdue reviews", "6"],
    ["Confirmations needing renewal", "7"],
    ["Evidence gaps", "8"],
    ["Not applicable decisions", "4"],
  ],
  "all distinct indicators remain visible and outside the completion denominator",
);
assert.equal(
  document.querySelector("time")?.getAttribute("datetime"),
  "2026-10-17T09:30:00.000Z",
);

const empty = render({ ...progress, completed: 0, applicable: 0 });
assert.match(empty.body.textContent ?? "", /No applicable items/);
assert.equal(empty.querySelector("progress"), null);
assert.doesNotMatch(empty.body.textContent ?? "", /%|NaN|Infinity/);

const notStarted = render({ ...progress, completed: 0 });
assert.equal(notStarted.querySelector("progress")?.value, 0);
assert.match(notStarted.body.textContent ?? "", /0%/);
assert.equal(
  notStarted.querySelector('[aria-hidden="true"] > div')?.getAttribute("style"),
  "width:0%",
  "zero completions never draw an artificial minimum fill",
);
