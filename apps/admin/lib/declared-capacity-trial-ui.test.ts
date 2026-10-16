import assert from "node:assert/strict";
import {
  shouldShowAddonTrialCountdown,
  trialTimeRemaining,
} from "./declared-capacity-trial-ui";

const now = Date.parse("2030-01-01T00:00:00.000Z");

assert.equal(
  shouldShowAddonTrialCountdown(
    "ACTIVE",
    new Date(now + 10 * 24 * 60 * 60 * 1000).toISOString(),
    now,
  ),
  true,
  "countdown begins at ten days remaining",
);
assert.equal(
  shouldShowAddonTrialCountdown(
    "ACTIVE",
    new Date(now + 10 * 24 * 60 * 60 * 1000 + 1).toISOString(),
    now,
  ),
  false,
  "countdown does not begin before the ten-day window",
);
assert.equal(
  shouldShowAddonTrialCountdown(
    "EXPIRED",
    new Date(now + 60 * 60 * 1000).toISOString(),
    now,
  ),
  false,
  "expired trials use the purchase decision flow",
);
assert.equal(
  trialTimeRemaining(new Date(now + 90 * 60 * 1000).toISOString(), now),
  "2 hours left",
);
assert.equal(
  trialTimeRemaining(new Date(now + 25 * 60 * 60 * 1000).toISOString(), now),
  "2 days left",
);

console.log("declared-capacity trial notice checks passed");
