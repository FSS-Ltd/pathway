import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  EMPTY_ROLE_SET,
  PathwayRequestContext,
  UserTenantRole,
} from "@pathway/auth";
import { SafeguardingGuard } from "./safeguarding.guard";
import { EffectivePermissionsService } from "../../access-control/effective-permissions.service";

const buildExecutionContext = (method = "GET"): ExecutionContext =>
  ({
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ method }) }),
  }) as ExecutionContext;

describe("SafeguardingGuard", () => {
  let guard: SafeguardingGuard;
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;

  const requestContext = {
    roles: { ...EMPTY_ROLE_SET, tenant: [UserTenantRole.TEACHER] },
    getContext: jest.fn(),
  } as unknown as PathwayRequestContext;
  const permissions = {
    resolve: jest.fn(),
  } as unknown as EffectivePermissionsService;

  beforeEach(() => {
    (reflector.getAllAndOverride as jest.Mock).mockReset();
    (requestContext.getContext as jest.Mock).mockReset();
    (permissions.resolve as jest.Mock).mockReset();
    (requestContext as { roles: typeof EMPTY_ROLE_SET }).roles = {
      ...EMPTY_ROLE_SET,
      tenant: [UserTenantRole.TEACHER],
    };
    guard = new SafeguardingGuard(reflector, requestContext, permissions);
  });

  it("allows execution when no metadata is defined", async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);
    await expect(guard.canActivate(buildExecutionContext())).resolves.toBe(
      true,
    );
  });

  it("allows when user has at least one required role", async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({
      tenantRoles: [UserTenantRole.TEACHER],
    });
    await expect(guard.canActivate(buildExecutionContext())).resolves.toBe(
      true,
    );
  });

  it("throws Forbidden when user lacks required roles", async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({
      tenantRoles: [UserTenantRole.ADMIN],
    });
    await expect(guard.canActivate(buildExecutionContext())).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("allows a scoped superuser only when effective access confirms the grant", async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({
      tenantRoles: [UserTenantRole.ADMIN],
    });
    (requestContext.getContext as jest.Mock).mockReturnValue({
      user: { userId: "user-1", isSuperUser: true },
      org: { orgId: "org-1" },
      tenant: { tenantId: "site-1", orgId: "org-1" },
    });
    (permissions.resolve as jest.Mock).mockResolvedValue({
      allowed: true,
      sourceSuperUser: true,
    });

    await expect(guard.canActivate(buildExecutionContext("GET"))).resolves.toBe(
      true,
    );
    expect(permissions.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ permission: "safeguarding.concerns.read" }),
    );
    await expect(
      guard.canActivate(buildExecutionContext("PATCH")),
    ).resolves.toBe(true);
    expect(permissions.resolve).toHaveBeenLastCalledWith(
      expect.objectContaining({ permission: "safeguarding.concerns.manage" }),
    );
  });

  it("rejects a superuser when the effective permission is unavailable", async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({
      tenantRoles: [UserTenantRole.ADMIN],
    });
    (requestContext.getContext as jest.Mock).mockReturnValue({
      user: { userId: "user-1", isSuperUser: true },
      org: { orgId: "org-1" },
      tenant: { tenantId: "site-1", orgId: "org-1" },
    });
    (permissions.resolve as jest.Mock).mockResolvedValue({ allowed: false });

    await expect(guard.canActivate(buildExecutionContext())).rejects.toThrow(
      ForbiddenException,
    );
  });
});
