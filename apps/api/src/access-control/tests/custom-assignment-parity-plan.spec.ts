import { randomUUID } from "node:crypto";
import { validateMappings } from "../custom-assignment-parity-plan";
import type { readCustomAssignmentInventory } from "../custom-assignment-parity-reader";

const siteId = randomUUID();
const userId = randomUUID();
const assignmentId = randomUUID();
const customRoleId = randomUUID();
const fixedRoleId = randomUUID();
const now = new Date("2026-10-06T12:00:00.000Z");

function inventory(): Awaited<
  ReturnType<typeof readCustomAssignmentInventory>
> {
  return {
    assignments: [
      {
        id: assignmentId,
        userId,
        tenantId: siteId,
        startsAt: now,
        expiresAt: null,
        roleDefinition: {
          id: customRoleId,
          name: "Legacy attendance",
          scope: "site",
          tenantId: siteId,
          isActive: true,
          permissions: [{ permissionKey: "attendance.manage" }],
        },
      },
    ],
    fixedRoles: [
      {
        id: fixedRoleId,
        name: "Wrong-site fixed role",
        scope: "site",
        tenantId: randomUUID(),
        isActive: true,
        permissionKeys: ["attendance.manage"],
      },
    ],
    customRoleIds: new Set([customRoleId]),
    siteIds: [siteId],
    memberIds: new Set([userId]),
    siteMemberKeys: new Set([`${userId}:${siteId}`]),
  };
}

describe("custom assignment parity plan", () => {
  it("rejects a fixed role from another site", () => {
    expect(() =>
      validateMappings(
        [{ assignmentId, fixedRoleIds: [fixedRoleId], tagKeys: [] }],
        inventory(),
      ),
    ).toThrow("Unsafe fixed-role candidate");
  });

  it("requires site membership for a replacement tag", () => {
    const state = inventory();
    state.siteMemberKeys.clear();

    expect(() =>
      validateMappings(
        [{ assignmentId, fixedRoleIds: [], tagKeys: ["attendance-recorder"] }],
        state,
      ),
    ).toThrow("Site recipient lacks site membership");
  });

  it("reports uncovered legacy permissions and requires every assignment", () => {
    const state = inventory();
    expect(() => validateMappings([], state)).toThrow("exactly once");

    const result = validateMappings(
      [{ assignmentId, fixedRoleIds: [], tagKeys: [] }],
      state,
    );
    expect(result.uncovered).toEqual([
      { assignmentId, permissionKeys: ["attendance.manage"] },
    ]);
  });
});
