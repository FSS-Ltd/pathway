import { PathwayRequestContext } from "@pathway/auth";
import { AccessUsersController } from "../access-users.controller";
import { AccessUsersService } from "../access-users.service";

function createController() {
  const accessUsers = {
    getEffectivePermissions: jest.fn().mockResolvedValue({
      userId: "target-user",
      orgId: "org-1",
      tenantId: "site-1",
      permissions: [],
    }),
    getAccessSummary: jest.fn().mockResolvedValue({
      userId: "target-user",
      orgId: "org-1",
      tenantId: "site-1",
      organisationMembership: null,
      assignments: [],
      organisationCapabilities: [],
    }),
    listOwnPermissions: jest.fn().mockResolvedValue(["ace.pace.read"]),
  } as unknown as AccessUsersService;
  const requestContext = {
    requireContext: () => ({
      user: { userId: "actor-1" },
      org: { orgId: "org-1" },
      tenant: { tenantId: "site-1" },
      roles: { org: ["org:admin"], tenant: [] },
    }),
  } as unknown as PathwayRequestContext;

  return {
    accessUsers,
    controller: new AccessUsersController(accessUsers, requestContext),
  };
}

describe("AccessUsersController", () => {
  it("threads the trusted actor context and target user through to the service", async () => {
    const { accessUsers, controller } = createController();
    const request = { headers: { "x-request-id": "access-users-request-1" } };

    await controller.getEffectivePermissions(
      { userId: "5d7a71ba-7335-4aeb-a941-c8d350439f42" },
      request,
    );

    expect(accessUsers.getEffectivePermissions).toHaveBeenCalledWith(
      "5d7a71ba-7335-4aeb-a941-c8d350439f42",
      {
        orgId: "org-1",
        tenantId: "site-1",
        userId: "actor-1",
        legacyOrgRoles: ["org:admin"],
        requestId: "access-users-request-1",
      },
    );
  });

  it("returns a safe validation envelope for a non-uuid target user id", async () => {
    const { accessUsers, controller } = createController();

    await expect(
      controller.getEffectivePermissions(
        { userId: "not-a-uuid" },
        { headers: { "x-request-id": "access-users-request-invalid" } },
      ),
    ).rejects.toMatchObject({
      response: {
        statusCode: 400,
        code: "INVALID_EFFECTIVE_ACCESS_REQUEST",
        requestId: "access-users-request-invalid",
      },
    });
    expect(accessUsers.getEffectivePermissions).not.toHaveBeenCalled();
  });

  it("threads the trusted actor context and target user through to the access summary service", async () => {
    const { accessUsers, controller } = createController();
    const request = { headers: { "x-request-id": "access-summary-request-1" } };

    await controller.getAccessSummary(
      { userId: "5d7a71ba-7335-4aeb-a941-c8d350439f42" },
      request,
    );

    expect(accessUsers.getAccessSummary).toHaveBeenCalledWith(
      "5d7a71ba-7335-4aeb-a941-c8d350439f42",
      {
        orgId: "org-1",
        tenantId: "site-1",
        userId: "actor-1",
        legacyOrgRoles: ["org:admin"],
        requestId: "access-summary-request-1",
      },
    );
  });

  it("returns a safe validation envelope for a non-uuid target user id on access summary", async () => {
    const { accessUsers, controller } = createController();

    await expect(
      controller.getAccessSummary(
        { userId: "not-a-uuid" },
        { headers: { "x-request-id": "access-summary-request-invalid" } },
      ),
    ).rejects.toMatchObject({
      response: {
        statusCode: 400,
        code: "INVALID_EFFECTIVE_ACCESS_REQUEST",
        requestId: "access-summary-request-invalid",
      },
    });
    expect(accessUsers.getAccessSummary).not.toHaveBeenCalled();
  });

  it("returns the actor's own effective permissions with no target user id", async () => {
    const { accessUsers, controller } = createController();
    const request = { headers: { "x-request-id": "access-me-request-1" } };

    await expect(controller.getMyPermissions(request)).resolves.toEqual({
      orgId: "org-1",
      tenantId: "site-1",
      permissions: ["ace.pace.read"],
    });

    expect(accessUsers.listOwnPermissions).toHaveBeenCalledWith({
      orgId: "org-1",
      tenantId: "site-1",
      userId: "actor-1",
      legacyOrgRoles: ["org:admin"],
      requestId: "access-me-request-1",
    });
  });
});
