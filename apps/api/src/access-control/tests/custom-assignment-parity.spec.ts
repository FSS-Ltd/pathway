import type { EffectivePermissionWithSources } from "../effective-permissions.service";
import { assessCustomAssignmentParity } from "../custom-assignment-parity";

const current: EffectivePermissionWithSources[] = [
  { permissionKey: "attendance.read", sourceRoleIds: ["custom"] },
  { permissionKey: "attendance.manage", sourceRoleIds: ["custom", "fixed"] },
  {
    permissionKey: "ace.behaviour.read",
    sourceRoleIds: ["custom"],
    sourceTagGrantIds: ["existing-tag"],
  },
];

describe("custom assignment parity", () => {
  it("preserves independent fixed-role and tag access when custom roles retire", () => {
    const result = assessCustomAssignmentParity(current, new Set(["custom"]), [
      "attendance.read",
    ]);

    expect(result).toEqual({
      before: ["ace.behaviour.read", "attendance.manage", "attendance.read"],
      after: ["ace.behaviour.read", "attendance.manage", "attendance.read"],
      gained: [],
      lost: [],
    });
  });

  it("reports both lost and widened access from an incomplete mapping", () => {
    const result = assessCustomAssignmentParity(current, new Set(["custom"]), [
      "ace.behaviour.policy.manage",
    ]);

    expect(result.gained).toEqual(["ace.behaviour.policy.manage"]);
    expect(result.lost).toEqual(["attendance.read"]);
  });
});
