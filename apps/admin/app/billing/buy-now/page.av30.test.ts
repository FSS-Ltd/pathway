import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

assert.ok(
  !source.includes("av30BlockCount"),
  "admin buy-now page must not have an Active People add-on purchase input (Phase 0 PR 0.4)",
);
assert.ok(
  !source.includes("Extra AV30 blocks"),
  "admin buy-now page must not render an Extra AV30 blocks label",
);
