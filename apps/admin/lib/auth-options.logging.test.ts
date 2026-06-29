import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./auth-options.ts", import.meta.url), "utf8");

assert.doesNotMatch(
  source,
  /console\.log/,
  "server-side auth options must not contain ad-hoc console.log diagnostics",
);

console.log("auth-options logging checks passed");
