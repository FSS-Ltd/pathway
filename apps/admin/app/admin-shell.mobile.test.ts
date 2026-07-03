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
  /lg:hidden/,
  "mobile navigation is scoped below the desktop sidebar breakpoint",
);
assert.match(
  source,
  /hidden lg:flex/,
  "desktop sidebar is hidden until the large viewport breakpoint",
);
assert.match(
  source,
  /fixed inset-0 z-50 lg:hidden/,
  "mobile navigation opens as a fixed overlay below the large breakpoint",
);
assert.match(
  source,
  /!h-full !w-full/,
  "mobile drawer navigation fills the overlay panel",
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
