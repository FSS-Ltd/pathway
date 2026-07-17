import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const shellSource = readFileSync(new URL("./admin-shell.tsx", import.meta.url), "utf8");

assert.ok(
  shellSource.includes('from "@pathway/util"') && shellSource.includes("APP_VERSION"),
  "admin-shell.tsx must import APP_VERSION from @pathway/util",
);
assert.match(
  shellSource,
  /AppVersionTag/,
  "expected an AppVersionTag component rendered in the sidebar footer",
);
