import { PathwayRequestContext } from "@pathway/auth";
import { HttpStatus } from "@nestjs/common";
import { RolesController } from "../roles.controller";
import { roleApiError } from "../role-api-error";
import { RolesService } from "../roles.service";

describe("RolesController", () => {
  it("takes actor identity and organisation only from the trusted request context", async () => {
    const roles = { create: jest.fn().mockResolvedValue({ id: "role-1" }) } as unknown as RolesService;
    const context = {
      requireContext: () => ({
        user: { userId: "actor-1" },
        org: { orgId: "org-1" },
        tenant: { tenantId: "site-1" },
        roles: { org: ["org:admin"], tenant: [] },
      }),
    } as unknown as PathwayRequestContext;
    const controller = new RolesController(roles, context);
    const request = {
      headers: { "x-request-id": ["roles-request-1", "ignored-request-id"] },
    };

    await expect(controller.create({
      name: "PACE Staff",
      scope: "site",
      permissionKeys: ["ace.pace.read"],
    }, request)).resolves.toEqual({ id: "role-1" });

    expect(roles.create).toHaveBeenCalledWith(
      { name: "PACE Staff", scope: "site", permissionKeys: ["ace.pace.read"] },
      {
        orgId: "org-1", tenantId: "site-1", userId: "actor-1",
        legacyOrgRoles: ["org:admin"],
        requestId: "roles-request-1",
      },
    );

    await expect(controller.create({
      name: "PACE Staff",
      scope: "site",
      permissionKeys: ["ace.pace.read"],
      orgId: "attacker-org",
    }, request)).rejects.toMatchObject({
      response: {
        statusCode: 400,
        code: "INVALID_ROLE_REQUEST",
        message: "The role request is invalid.",
        requestId: "roles-request-1",
      },
    });
    expect(roles.create).toHaveBeenCalledTimes(1);
  });

  it("routes permission replacement through the read and managed update service boundaries", async () => {
    const roles = {
      get: jest.fn().mockResolvedValue({ name: "PACE Staff", description: null }),
      update: jest.fn().mockResolvedValue({ id: "role-1" }),
    } as unknown as RolesService;
    const context = {
      requireContext: () => ({
        user: { userId: "actor-1" },
        org: { orgId: "org-1" },
        tenant: { tenantId: "site-1" },
        roles: { org: ["org:admin"], tenant: [] },
      }),
    } as unknown as PathwayRequestContext;
    const controller = new RolesController(roles, context);
    const roleId = "5d7a71ba-7335-4aeb-a941-c8d350439f42";
    const request = { headers: { "x-request-id": "roles-request-2" } };
    const trustedActor = {
      orgId: "org-1", tenantId: "site-1", userId: "actor-1",
      legacyOrgRoles: ["org:admin"],
      requestId: "roles-request-2",
    };

    await expect(controller.replacePermissions(
      { roleId },
      { expectedVersion: 2, permissionKeys: ["ace.pace.read"] },
      request,
    )).resolves.toEqual({ id: "role-1" });

    expect(roles.get).toHaveBeenCalledWith(roleId, trustedActor);
    expect(roles.update).toHaveBeenCalledWith({
      roleId,
      expectedVersion: 2,
      name: "PACE Staff",
      description: undefined,
      permissionKeys: ["ace.pace.read"],
    }, trustedActor);
  });

  it("reuses one generated request ID when the inbound header is absent", async () => {
    const roles = { create: jest.fn().mockResolvedValue({ id: "role-1" }) } as unknown as RolesService;
    const context = {
      requireContext: () => ({
        user: { userId: "actor-1" },
        org: { orgId: "org-1" },
        tenant: { tenantId: "site-1" },
        roles: { org: ["org:admin"], tenant: [] },
      }),
    } as unknown as PathwayRequestContext;
    const controller = new RolesController(roles, context);
    const request = { headers: {} };

    await controller.create({
      name: "PACE Staff",
      scope: "site",
      permissionKeys: ["ace.pace.read"],
    }, request);
    const actor = (roles.create as jest.Mock).mock.calls[0][1];

    await expect(controller.create({
      name: "PACE Staff",
      scope: "site",
      permissionKeys: ["ace.pace.read"],
      orgId: "attacker-org",
    }, request)).rejects.toMatchObject({
      response: { requestId: actor.requestId },
    });
    expect(actor.requestId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("preserves the safe request-correlated role-name conflict envelope", async () => {
    const roles = {
      create: jest.fn().mockRejectedValue(
        roleApiError(
          HttpStatus.CONFLICT,
          "ROLE_NAME_CONFLICT",
          "roles-request-conflict",
        ),
      ),
    } as unknown as RolesService;
    const context = {
      requireContext: () => ({
        user: { userId: "actor-1" },
        org: { orgId: "org-1" },
        tenant: { tenantId: "site-1" },
        roles: { org: ["org:admin"], tenant: [] },
      }),
    } as unknown as PathwayRequestContext;
    const controller = new RolesController(roles, context);

    await expect(controller.create({
      name: "Duplicate Role",
      scope: "site",
      permissionKeys: ["ace.pace.read"],
    }, {
      headers: { "x-request-id": "roles-request-conflict" },
    })).rejects.toMatchObject({
      response: {
        statusCode: 409,
        code: "ROLE_NAME_CONFLICT",
        message: "A role with this name already exists in this scope.",
        requestId: "roles-request-conflict",
      },
    });
  });
});
