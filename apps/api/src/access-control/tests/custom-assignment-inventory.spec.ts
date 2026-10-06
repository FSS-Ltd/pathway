import {
  assessCustomAssignmentCoverage,
  type InventoryRole,
} from "../custom-assignment-inventory";

const legacy: InventoryRole = {
  id: "legacy",
  name: "Legacy attendance role",
  scope: "site",
  tenantId: "site-1",
  isActive: true,
  permissionKeys: ["attendance.manage", "ace.behaviour.read"],
};

describe("custom assignment inventory coverage", () => {
  it("includes only same-site fixed roles whose raw keys cannot widen access", () => {
    const coverage = assessCustomAssignmentCoverage(legacy, [
      {
        ...legacy,
        id: "safe",
        name: "Safe",
        permissionKeys: ["attendance.manage"],
      },
      {
        ...legacy,
        id: "wide",
        name: "Wide",
        permissionKeys: ["attendance.manage", "attendance.read"],
      },
      { ...legacy, id: "other-site", name: "Other site", tenantId: "site-2" },
    ]);

    expect(coverage.fixedRoles).toEqual([
      { id: "safe", name: "Safe", permissionKeys: ["attendance.manage"] },
    ]);
    expect(coverage.accessTags).toEqual([
      { key: "attendance-recorder", permissionKeys: ["attendance.manage"] },
      { key: "behaviour-viewer", permissionKeys: ["ace.behaviour.read"] },
    ]);
    expect(coverage.uncoveredPermissionKeys).toEqual([]);
  });

  it("reports permission gaps and excludes unavailable tags", () => {
    const coverage = assessCustomAssignmentCoverage(
      {
        ...legacy,
        permissionKeys: ["platform.access.audit.read", "attendance.manage"],
      },
      [],
    );

    expect(coverage.accessTags).toEqual([
      { key: "attendance-recorder", permissionKeys: ["attendance.manage"] },
    ]);
    expect(coverage.uncoveredPermissionKeys).toEqual([
      "platform.access.audit.read",
    ]);
  });

  it("does not suggest grants for an inactive or relationship role", () => {
    for (const customRole of [
      { ...legacy, isActive: false },
      { ...legacy, scope: "relationship" as const, tenantId: null },
    ]) {
      expect(assessCustomAssignmentCoverage(customRole, [legacy])).toEqual({
        fixedRoles: [],
        accessTags: [],
        uncoveredPermissionKeys: ["ace.behaviour.read", "attendance.manage"],
      });
    }
  });
});
