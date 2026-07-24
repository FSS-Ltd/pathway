/**
 * Unit tests for org-ui.ts.
 * Run with: node --import tsx apps/admin/lib/org-ui.test.ts
 */

import assert from "node:assert/strict";
import { resolveOrgUiKey, resolveOrgUi, orgLabel } from "./org-ui";

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

  console.log("resolveOrgUiKey");
  check(resolveOrgUiKey("ACE_SCHOOL", "SCHOOL") === "ACE_SCHOOL", "vertical beats sector");
  check(resolveOrgUiKey(null, "CHURCH") === "CHURCH", "falls back to sector: CHURCH");
  check(resolveOrgUiKey(null, "CLUB") === "CLUB", "falls back to sector: CLUB");
  check(resolveOrgUiKey(null, "CHARITY") === "CHARITY", "falls back to sector: CHARITY");
  check(resolveOrgUiKey(null, "SCHOOL") === "SCHOOL", "sector SCHOOL has no single vertical, keeps its own key");
  check(resolveOrgUiKey(null, null) === "UNKNOWN", "neither field -> UNKNOWN");
  check(resolveOrgUiKey(undefined, undefined) === "UNKNOWN", "undefined fields -> UNKNOWN");

  console.log("");
  console.log("church labels");
  const church = resolveOrgUi("CHURCH", null);
  check(orgLabel(church, "/sessions", "Sessions & Rota") === "Services & Rotas", "/sessions -> Services & Rotas");
  check(orgLabel(church, "/children", "Children") === "Children & Youth", "/children -> Children & Youth");
  check(
    orgLabel(church, "/children/abc123", "Children") === "Children & Youth",
    "/children/:id falls back to the /children segment",
  );
  check(orgLabel(church, "/guest-pass", "Guest pass") === "Visitor check-in", "/guest-pass -> Visitor check-in");
  check(orgLabel(church, "/classes", "Classes") === "Ministry groups", "/classes -> Ministry groups");
  check(orgLabel(church, "/attendance", "Attendance") === "Attendance", "unmapped route returns the fallback");

  console.log("");
  console.log("other contexts (spot checks)");
  const nursery = resolveOrgUi("NURSERY", null);
  check(orgLabel(nursery, "/parents", "Parents & Guardians") === "Families", "nursery /parents -> Families");
  check(orgLabel(nursery, "/classes", "Classes") === "Rooms", "nursery /classes -> Rooms");

  const charity = resolveOrgUi("CHARITY", null);
  check(orgLabel(charity, "/children", "Children") === "Participants", "charity /children -> Participants");
  check(orgLabel(charity, "/sessions", "Sessions & Rota") === "Activities", "charity /sessions -> Activities");

  const club = resolveOrgUi("CLUB", null);
  check(orgLabel(club, "/children", "Children") === "Members", "club /children -> Members");

  const ace = resolveOrgUi("ACE_SCHOOL", null);
  check(orgLabel(ace, "/lessons", "Lessons") === "PACE work", "ACE /lessons -> PACE work");

  const stateSchool = resolveOrgUi("STATE_SCHOOL", null);
  check(orgLabel(stateSchool, "/children", "Children") === "Pupils", "state school /children -> Pupils");
  check(
    orgLabel(stateSchool, "/parents", "Parents & Guardians") === "Parents & Carers",
    "state school /parents -> Parents & Carers",
  );

  console.log("");
  console.log("UNKNOWN (loading / failure / no org data)");
  const unknown = resolveOrgUi(null, null);
  const probes = ["/", "/children", "/parents", "/classes", "/lessons", "/sessions", "/guest-pass"];
  check(
    probes.every((path) => orgLabel(unknown, path, `fallback:${path}`) === `fallback:${path}`),
    "every probed path returns its fallback unchanged",
  );

  console.log("");
  console.log("policy object can never grant access");
  const allKeys: Array<[unknown, unknown]> = [
    ["CHURCH", null],
    ["CLUB", null],
    ["CHARITY", null],
    ["INDEPENDENT_SCHOOL", null],
    ["ACE_SCHOOL", null],
    ["STATE_SCHOOL", null],
    ["NURSERY", null],
    [null, "SCHOOL"],
    [null, null],
  ];
  check(
    allKeys.every(([v, s]) => {
      const ui = resolveOrgUi(v as any, s as any);
      return Object.keys(ui).length === 1 && Object.keys(ui)[0] === "labels";
    }),
    "every resolved OrgUi has exactly one field: labels",
  );

  console.log("");
  console.log(`Result: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

if (typeof process !== "undefined" && process.argv[1]?.includes("org-ui.test")) {
  const ok = runTests();
  process.exit(ok ? 0 : 1);
}

export { runTests };
