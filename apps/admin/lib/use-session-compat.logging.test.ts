import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("./use-session-compat.tsx", import.meta.url),
  "utf8",
);

assert.doesNotMatch(
  source,
  /console\.log/,
  "session resolution must not contain ad-hoc console.log diagnostics",
);

console.log("session compat logging checks passed");
