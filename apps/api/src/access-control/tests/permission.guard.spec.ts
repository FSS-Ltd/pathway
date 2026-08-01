import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PathwayRequestContext } from "@pathway/auth";
import { LoggingService, type LogContext, type StructuredLogger } from "../../common/logging/logging.service";
import { AccessDecisionLogger } from "../access-decision-logger";
import type { AccessDecision } from "../access-decision.types";
import { EffectivePermissionsService } from "../effective-permissions.service";
import { PermissionGuard } from "../permission.guard";
import { RequirePermission } from "../require-permission.decorator";

// Type contract: an unknown permission key must be rejected at compile time.
// @ts-expect-error Permission decorators accept only registry-derived keys.
RequirePermission("unknown.permission");

const permission = "attendance.read" as const;

const allowedDecision: AccessDecision = {
  allowed: true,
  reason: "allowed",
  sourceRoleIds: ["role-1"],
};

const deniedDecision: AccessDecision = {
  allowed: false,
  reason: "permission-missing",
  sourceRoleIds: [],
};

type RequestContextValue = {
  user: { userId: string };
  org: { orgId: string };
  tenant: { tenantId: string };
};

function buildExecutionContext(): ExecutionContext {
  return {
    getClass: () => class AttendanceController {},
    getHandler: () => function createAttendance() {},
    switchToHttp: () => ({
      getRequest: () => ({
        headers: { "x-request-id": "request-123" },
        method: "POST",
        route: { path: "/attendance/:attendanceId" },
        body: {
          messageBody: "never log this message body",
          behaviourNote: "never log this behaviour note",
          reportNarrative: "never log this report narrative",
          childName: "never log this child PII",
        },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe("PermissionGuard", () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;
  const permissions = {
    resolve: jest.fn(),
  } as unknown as Pick<EffectivePermissionsService, "resolve">;
  const requestContext = {
    getContext: jest.fn(),
  } as unknown as Pick<PathwayRequestContext, "getContext">;
  let entries: Array<{ message: string; meta?: LogContext }>;
  let guard: PermissionGuard;

  beforeEach(() => {
    entries = [];
    (reflector.getAllAndOverride as jest.Mock).mockReset();
    (permissions.resolve as jest.Mock).mockReset();
    (requestContext.getContext as jest.Mock).mockReset();

    const logger: StructuredLogger = {
      info: (message, meta) => entries.push({ message, meta }),
      warn: jest.fn(),
      error: jest.fn(),
    };
    const logging = {
      createLogger: () => logger,
    } as unknown as LoggingService;

    guard = new PermissionGuard(
      reflector,
      permissions as EffectivePermissionsService,
      requestContext as PathwayRequestContext,
      new AccessDecisionLogger(logging),
    );
  });

  // Break caught: adding a global permission check would block routes without a requirement.
  it("allows execution when no permission metadata is defined", async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);

    await expect(guard.canActivate(buildExecutionContext())).resolves.toBe(true);
    expect(permissions.resolve).not.toHaveBeenCalled();
  });

  // Break caught: a guard that treats missing trusted auth context as authorised exposes protected routes.
  it("denies a required permission when the request context is absent", async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(permission);
    (requestContext.getContext as jest.Mock).mockReturnValue(null);

    await expect(guard.canActivate(buildExecutionContext())).rejects.toThrow(
      ForbiddenException,
    );
    expect(entries).toEqual([
      {
        message: "access-decision",
        meta: {
          capability: permission,
          decision: "denied",
          permission,
          reason: "tenant-denied",
          requestId: "request-123",
          route: "POST /attendance/:attendanceId",
          sourceRoleIds: [],
        },
      },
    ]);
  });

  // Break caught: a context with no active organisation reached resolve() with an
  // empty orgId, which crashed withOrgRlsContext with an uncaught 500 instead of a 403.
  it("denies a required permission when the context has no active organisation, without calling resolve", async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(permission);
    (requestContext.getContext as jest.Mock).mockReturnValue({
      user: { userId: "actor-789" },
      org: { orgId: "" },
      tenant: { tenantId: "" },
    });

    await expect(guard.canActivate(buildExecutionContext())).rejects.toThrow(
      ForbiddenException,
    );
    expect(permissions.resolve).not.toHaveBeenCalled();
  });

  // Break caught: a positive resolver decision that is not honoured blocks authorised staff actions.
  it("continues when the effective permission decision allows the request", async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(permission);
    (requestContext.getContext as jest.Mock).mockReturnValue(contextValue());
    (permissions.resolve as jest.Mock).mockResolvedValue(allowedDecision);

    await expect(guard.canActivate(buildExecutionContext())).resolves.toBe(true);
    expect(permissions.resolve).toHaveBeenCalledWith({
      userId: "actor-789",
      orgId: "org-123",
      tenantId: "site-456",
      permission,
      now: expect.any(Date),
    });
  });

  // Break caught: a negative resolver decision that reaches a handler exposes a route without permission.
  it("returns a safe 403 when the effective permission decision denies the request", async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(permission);
    (requestContext.getContext as jest.Mock).mockReturnValue(contextValue());
    (permissions.resolve as jest.Mock).mockResolvedValue(deniedDecision);

    await expect(guard.canActivate(buildExecutionContext())).rejects.toMatchObject({
      response: {
        error: "Forbidden",
        message: "Permission denied",
        statusCode: 403,
      },
      status: 403,
    });
  });

  // Break caught: including request payloads in decision telemetry leaks sensitive record content.
  it("logs only redacted decision metadata for denied access", async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(permission);
    (requestContext.getContext as jest.Mock).mockReturnValue(contextValue());
    (permissions.resolve as jest.Mock).mockResolvedValue(deniedDecision);

    await expect(guard.canActivate(buildExecutionContext())).rejects.toThrow(
      ForbiddenException,
    );
    expect(entries).toEqual([
      {
        message: "access-decision",
        meta: {
          actorUserId: "actor-789",
          capability: permission,
          decision: "denied",
          orgId: "org-123",
          permission,
          reason: "permission-missing",
          requestId: "request-123",
          route: "POST /attendance/:attendanceId",
          sourceRoleIds: [],
          tenantId: "site-456",
        },
      },
    ]);
  });
});

function contextValue(): RequestContextValue {
  return {
    user: { userId: "actor-789" },
    org: { orgId: "org-123" },
    tenant: { tenantId: "site-456" },
  };
}
