import { PathwayRequestContext } from "@pathway/auth";
import { AccessPermissionsController } from "../access-permissions.controller";
import { AccessPermissionsService } from "../access-permissions.service";

function createController() {
  const permissions = {
    listDelegableKeys: jest.fn().mockResolvedValue(["ace.pace.read"]),
  } as unknown as AccessPermissionsService;
  const requestContext = {
    requireContext: () => ({
      user: { userId: "actor-1" },
      org: { orgId: "org-1" },
      tenant: { tenantId: "site-1" },
      roles: { org: ["org:admin"], tenant: [] },
    }),
  } as unknown as PathwayRequestContext;

  return {
    permissions,
    controller: new AccessPermissionsController(permissions, requestContext),
  };
}

describe("AccessPermissionsController", () => {
  it("returns the actor's delegable keys wrapped in a stable envelope", async () => {
    const { permissions, controller } = createController();
    const request = { headers: { "x-request-id": "access-permissions-request-1" } };

    await expect(controller.listDelegable(request)).resolves.toEqual({
      delegableKeys: ["ace.pace.read"],
    });
    expect(permissions.listDelegableKeys).toHaveBeenCalledWith({
      orgId: "org-1",
      tenantId: "site-1",
      userId: "actor-1",
      legacyOrgRoles: ["org:admin"],
      requestId: "access-permissions-request-1",
    });
  });
});
