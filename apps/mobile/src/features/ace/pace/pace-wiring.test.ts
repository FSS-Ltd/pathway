import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  createPaceSubmissionGate,
  getPacePolicyFeedback,
} from "./pace-policy-feedback";
import { parsePaceErrorBody } from "../../../lib/api/pace-policy";

async function run(): Promise<void> {
  assert.deepEqual(
    getPacePolicyFeedback({ decision: "warn", code: "score-below-threshold" }),
    {
      tone: "warning",
      message:
        "The score is below the site threshold. The assessment was recorded without progression.",
    },
    "renders the server policy warning without reproducing progression rules",
  );

  assert.deepEqual(
    getPacePolicyFeedback({ decision: "block", code: "daily-limit" }),
    {
      tone: "block",
      message: "This learner has reached the site’s daily assessment limit.",
    },
    "renders an API policy block as blocking feedback",
  );

  const apiError = parsePaceErrorBody({
    message: "Assessment blocked by policy.",
    details: { policyCode: "same-pace-same-day" },
  });
  assert.equal(apiError.policyCode, "same-pace-same-day");
  assert.equal(apiError.message, "Assessment blocked by policy.");

  const gate = createPaceSubmissionGate();
  let attempts = 0;
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });

  const first = gate.run(async () => {
    attempts += 1;
    await pending;
  });
  const second = gate.run(async () => {
    attempts += 1;
  });

  assert.equal(
    await second,
    false,
    "ignores a second submission while the first is pending",
  );
  assert.equal(attempts, 1, "starts only one assessment command");
  release?.();
  assert.equal(
    await first,
    true,
    "releases the submission gate when the request completes",
  );

  const mobileRoot = resolve(__dirname, "../../../..");
  const [routeSource, tabLayoutSource, navSource] = await Promise.all([
    readFile(resolve(mobileRoot, "app/(serve)/(tabs)/pace/index.tsx"), "utf8"),
    readFile(resolve(mobileRoot, "app/(serve)/(tabs)/_layout.tsx"), "utf8"),
    readFile(
      resolve(mobileRoot, "src/components/navigation/serve-bottom-nav.tsx"),
      "utf8",
    ),
  ]);
  assert.match(
    routeSource,
    /PaceScreen/,
    "exposes the PACE screen through a Serve route",
  );
  assert.match(
    tabLayoutSource,
    /name="pace"/,
    "registers the PACE route with Expo Tabs",
  );
  assert.match(
    navSource,
    /routeName: "pace"/,
    "makes the PACE route reachable from Serve navigation",
  );
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
