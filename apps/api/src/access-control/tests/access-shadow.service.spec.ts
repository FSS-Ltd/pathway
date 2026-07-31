import type { PermissionKey } from "@pathway/platform";
import type { StructuredLogger } from "../../common/logging/logging.service";
import type { AccessDecision } from "../access-decision.types";
import {
  AccessShadowService,
  type AccessShadowAllowListEntry,
  type AccessShadowConfig,
} from "../access-shadow.service";
import type { EffectivePermissionsService } from "../effective-permissions.service";

// Test-local fixture: exercises the comparator mechanism in isolation, not
// the real ACCESS_SHADOW_ALLOW_LIST content (which is empty until a route
// migration needs it - see access-shadow.service.ts).
const ROUTE = "GET /fixture/allow-listed-route";
const PERMISSION = "platform.access.roles.read" as PermissionKey;
const OTHER_PERMISSION = "platform.access.audit.read" as PermissionKey;
const FIXTURE_ALLOW_LIST: readonly AccessShadowAllowListEntry[] = [
  { route: ROUTE, permission: PERMISSION },
];

describe("AccessShadowService", () => {
  const resolve = jest.fn<Promise<AccessDecision>, []>();
  const info = jest.fn<void, [string, Record<string, unknown>?]>();
  const warn = jest.fn<void, [string, Record<string, unknown>?]>();
  const logger: StructuredLogger = {
    info,
    warn,
    error: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createService(config?: Partial<AccessShadowConfig>) {
    return new AccessShadowService(
      { resolve } as unknown as EffectivePermissionsService,
      logger,
      {
        enabled: true,
        allowList: FIXTURE_ALLOW_LIST,
        ...config,
      },
    );
  }

  function compare(service: AccessShadowService, legacyAllowed = true) {
    return service.compare({
      route: ROUTE,
      legacyAllowed,
      request: {
        userId: "user-should-not-be-logged",
        orgId: "org-should-not-be-logged",
        tenantId: "site-should-not-be-logged",
        permission: PERMISSION,
        now: new Date("2026-07-28T12:00:00.000Z"),
      },
    });
  }

  it("does not evaluate or emit when the shadow flag is disabled", async () => {
    const service = createService({ enabled: false });

    await expect(compare(service, true)).resolves.toBe(true);

    expect(resolve).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("does not evaluate or emit for a route outside the allow-list", async () => {
    const service = createService();

    await expect(
      service.compare({
        route: "GET /not-an-approved-route",
        legacyAllowed: false,
        request: {
          userId: "user-should-not-be-logged",
          orgId: "org-should-not-be-logged",
          tenantId: "site-should-not-be-logged",
          permission: PERMISSION,
          now: new Date("2026-07-28T12:00:00.000Z"),
        },
      }),
    ).resolves.toBe(false);

    expect(resolve).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("does not evaluate or emit when an allow-listed route has a different permission", async () => {
    const service = createService();

    await expect(
      service.compare({
        route: ROUTE,
        legacyAllowed: false,
        request: {
          userId: "user-should-not-be-logged",
          orgId: "org-should-not-be-logged",
          tenantId: "site-should-not-be-logged",
          permission: OTHER_PERMISSION,
          now: new Date("2026-07-28T12:00:00.000Z"),
        },
      }),
    ).resolves.toBe(false);

    expect(resolve).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("returns the legacy decision without telemetry when both evaluators agree", async () => {
    resolve.mockResolvedValue({
      allowed: true,
      reason: "allowed",
      sourceRoleIds: ["role-1"],
    });
    const service = createService();

    await expect(compare(service, true)).resolves.toBe(true);

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("emits one redacted drift event when the typed result disagrees", async () => {
    resolve.mockResolvedValue({
      allowed: false,
      reason: "permission-missing",
      sourceRoleIds: [],
    });
    const service = createService();

    await expect(compare(service, true)).resolves.toBe(true);

    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith("access-shadow-drift", {
      route: ROUTE,
      permission: PERMISSION,
      legacyAllowed: true,
      permissionAllowed: false,
      reason: "permission-missing",
    });
    expect(JSON.stringify(info.mock.calls[0]?.[1])).not.toContain(
      "user-should-not-be-logged",
    );
    expect(JSON.stringify(info.mock.calls[0]?.[1])).not.toContain(
      "org-should-not-be-logged",
    );
    expect(JSON.stringify(info.mock.calls[0]?.[1])).not.toContain(
      "site-should-not-be-logged",
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it("fails open to the legacy decision and emits a safe error event", async () => {
    resolve.mockRejectedValue(new Error("typed resolver unavailable"));
    const service = createService();

    await expect(compare(service, false)).resolves.toBe(false);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("access-shadow-evaluation-error", {
      route: ROUTE,
      permission: PERMISSION,
    });
    expect(JSON.stringify(warn.mock.calls[0]?.[1])).not.toContain(
      "user-should-not-be-logged",
    );
    expect(JSON.stringify(warn.mock.calls[0]?.[1])).not.toContain(
      "org-should-not-be-logged",
    );
    expect(JSON.stringify(warn.mock.calls[0]?.[1])).not.toContain(
      "site-should-not-be-logged",
    );
    expect(info).not.toHaveBeenCalled();
  });
});
