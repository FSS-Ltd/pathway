import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  EMPTY_ROLE_SET,
  PathwayRequestContext,
  UserTenantRole,
} from "@pathway/auth";
import { SafeguardingGuard } from "./safeguarding.guard";

const buildExecutionContext = (): ExecutionContext =>
  ({
    getHandler: () => ({}),
    getClass: () => ({}),
  }) as ExecutionContext;

describe("SafeguardingGuard", () => {
  let guard: SafeguardingGuard;
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;

  const requestContext = {
    roles: { ...EMPTY_ROLE_SET, tenant: [UserTenantRole.TEACHER] },
  } as unknown as PathwayRequestContext;

  beforeEach(() => {
    (reflector.getAllAndOverride as jest.Mock).mockReset();
    (requestContext as { roles: typeof EMPTY_ROLE_SET }).roles = {
      ...EMPTY_ROLE_SET,
      tenant: [UserTenantRole.TEACHER],
    };
    guard = new SafeguardingGuard(reflector, requestContext);
  });

  it("allows execution when no metadata is defined", () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);
    expect(guard.canActivate(buildExecutionContext())).toBe(true);
  });

  it("allows when user has at least one required role", () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({
      tenantRoles: [UserTenantRole.TEACHER],
    });
    expect(guard.canActivate(buildExecutionContext())).toBe(true);
  });

  it("throws Forbidden when user lacks required roles", () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({
      tenantRoles: [UserTenantRole.ADMIN],
    });
    expect(() => guard.canActivate(buildExecutionContext())).toThrow(
      ForbiddenException,
    );
  });
});

