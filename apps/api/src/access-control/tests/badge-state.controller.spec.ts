import { REQUIRED_PERMISSION } from "../require-permission.decorator";
import { BadgeStateController } from "../badge-state.controller";

describe("BadgeStateController", () => {
  it("requires assignment management for mutations", () => {
    const permission = Reflect.getMetadata(
      REQUIRED_PERMISSION,
      BadgeStateController.prototype.set,
    );
    expect(permission).toBe("platform.access.assignments.manage");
  });
});
