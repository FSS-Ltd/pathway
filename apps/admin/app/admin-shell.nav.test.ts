import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const shellSource = readFileSync(new URL("./admin-shell.tsx", import.meta.url), "utf8");
const sidebarNavSource = readFileSync(
  new URL("../../../packages/ui/src/components/sidebar-nav.tsx", import.meta.url),
  "utf8",
);

// Every nav destination must point at a distinct icon - regression test for the bug
// where several items (Guest pass/Handover/Handover logs/Attendance, Profile/People,
// Blog/Lessons) shared an iconIndex, and Settings pointed past the end of the array.
const iconIndexes = [...shellSource.matchAll(/iconIndex:\s*(\d+)/g)].map((m) => Number(m[1]));
assert.ok(iconIndexes.length > 0, "expected nav items with iconIndex to be found");
assert.equal(
  new Set(iconIndexes).size,
  iconIndexes.length,
  "every admin nav item must use a unique iconIndex",
);

const iconComponentsMatch = sidebarNavSource.match(
  /const iconComponents: LucideIcon\[\] = \[([\s\S]*?)\];/,
);
assert.ok(iconComponentsMatch, "expected an iconComponents array in sidebar-nav.tsx");
const iconNames = iconComponentsMatch![1]
  .split("\n")
  .map((line) => line.split("//")[0].replace(",", "").trim())
  .filter(Boolean);
assert.equal(
  new Set(iconNames).size,
  iconNames.length,
  "iconComponents must not repeat the same icon for two different indices",
);

const maxIconIndex = Math.max(...iconIndexes);
assert.ok(
  maxIconIndex < iconNames.length,
  `iconComponents (${iconNames.length} entries) must cover the highest iconIndex used (${maxIconIndex})`,
);

const learningNavEntry = shellSource.match(
  /label:\s*"Learning"[\s\S]*?href:\s*"\/learning"[\s\S]*?iconIndex:\s*(\d+)[\s\S]*?access:\s*"staff-or-admin"[\s\S]*?capability:\s*"learning\.log\.read"[\s\S]*?group:\s*"Teaching"/,
);
assert.ok(
  learningNavEntry,
  "expected Learning navigation to require the learning.log.read capability",
);
assert.ok(
  Number(learningNavEntry[1]) < iconNames.length,
  "Learning navigation iconIndex must be covered by iconComponents",
);

// Grouped items render as accordion sections; Dashboard stays top-level.
const groupLabels = [...shellSource.matchAll(/group:\s*"([^"]+)"/g)].map((m) => m[1]);
assert.ok(groupLabels.length > 0, "expected nav items to declare accordion groups");
assert.match(shellSource, /\{ \.\.\.defaultSidebarItems\[0\], access: "staff-or-admin" \},/, "Dashboard has no group");

console.log("admin-shell nav icon/group checks passed");
