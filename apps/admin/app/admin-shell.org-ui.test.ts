/**
 * Source-text checks that AdminShell and its navigation policy wire org-ui
 * labels into nav + title.
 * Run with: node --import tsx apps/admin/app/admin-shell.org-ui.test.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

function runTests() {
  let passed = 0;
  let failed = 0;

  function check(condition: boolean, msg: string) {
    if (condition) {
      passed++;
      console.log(`  ✓ ${msg}`);
    } else {
      failed++;
      console.error(`  ✗ ${msg}`);
    }
  }

  const shellSource = readFileSync(join(__dirname, "admin-shell.tsx"), "utf8");
  const navigationSource = readFileSync(
    join(__dirname, "admin-navigation.ts"),
    "utf8",
  );
  const dictSource = readFileSync(join(__dirname, "../lib/org-ui.ts"), "utf8");

  console.log("admin-shell.tsx consumes org-ui");
  check(
    /orgLabel\(ui,\s*item\.href,\s*item\.label\)/.test(navigationSource),
    "nav items map their label through orgLabel(ui, item.href, item.label)",
  );
  check(
    /orgLabel\(ui,\s*pathname,\s*resolveTitle\(pathname\)\)/.test(shellSource),
    "page title resolves through orgLabel(ui, pathname, resolveTitle(pathname))",
  );
  check(
    /useOrgUi\(\)/.test(shellSource),
    "shell reads org context via useOrgUi()",
  );

  console.log("");
  console.log("every dictionary href exists as a real nav route in the shell");
  const hrefMatches = [...dictSource.matchAll(/"(\/[a-z-]+)":/g)].map(
    (m) => m[1],
  );
  const uniqueHrefs = [...new Set(hrefMatches)];
  check(
    uniqueHrefs.length > 0,
    "collected at least one href from org-ui.ts dictionary",
  );
  for (const href of uniqueHrefs) {
    check(
      shellSource.includes(`"${href}"`) ||
        navigationSource.includes(`"${href}"`),
      `org-ui.ts references ${href}, which appears in the admin shell navigation`,
    );
  }

  console.log("");
  console.log(`Result: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

if (
  typeof process !== "undefined" &&
  process.argv[1]?.includes("admin-shell.org-ui.test")
) {
  const ok = runTests();
  process.exit(ok ? 0 : 1);
}

export { runTests };
