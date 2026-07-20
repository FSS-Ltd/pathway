import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { APP_VERSION } from "@pathway/util/version";

const shellSource = readFileSync(
  new URL("./admin-shell.tsx", import.meta.url),
  "utf8",
);

assert.equal(
  APP_VERSION,
  "2.3.0",
  "admin footer must surface the current product version",
);
assert.ok(
  shellSource.includes('from "@pathway/util/version"') &&
    shellSource.includes("APP_VERSION"),
  "admin-shell.tsx must import APP_VERSION from @pathway/util/version",
);
assert.match(
  shellSource,
  /AppVersionTag/,
  "expected an AppVersionTag component rendered in the sidebar footer",
);
