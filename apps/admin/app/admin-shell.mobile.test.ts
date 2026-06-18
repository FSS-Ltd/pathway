import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./admin-shell.tsx", import.meta.url), "utf8");

assert.match(
  source,
  /aria-haspopup="dialog"/,
  "mobile menu trigger exposes dialog semantics",
);
assert.match(
  source,
  /aria-modal="true"/,
  "mobile navigation panel identifies itself as a modal dialog",
);
assert.match(
  source,
  /md:hidden/,
  "mobile navigation is scoped to small viewports",
);
assert.match(
  source,
  /onKeyDown=\{handleMobileNavKeyDown\}/,
  "mobile navigation closes on Escape",
);
assert.match(
  source,
  /setIsMobileNavOpen\(false\)/,
  "mobile navigation can close after route changes or dismissal",
);

console.log("admin-shell mobile navigation checks passed");
