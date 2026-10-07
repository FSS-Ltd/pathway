import { readFileSync } from "node:fs";
import { join } from "node:path";

interface MatrixRow {
  id: string;
  method: string;
  path: string;
  capability: string;
  permission: string;
}

function parseMatrix(markdown: string): MatrixRow[] {
  return markdown
    .split("\n")
    .filter((line) => /^\| R\d+ \|/.test(line))
    .map((line) =>
      line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim().replace(/^`|`$/g, "")),
    )
    .map(([id, method, path, capability, permission]) => ({
      id,
      method,
      path,
      capability,
      permission,
    }));
}

/**
 * Every committed matrix row must appear here as either "migrated" (typed
 * checks applied, per ACE-F14) or a pending reason. Adding a row to the
 * matrix without adding it here fails the test below - the map can't grow
 * stale silently.
 */
const ROUTE_STATUS: Record<string, "migrated" | { pending: string }> = {
  R01: "migrated",
  R02: "migrated",
  R03: "migrated",
  R04: "migrated",
  R05: "migrated",
  R06: "migrated",
  R07: "migrated",
  R08: "migrated",
  R09: "migrated",
  R10: "migrated",
  R11: "migrated",
  R12: "migrated",
  R13: "migrated",
  R14: "migrated",
  R27: "migrated",
  R28: "migrated",
  R29: "migrated",
  R30: "migrated",
  R31: "migrated",
  R69: { pending: "self-scoped; no capability/permission layer by design" },
  R70: "migrated",
  R71: "migrated",
  R72: "migrated",
  R73: "migrated",
  R74: "migrated",
};

for (let n = 15; n <= 68; n += 1) {
  ROUTE_STATUS[`R${n}`] ??= { pending: "ACE-F15+ - route not built" };
}

const MATRIX_PATH = join(
  __dirname,
  "../../../../../docs/ace-vertical/01-source-and-access-matrix.md",
);

describe("access route matrix", () => {
  const markdown = readFileSync(MATRIX_PATH, "utf8");
  const rows = parseMatrix(markdown);

  it("parses at least the 68 exact routes plus two additional routes", () => {
    expect(rows.length).toBeGreaterThanOrEqual(70);
  });

  it("classifies every committed matrix row as migrated or explicitly pending", () => {
    for (const row of rows) {
      expect(ROUTE_STATUS[row.id]).toBeDefined();
    }
  });

  it("classifies the guarded ACE dashboard route as migrated", () => {
    expect(ROUTE_STATUS.R70).toBe("migrated");
  });

  it("has an identical capability and permission key for every migrated route", () => {
    for (const row of rows) {
      if (ROUTE_STATUS[row.id] !== "migrated") continue;
      expect(row.capability).toBe(row.permission);
    }
  });

  it("gives each migrated /access/* route its expected permission key", () => {
    const byId = Object.fromEntries(rows.map((row) => [row.id, row]));

    expect(byId.R01).toMatchObject({ method: "GET", path: "/access/roles", permission: "platform.access.roles.read" });
    expect(byId.R02).toMatchObject({ method: "POST", path: "/access/roles", permission: "platform.access.roles.manage" });
    expect(byId.R03).toMatchObject({ method: "GET", path: "/access/roles/:roleId", permission: "platform.access.roles.read" });
    expect(byId.R04).toMatchObject({ method: "PATCH", path: "/access/roles/:roleId", permission: "platform.access.roles.manage" });
    expect(byId.R05).toMatchObject({ method: "POST", path: "/access/roles/:roleId/clone", permission: "platform.access.roles.manage" });
    expect(byId.R06).toMatchObject({ method: "PUT", path: "/access/roles/:roleId/permissions", permission: "platform.access.roles.manage" });
    expect(byId.R07).toMatchObject({ method: "POST", path: "/access/roles/:roleId/retire", permission: "platform.access.roles.manage" });
    expect(byId.R08).toMatchObject({ method: "GET", path: "/access/permissions", permission: "platform.access.permissions.read" });
    expect(byId.R09).toMatchObject({ method: "GET", path: "/access/assignments", permission: "platform.access.assignments.read" });
    expect(byId.R10).toMatchObject({ method: "POST", path: "/access/assignments", permission: "platform.access.assignments.manage" });
    expect(byId.R11).toMatchObject({ method: "DELETE", path: "/access/assignments/:assignmentId", permission: "platform.access.assignments.manage" });
    expect(byId.R12).toMatchObject({ method: "GET", path: "/access/users/:userId/effective-permissions", permission: "platform.access.users.read" });
    expect(byId.R13).toMatchObject({ method: "GET", path: "/access/users/:userId/access-summary", permission: "platform.access.users.read" });
    expect(byId.R14).toMatchObject({ method: "GET", path: "/access/audit", permission: "platform.access.audit.read" });
  });

  it("gives the behaviour routes their registered permission keys", () => {
    const byId = Object.fromEntries(rows.map((row) => [row.id, row]));

    expect(byId.R27).toMatchObject({
      method: "GET",
      path: "/ace/behaviour",
      permission: "ace.behaviour.read",
    });
    expect(byId.R28).toMatchObject({
      method: "POST",
      path: "/ace/behaviour",
      permission: "ace.behaviour.record",
    });
    expect(byId.R29).toMatchObject({
      method: "POST",
      path: "/ace/behaviour/:id/corrections",
      permission: "ace.behaviour.record",
    });
    expect(byId.R30).toMatchObject({
      method: "GET",
      path: "/ace/behaviour/policy",
      permission: "ace.behaviour.read",
    });
    expect(byId.R31).toMatchObject({
      method: "PUT",
      path: "/ace/behaviour/policy",
      permission: "ace.behaviour.policy.manage",
    });
  });

  it("gives the ACE dashboard route its least-privilege permission key", () => {
    const byId = Object.fromEntries(rows.map((row) => [row.id, row]));

    expect(byId.R70).toMatchObject({
      method: "GET",
      path: "/ace/dashboard",
      capability: "ace.dashboard.read",
      permission: "ace.dashboard.read",
    });
  });

  it("gives core subject setup its ACE settings permissions", () => {
    const byId = Object.fromEntries(rows.map((row) => [row.id, row]));

    expect(byId.R71).toMatchObject({ method: "GET", path: "/ace/subjects", permission: "ace.settings.read" });
    expect(byId.R72).toMatchObject({ method: "POST", path: "/ace/subjects", permission: "ace.settings.manage" });
    expect(byId.R73).toMatchObject({ method: "PATCH", path: "/ace/subjects/:id", permission: "ace.settings.manage" });
    expect(byId.R74).toMatchObject({ method: "POST", path: "/ace/subjects/:id/deactivate", permission: "ace.settings.manage" });
  });
});
