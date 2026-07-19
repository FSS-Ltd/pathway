import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

assert.doesNotMatch(
  source,
  /console\.log/,
  "accept-invite page must not contain ad-hoc console.log diagnostics",
);

console.log("accept-invite logging checks passed");
