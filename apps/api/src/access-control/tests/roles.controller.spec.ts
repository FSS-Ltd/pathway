import { PathwayRequestContext } from "@pathway/auth";
import { RolesController } from "../roles.controller";
import { RolesService } from "../roles.service";

const roleId = "5d7a71ba-7335-4aeb-a941-c8d350439f42";

function buildController() {
  const roles = {
    list: jest.fn().mockResolvedValue([]),
    get: jest.fn().mockResolvedValue({ id: roleId }),
    create: jest.fn(),
    update: jest.fn(),
    clone: jest.fn(),
    retire: jest.fn(),
  };
  const context = {
    requireContext: () => ({
      user: { userId: "actor-1" },
      org: { orgId: "org-1" },
      tenant: { tenantId: "site-1" },
      roles: { org: ["org:admin"], tenant: [] },
    }),
  } as unknown as PathwayRequestContext;
  return {
    roles,
    controller: new RolesController(roles as unknown as RolesService, context),
  };
}

describe("RolesController", () => {
  it("keeps historical roles readable within the trusted request context", async () => {
    const { roles, controller } = buildController();
    const request = { headers: { "x-request-id": "roles-read-1" } };

    await expect(controller.list(request)).resolves.toEqual([]);
    await expect(controller.get({ roleId }, request)).resolves.toEqual({
      id: roleId,
    });

    const actor = {
      orgId: "org-1",
      tenantId: "site-1",
      userId: "actor-1",
      legacyOrgRoles: ["org:admin"],
      requestId: "roles-read-1",
    };
    expect(roles.list).toHaveBeenCalledWith(actor);
    expect(roles.get).toHaveBeenCalledWith(roleId, actor);
  });

  it.each([
    "create",
    "update",
    "clone",
    "replacePermissions",
    "retire",
  ] as const)(
    "retires the %s write route without calling a mutation",
    (method) => {
      const { roles, controller } = buildController();
      const request = { headers: { "x-request-id": "roles-retired-1" } };

      try {
        controller[method](request);
        throw new Error("Expected a retired role route to reject the write");
      } catch (error) {
        expect(error).toMatchObject({
          response: {
            statusCode: 410,
            code: "CUSTOM_ROLES_RETIRED",
            requestId: "roles-retired-1",
          },
        });
      }
      expect(roles.create).not.toHaveBeenCalled();
      expect(roles.update).not.toHaveBeenCalled();
      expect(roles.clone).not.toHaveBeenCalled();
      expect(roles.retire).not.toHaveBeenCalled();
      expect(roles.get).not.toHaveBeenCalled();
    },
  );

  it("correlates a retired write with a generated request ID", () => {
    const { controller } = buildController();
    const request = { headers: {} };

    try {
      controller.create(request);
      throw new Error("Expected a retired role route to reject the write");
    } catch (error) {
      expect(error).toMatchObject({
        response: {
          statusCode: 410,
          code: "CUSTOM_ROLES_RETIRED",
          requestId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
        },
      });
    }
  });
});
