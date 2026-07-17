import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

assert.ok(
  !source.includes("smsBundlesCount"),
  "admin buy-now page must not have an SMS bundles purchase input (Phase 0 PR 0.3)",
);
assert.ok(
  !source.includes("SMS bundles"),
  "admin buy-now page must not render an SMS bundles label",
);
